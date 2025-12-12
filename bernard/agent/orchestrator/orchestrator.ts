import { SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";

import type { IntentHarness, IntentInput, IntentOutput } from "../harness/intent/intent.harness";
import type { MemoryHarness, MemoryInput, MemoryOutput } from "../harness/memory/memory.harness";
import type { ResponseHarness, ResponseInput, ResponseOutput } from "../harness/respond/respond.harness";
import type { UtilityHarness } from "../harness/utility/utility.harness";
import type { HarnessContext, HarnessResult, HarnessConfig, ConversationThread } from "../harness/lib/types";
import { buildConversationThread } from "../record-keeper/record-keeper";
import type { RecordKeeper } from "@/lib/conversation/recordKeeper";
import { contentFromMessage } from "@/lib/conversation/messages";
import { childLogger, logger, startTimer, toErrorObject } from "@/lib/logging";

const RESPOND_TOOL_NAME = "respond";

/**
 * Determine whether a message represents a respond tool invocation.
 */
function isRespondToolCall(message: BaseMessage): boolean {
  const toolCalls = (message as { tool_calls?: unknown }).tool_calls;
  if (Array.isArray(toolCalls)) {
    for (const call of toolCalls) {
      const fn = (call as { function?: { name?: string } }).function;
      const name = (call as { name?: string }).name ?? fn?.name;
      if (name === RESPOND_TOOL_NAME) return true;
    }
  }
  const legacyFn = (message as { function_call?: { name?: string } }).function_call;
  if (legacyFn?.name === RESPOND_TOOL_NAME) return true;
  const messageType = (message as { _getType?: () => string })._getType?.();
  if (messageType === "tool") {
    const name = (message as { name?: string }).name ?? (message as { tool_call_id?: string }).tool_call_id;
    return name === RESPOND_TOOL_NAME;
  }
  return false;
}

/**
 * Determine whether a message is empty or whitespace only.
 */
function isBlankMessage(message: BaseMessage): boolean {
  const content = contentFromMessage(message);
  return !content || !content.trim();
}

/**
 * Remove respond tool calls and empty messages to form response context.
 */
function filterMessagesForResponseContext(messages: BaseMessage[]): BaseMessage[] {
  return messages.filter((message) => !isRespondToolCall(message) && !isBlankMessage(message));
}

export type OrchestratorRunInput = {
  conversationId: string;
  incoming: BaseMessage[];
  persistable?: BaseMessage[];
  intentInput?: IntentInput;
  memoryInput?: MemoryInput;
  persistInitial?: boolean;
  requestId?: string;
  turnId?: string;
};

export type OrchestratorResult = {
  intent: IntentOutput;
  memories: MemoryOutput;
  response: ResponseOutput;
};

export class Orchestrator {
  private readonly log = childLogger({ component: "orchestrator" }, logger);

  constructor(
    private readonly recordKeeper: RecordKeeper | null,
    private readonly config: HarnessConfig,
    private readonly intent: IntentHarness,
    private readonly memory: MemoryHarness,
    private readonly respond: ResponseHarness,
    private readonly utility: UtilityHarness
  ) {}

  /**
   * Run the full orchestration loop: intent → memory → respond, persisting
   * conversation deltas and bubbling errors after logging.
   */
  async run(input: OrchestratorRunInput): Promise<OrchestratorResult> {
    const runLogger = childLogger(
      {
        conversationId: input.conversationId,
        requestId: input.requestId,
        turnId: input.turnId,
        component: "orchestrator"
      },
      this.log
    );
    const elapsed = startTimer();
    runLogger.info({
      event: "orchestrator.run.start",
      incomingMessages: input.incoming.length,
      persistable: input.persistable?.length ?? 0
    });
    const { persistable, conversation: initialConversation } = this.buildInitialConversation(input);
    let conversation = initialConversation;

    await this.persistInitialMessages(input, persistable);

    let ctx = this.buildBaseContext(conversation, input);

    try {
      const [intentRes, memoryRes] = await this.runHarnesses(ctx, input);

      ({ conversation, ctx } = await this.applyIntentDelta(conversation, ctx, intentRes, input));

      const responseCtx = this.buildResponseContext(conversation, ctx);
      const responseRes = await this.respond.run(
        {
          intent: intentRes.output,
          memories: memoryRes.output,
          availableTools: this.intent.availableTools,
          disabledTools: this.intent.disabledTools
        } satisfies ResponseInput,
        responseCtx
      );

      await this.persistResponseMessage(input, responseRes);

      runLogger.info({
        event: "orchestrator.run.success",
        durationMs: elapsed(),
        responseTokens: responseRes.output.message ? contentFromMessage(responseRes.output.message)?.length ?? 0 : 0,
        intentTurns: intentRes.output.transcript.length,
        responsePreview: responseRes.output?.text?.slice(0, 160)
      });
      return {
        intent: intentRes.output,
        memories: memoryRes.output,
        response: responseRes.output
      };
    } catch (err) {
      runLogger.error({
        event: "orchestrator.run.error",
        durationMs: elapsed(),
        err: toErrorObject(err)
      });
      await this.handleError(input, err);
      throw err;
    }
  }

  private buildInitialConversation(input: OrchestratorRunInput): {
    persistable: BaseMessage[];
    conversation: ConversationThread;
  } {
    const initialTurns = input.incoming.filter((msg) => (msg as { _getType?: () => string })._getType?.() !== "system");
    const persistable = (input.persistable ?? initialTurns).filter(
      (msg) => (msg as { _getType?: () => string })._getType?.() !== "system"
    );
    const conversation = buildConversationThread(initialTurns);
    return { persistable, conversation };
  }

  private async persistInitialMessages(input: OrchestratorRunInput, persistable: BaseMessage[]): Promise<void> {
    if (!this.recordKeeper) return;
    if (input.persistInitial === false) return;
    if (!persistable.length) return;
    await this.recordKeeper.appendMessages(input.conversationId, persistable);
  }

  private buildBaseContext(conversation: ConversationThread, input: OrchestratorRunInput): HarnessContext {
    const base: HarnessContext = {
      conversation,
      config: this.config,
      conversationId: input.conversationId,
      now: () => new Date()
    };
    if (input.requestId) base.requestId = input.requestId;
    if (input.turnId) base.turnId = input.turnId;
    if (this.recordKeeper) base.recordKeeper = this.recordKeeper;
    return base;
  }

  private runHarnesses(
    ctx: HarnessContext,
    input: OrchestratorRunInput
  ): Promise<[HarnessResult<IntentOutput>, HarnessResult<MemoryOutput>]> {
    return Promise.all([
      this.intent.run(input.intentInput ?? {}, ctx),
      this.memory.run(input.memoryInput ?? {}, ctx)
    ]);
  }

  private async applyIntentDelta(
    conversation: ConversationThread,
    ctx: HarnessContext,
    intentRes: HarnessResult<IntentOutput>,
    input: OrchestratorRunInput
  ): Promise<{ conversation: ConversationThread; ctx: HarnessContext }> {
    const intentDelta = intentRes.output.transcript.slice(conversation.turns.length).filter(
      (msg) => (msg as { _getType?: () => string })._getType?.() !== "system"
    );

    if (this.recordKeeper && intentDelta.length) {
      await this.recordKeeper.appendMessages(input.conversationId, intentDelta);
    }

    if (!intentDelta.length) {
      return { conversation, ctx };
    }

    const updatedConversation = buildConversationThread([...conversation.turns, ...intentDelta]);
    const updatedCtx = { ...ctx, conversation: updatedConversation };
    return { conversation: updatedConversation, ctx: updatedCtx };
  }

  private buildResponseContext(conversation: ConversationThread, ctx: HarnessContext): HarnessContext {
    const responseConversation = buildConversationThread(filterMessagesForResponseContext(conversation.turns));
    return { ...ctx, conversation: responseConversation };
  }

  private async persistResponseMessage(
    input: OrchestratorRunInput,
    responseRes: HarnessResult<ResponseOutput>
  ): Promise<void> {
    if (!this.recordKeeper) return;
    if (!responseRes.output?.message) return;
    await this.recordKeeper.appendMessages(input.conversationId, [responseRes.output.message]);
  }

  private async handleError(input: OrchestratorRunInput, err: unknown): Promise<void> {
    if (!this.recordKeeper) return;
    const errorText = err instanceof Error ? err.message : String(err);
    const errorMessage = new SystemMessage({
      content: `Orchestration failed: ${errorText}`,
      name: "orchestrator.error"
    });
    (errorMessage as { response_metadata?: Record<string, unknown> }).response_metadata = {
      traceType: "error",
      errorStage: "orchestrator",
      errorMessage: errorText
    };
    await this.recordKeeper.appendMessages(input.conversationId, [errorMessage]);
  }
}


