import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";

import { parseToolInput, safeStringify } from "@/lib/messages";
import { buildIntentSystemPrompt } from "./prompts";
import type { Harness, HarnessContext, HarnessResult, LLMCaller, ToolCall } from "../lib/types";

export type IntentInput = {
  messageText?: string;
};

export type IntentTool = {
  name: string;
  description?: string;
  schema?: unknown;
  invoke: (input: Record<string, unknown>) => Promise<unknown>;
  verifyConfiguration?: () => { ok: boolean; reason?: string };
};

export type IntentOutput = {
  transcript: BaseMessage[];
  toolCalls: ToolCall[];
  done: boolean;
};

type DisabledTool = { name: string; reason?: string };

function partitionTools(tools: IntentTool[]): { available: IntentTool[]; disabled: DisabledTool[] } {
  const available: IntentTool[] = [];
  const disabled: DisabledTool[] = [];
  for (const tool of tools) {
    if (tool.verifyConfiguration) {
      try {
        const verify = tool.verifyConfiguration();
        if (!verify?.ok) {
          disabled.push({ name: tool.name, reason: verify?.reason });
          continue;
        }
      } catch (err) {
        disabled.push({ name: tool.name, reason: err instanceof Error ? err.message : String(err) });
        continue;
      }
    }
    available.push(tool);
  }
  return { available, disabled };
}

function normalizeArgs(raw: unknown): Record<string, unknown> {
  const parsed = parseToolInput(raw);
  if (parsed === undefined) return {};
  if (parsed === null) return {};
  if (typeof parsed === "object") return parsed as Record<string, unknown>;
  return { value: parsed };
}

function extractCallArgs(call: ToolCall): unknown {
  return (
    call.function?.arguments ??
    call.function?.args ??
    call.function?.input ??
    call.arguments ??
    call.args ??
    call.input ??
    (call as { parameters?: unknown }).parameters
  );
}

function toToolMessage(call: ToolCall, result: unknown) {
  return new ToolMessage({
    tool_call_id: call.id,
    name: call.name,
    content: typeof result === "string" ? result : safeStringify(result)
  });
}

export class IntentHarness implements Harness<IntentInput, IntentOutput> {
  private readonly tools: IntentTool[];
  private readonly disabledTools: DisabledTool[];
  private readonly llm: LLMCaller;
  private readonly maxIterations: number;

  constructor(llm: LLMCaller, tools: IntentTool[], maxIterations = 4) {
    this.llm = llm;
    const { available, disabled } = partitionTools(tools);
    this.tools = available;
    this.disabledTools = disabled;
    this.maxIterations = maxIterations;
  }

  async run(input: IntentInput, ctx: HarnessContext): Promise<HarnessResult<IntentOutput>> {
    const transcript: BaseMessage[] = [...ctx.conversation.turns];
    if (input.messageText) {
      transcript.push(new HumanMessage({ content: input.messageText }));
    }

    const toolMap = new Map(this.tools.map((tool) => [tool.name, tool]));
    let lastToolCalls: ToolCall[] = [];

    for (let i = 0; i < (ctx.config.maxIntentIterations ?? this.maxIterations); i++) {
      const intentPrompt = [
        new SystemMessage(buildIntentSystemPrompt(ctx.now(), this.disabledTools)),
        ...transcript
      ];
      const res = await this.llm.call({
        model: ctx.config.intentModel,
        messages: intentPrompt,
        tools: this.tools,
        meta: {
          conversationId: ctx.conversationId,
          requestId: ctx.requestId,
          turnId: ctx.turnId,
          recordKeeper: ctx.recordKeeper,
          traceName: "intent"
        }
      });

      transcript.push(res.message);
      lastToolCalls = res.toolCalls ?? [];

      const trimmed = res.text.trim();
      const hasTools = lastToolCalls.length > 0;

      // If no tools were requested, treat this as a handoff without persisting the assistant text.
      if (!hasTools) {
        // Remove the just-added assistant message to avoid duplicating content in history.
        transcript.pop();
        return { output: { transcript, toolCalls: [], done: true }, done: true };
      }

      for (const call of lastToolCalls) {
        const tool = toolMap.get(call.name);
        const args = normalizeArgs(extractCallArgs(call));
        if (!tool) {
          transcript.push(
            new ToolMessage({
              tool_call_id: call.id,
              name: call.name,
              content: `Tool ${call.name} unavailable`
            })
          );
          continue;
        }
        try {
          const result = await tool.invoke(args);
          transcript.push(toToolMessage(call, result));
        } catch (err) {
          transcript.push(
            new ToolMessage({
              tool_call_id: call.id,
              name: call.name,
              content: `Tool ${call.name} failed: ${err instanceof Error ? err.message : String(err)}`
            })
          );
        }
      }
    }

    return { output: { transcript, toolCalls: lastToolCalls, done: true }, done: true };
  }
}


