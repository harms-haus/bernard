import type { BaseMessage } from "@langchain/core/messages";

import type { IntentHarness, IntentInput, IntentOutput } from "../harness/intent/intent.harness";
import type { MemoryHarness, MemoryInput, MemoryOutput } from "../harness/memory/memory.harness";
import type { ResponseHarness, ResponseInput, ResponseOutput } from "../harness/respond/respond.harness";
import type { UtilityHarness } from "../harness/utility/utility.harness";
import type { HarnessContext, HarnessResult, HarnessConfig, ConversationThread } from "../harness/lib/types";
import { buildConversationThread } from "../record-keeper/record-keeper";
import type { RecordKeeper } from "@/lib/recordKeeper";

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
  constructor(
    private readonly recordKeeper: RecordKeeper | null,
    private readonly config: HarnessConfig,
    private readonly intent: IntentHarness,
    private readonly memory: MemoryHarness,
    private readonly respond: ResponseHarness,
    private readonly utility: UtilityHarness
  ) {}

  async run(input: OrchestratorRunInput): Promise<OrchestratorResult> {
    const initialTurns = input.incoming.filter((msg) => (msg as { _getType?: () => string })._getType?.() !== "system");
    let conversation = buildConversationThread(initialTurns);
    const persistable = (input.persistable ?? initialTurns).filter(
      (msg) => (msg as { _getType?: () => string })._getType?.() !== "system"
    );
    if (this.recordKeeper && input.persistInitial !== false && persistable.length) {
      await this.recordKeeper.appendMessages(input.conversationId, persistable);
    }

    let ctx: HarnessContext = {
      conversation,
      config: this.config,
      conversationId: input.conversationId,
      requestId: input.requestId,
      turnId: input.turnId,
      recordKeeper: this.recordKeeper ?? undefined,
      now: () => new Date()
    };

    const [intentRes, memoryRes] = await Promise.all([
      this.intent.run(input.intentInput ?? {}, ctx),
      this.memory.run(input.memoryInput ?? {}, ctx)
    ]);

    // Persist intent transcript deltas (assistant tool_calls + tool results) and refresh context
    const intentDelta = intentRes.output.transcript.slice(conversation.turns.length).filter(
      (msg) => (msg as { _getType?: () => string })._getType?.() !== "system"
    );
    if (this.recordKeeper && intentDelta.length) {
      await this.recordKeeper.appendMessages(input.conversationId, intentDelta);
    }
    if (intentDelta.length) {
      conversation = buildConversationThread([...conversation.turns, ...intentDelta]);
      ctx = { ...ctx, conversation };
    }

    const responseRes = await this.respond.run(
      { intent: intentRes.output, memories: memoryRes.output } satisfies ResponseInput,
      ctx
    );

    if (this.recordKeeper && responseRes.output?.message) {
      await this.recordKeeper.appendMessages(input.conversationId, [responseRes.output.message]);
    }

    return {
      intent: intentRes.output,
      memories: memoryRes.output,
      response: responseRes.output
    };
  }
}


