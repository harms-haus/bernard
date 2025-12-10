import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";

import { parseToolInput, safeStringify } from "@/lib/messages";
import {
  MAX_PARALLEL_TOOL_CALLS,
  buildIntentSystemPrompt
} from "./prompts";
import type { Harness, HarnessContext, HarnessResult, LLMCaller, ToolCall } from "../lib/types";

const RESPOND_TOOL_NAME = "respond";

export type IntentInput = {
  messageText?: string;
};

export type IntentTool = {
  name: string;
  description?: string;
  schema?: unknown;
  invoke: (input: Record<string, unknown>) => Promise<unknown>;
  verifyConfiguration?: () => { ok: boolean; reason?: string } | Promise<{ ok: boolean; reason?: string }>;
};

export type IntentOutput = {
  transcript: BaseMessage[];
  toolCalls: ToolCall[];
  done: boolean;
};

type DisabledTool = { name: string; reason?: string | undefined };
type ToolFailure = { call: ToolCall; reason: string };

function buildRespondTool(): IntentTool {
  return {
    name: RESPOND_TOOL_NAME,
    description:
      "Mark the agent loop as ready to hand off to respond to the user, once tooling is complete. Prefer calling this after your final tool call; if all necessary tools already succeeded, calling respond() alone is allowed.",
    schema: { type: "object", properties: {}, additionalProperties: false },
    async invoke() {
      return "Requested to finish tool calling once all calls in this turn succeeded.";
    }
  };
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

function stableSortObject(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stableSortObject);
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    out[key] = stableSortObject(obj[key]);
  }
  return out;
}

function canonicalToolKey(name: string, args: Record<string, unknown>): string {
  try {
    return `${name}:${JSON.stringify(stableSortObject(args))}`;
  } catch {
    return `${name}:${safeStringify(args)}`;
  }
}

export class IntentHarness implements Harness<IntentInput, IntentOutput> {
  private readonly tools: IntentTool[];
  private toolsForLLM: IntentTool[] = [];
  private disabledTools: DisabledTool[] = [];
  private availableTools: IntentTool[] = [];
  private toolsReady?: Promise<void>;
  private readonly llm: LLMCaller;
  private readonly maxIterations: number;

  constructor(llm: LLMCaller, tools: IntentTool[], maxIterations = 4) {
    this.llm = llm;
    if (tools.some((tool) => tool.name === RESPOND_TOOL_NAME)) {
      throw new Error(`Intent tool name "${RESPOND_TOOL_NAME}" is reserved by the harness.`);
    }
    this.tools = tools;
    this.maxIterations = maxIterations;
  }

  private async ensureToolsReady() {
    if (this.toolsReady) return this.toolsReady;
    this.toolsReady = (async () => {
      const available: IntentTool[] = [];
      const disabled: DisabledTool[] = [];
      for (const tool of this.tools) {
        if (tool.verifyConfiguration) {
          try {
            const verify = await tool.verifyConfiguration();
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
      this.availableTools = available;
      this.disabledTools = disabled;
      this.toolsForLLM = [...available, buildRespondTool()];
    })();
    return this.toolsReady;
  }

  async run(input: IntentInput, ctx: HarnessContext): Promise<HarnessResult<IntentOutput>> {
    await this.ensureToolsReady();

    const transcript: BaseMessage[] = [...ctx.conversation.turns];
    const historyLength = transcript.length;
    if (input.messageText) {
      transcript.push(new HumanMessage({ content: input.messageText }));
    }

    const toolMap = new Map(this.toolsForLLM.map((tool) => [tool.name, tool]));
    let lastToolCalls: ToolCall[] = [];
    let previousCallKeys = new Set<string>();
    const repeatCounts = new Map<string, number>();
    const pendingFailureKeys = new Set<string>();
    let successfulToolRuns = 0;

    for (let i = 0; i < (ctx.config.maxIntentIterations ?? this.maxIterations); i++) {
      const systemPrompt = buildIntentSystemPrompt(ctx.now(), this.toolsForLLM, this.disabledTools);
      const intentPrompt = [
        ...transcript.slice(0, historyLength),
        new SystemMessage(systemPrompt),
        ...transcript.slice(historyLength)
      ] as BaseMessage[];
      const res = await this.llm.call({
        model: ctx.config.intentModel,
        messages: intentPrompt,
        tools: this.toolsForLLM,
        meta: {
          conversationId: ctx.conversationId,
          traceName: "intent",
          ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
          ...(ctx.turnId ? { turnId: ctx.turnId } : {}),
          ...(ctx.recordKeeper ? { recordKeeper: ctx.recordKeeper } : {})
        }
      });

      transcript.push(res.message);
      lastToolCalls = res.toolCalls ?? [];

      const hasTools = lastToolCalls.length > 0;

      // If no tools were requested, treat this as a handoff without persisting the assistant text.
      if (!hasTools) {
        // Remove the just-added assistant message to avoid duplicating content in history.
        transcript.pop();
        return { output: { transcript, toolCalls: [], done: true }, done: true };
      }

      const deduped: Array<{ call: ToolCall; args: Record<string, unknown>; key: string }> = [];
      const seenKeys = new Set<string>();
      const callFailures: ToolFailure[] = [];
      const callKeyMap = new Map<string, string>();
      for (const call of lastToolCalls) {
        const args = normalizeArgs(extractCallArgs(call));
        const key = canonicalToolKey(call.name, args);
        if (seenKeys.has(key)) {
          const reason = `Duplicate tool call skipped: ${call.name} with identical arguments in the same turn.`;
          transcript.push(
            new ToolMessage({
              tool_call_id: call.id,
              name: call.name,
              content: reason
            })
          );
          callFailures.push({ call, reason });
          continue;
        }
        seenKeys.add(key);
        deduped.push({ call, args, key });
        callKeyMap.set(call.id ?? key, key);
      }

      if (deduped.length > MAX_PARALLEL_TOOL_CALLS) {
        const extras = deduped.slice(MAX_PARALLEL_TOOL_CALLS);
        deduped.length = MAX_PARALLEL_TOOL_CALLS;
        for (const extra of extras) {
          const reason = `Skipped tool call: exceeded max parallel tool calls (${MAX_PARALLEL_TOOL_CALLS}).`;
          transcript.push(
            new ToolMessage({
              tool_call_id: extra.call.id,
              name: extra.call.name,
              content: reason
            })
          );
          callFailures.push({ call: extra.call, reason });
        }
      }

      const currentKeys = new Set(deduped.map((entry) => entry.key));
      for (const key of currentKeys) {
        const previousStreak = previousCallKeys.has(key) ? repeatCounts.get(key) ?? 1 : 0;
        const nextStreak = previousStreak ? previousStreak + 1 : 1;
        repeatCounts.set(key, nextStreak);
        if (nextStreak >= 3) {
          throw new Error(`Intent halted: tool "${key}" repeated ${nextStreak} times in a row.`);
        }
      }
      for (const key of Array.from(repeatCounts.keys())) {
        if (!currentKeys.has(key)) {
          repeatCounts.delete(key);
        }
      }
      previousCallKeys = currentKeys;
      lastToolCalls = deduped.map((entry) => entry.call);

      const runnableCalls = deduped.filter((entry) => entry.call.name !== RESPOND_TOOL_NAME);
      const respondCalls = deduped.filter((entry) => entry.call.name === RESPOND_TOOL_NAME);

      for (const { call, args, key } of runnableCalls) {
        const tool = toolMap.get(call.name);
        if (!tool) {
          const reason = `Tool ${call.name} unavailable`;
          transcript.push(
            new ToolMessage({
              tool_call_id: call.id,
              name: call.name,
              content: reason
            })
          );
          callFailures.push({ call, reason });
          continue;
        }
        try {
          const result = await tool.invoke(args);
          successfulToolRuns += 1;
          pendingFailureKeys.delete(key);
          transcript.push(toToolMessage(call, result));
        } catch (err) {
          const reason = `Tool ${call.name} failed: ${err instanceof Error ? err.message : String(err)}`;
          pendingFailureKeys.add(key);
          transcript.push(
            new ToolMessage({
              tool_call_id: call.id,
              name: call.name,
              content: reason
            })
          );
          callFailures.push({ call, reason });
        }
      }

      if (respondCalls.length) {
        const hasNonRespondCalls = runnableCalls.length > 0;
        const hasOutstandingFailures = pendingFailureKeys.size > 0 || callFailures.length > 0;
        for (const { call } of respondCalls) {
          if (!hasNonRespondCalls) {
            if (hasOutstandingFailures) {
              const failureSummary = callFailures
                .map((failure) => `- ${failure.call.name}: ${failure.reason}`)
                .join("\n");
              const unresolvedNote = pendingFailureKeys.size
                ? "- Previous tool call(s) in this run failed; rerun the failing call(s) successfully, then call respond()."
                : "";
              const details = [failureSummary, unresolvedNote].filter(Boolean).join("\n").trim();
              const reason =
                details || "respond() failed: fix the failing tool call(s) and call respond() again.";
              const prefixed = reason.startsWith("respond() failed") ? reason : `respond() failed: ${reason}`;
              transcript.push(
                new ToolMessage({
                  tool_call_id: call.id,
                  name: call.name,
                  content: prefixed
                })
              );
              continue;
            }
            const readyContent =
              successfulToolRuns > 0
                ? "All required tool calls already succeeded earlier in this run. Ready to hand off to the responder."
                : "No tool calls needed this turn. Ready to hand off to the responder.";
            transcript.push(
              new ToolMessage({
                tool_call_id: call.id,
                name: call.name,
                content: readyContent
              })
            );
            return { output: { transcript, toolCalls: [], done: true }, done: true };
          }
          if (hasOutstandingFailures) {
            const failureSummary = callFailures
              .map((failure) => `- ${failure.call.name}: ${failure.reason}`)
              .join("\n");
            const unresolvedNote = pendingFailureKeys.size
              ? "- Previous tool call(s) in this run failed; rerun the failing call(s) successfully, then call respond()."
              : "";
            const details = [failureSummary, unresolvedNote].filter(Boolean).join("\n").trim();
            const reason =
              details || "respond() failed: fix the other tool call(s) and call respond() again next turn.";
            const prefixed = reason.startsWith("respond() failed") ? reason : `respond() failed: ${reason}`;
            transcript.push(
              new ToolMessage({
                tool_call_id: call.id,
                name: call.name,
                content: prefixed
              })
            );
            continue;
          }
          transcript.push(
            new ToolMessage({
              tool_call_id: call.id,
              name: call.name,
              content: "All tool calls in this turn succeeded. Ready to hand off to the responder."
            })
          );
          return { output: { transcript, toolCalls: [], done: true }, done: true };
        }
      }
    }

    return { output: { transcript, toolCalls: lastToolCalls, done: true }, done: true };
  }
}


