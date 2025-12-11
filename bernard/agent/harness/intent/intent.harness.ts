import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";

import { parseToolInputWithDiagnostics, safeStringify } from "@/lib/messages";
import {
  MAX_PARALLEL_TOOL_CALLS,
  buildIntentSystemPrompt
} from "./prompts";
import type { Harness, HarnessContext, HarnessResult, LLMCaller, ToolCall } from "../lib/types";
import type { MessageRecord } from "@/lib/recordKeeper";
import { snapshotToolsForTrace } from "../lib/toolSnapshot";

const RESPOND_TOOL_NAME = "respond";
const MAX_CORRECTION_ATTEMPTS = 2;
const TOOL_TIMEOUT_MS = 60_000;

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

type ParsedArgs = {
  args: Record<string, unknown>;
  success: boolean;
  error?: string | undefined;
  raw: unknown;
};

function normalizeArgs(raw: unknown): ParsedArgs {
  const parsed = parseToolInputWithDiagnostics(raw);
  const value = parsed.value;
  if (value === undefined || value === null) {
    return { args: {}, success: parsed.success, error: parsed.error, raw };
  }
  if (typeof value === "object") {
    return { args: value as Record<string, unknown>, success: parsed.success, error: parsed.error, raw };
  }
  return {
    args: { value },
    success: parsed.success,
    error: parsed.error ?? "Tool arguments were not valid JSON",
    raw
  };
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

function buildRepairPrompt(
  failures: Array<{ call: ToolCall; args: Record<string, unknown> }>
): string {
  const examples = failures
    .map((failure) => {
      const serialized = safeStringify({
        role: "assistant",
        content: "",
        tool_calls: [
          {
            type: "function",
            function: {
              name: failure.call.name,
              arguments: safeStringify(failure.args)
            }
          }
        ]
      });
      const rawCall = safeStringify(failure.call);
      return `Failed call (fix this): ${rawCall}\nRespond with corrected tool_calls only, like: ${serialized}`;
    })
    .join("\n\n");

  return [
    'You failed to call a tool. Repair the tool call and respond with JUST the corrected tool call as a single assistant message containing only "tool_calls". No conversation, no analysis.',
    'Required format example (no text): {"role":"assistant","content":"","tool_calls":[{"type":"function","function":{"name":"tool_name","arguments":"{...json...}"}}]}',
    examples
  ]
    .filter(Boolean)
    .join("\n\n");
}

function canonicalToolKey(name: string, args: Record<string, unknown>): string {
  try {
    return `${name}:${JSON.stringify(stableSortObject(args))}`;
  } catch {
    return `${name}:${safeStringify(args)}`;
  }
}

async function runWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    fn()
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
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
    let correctionAttempts = 0;

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
        stream: false,
        meta: {
          conversationId: ctx.conversationId,
          traceName: "intent",
          ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
          ...(ctx.turnId ? { turnId: ctx.turnId } : {}),
          ...(ctx.recordKeeper ? { recordKeeper: ctx.recordKeeper } : {}),
          deferRecord: true
        }
      });

      let toolLatencyMsTotal = 0;
      let traceRecorded = false;
      const recordTrace = async () => {
        if (traceRecorded) return;
        traceRecorded = true;
        if (ctx.recordKeeper) {
          const traceDetails = {
            model: ctx.config.intentModel,
            context: intentPrompt,
            result: res.message,
            latencyMs: res.trace?.latencyMs,
            toolLatencyMs: toolLatencyMsTotal,
            tools: snapshotToolsForTrace(this.toolsForLLM),
            tokens: res.usage,
            requestId: ctx.requestId,
            turnId: ctx.turnId,
            stage: "intent",
            contextLimit: 12
          } as {
            model: string;
            context: Array<BaseMessage | MessageRecord>;
            result?: BaseMessage | MessageRecord | Array<BaseMessage | MessageRecord>;
            startedAt?: string;
            latencyMs?: number;
            toolLatencyMs?: number;
            tokens?: { in?: number; out?: number; cacheRead?: number; cacheWrite?: number; cached?: boolean };
            requestId?: string;
            turnId?: string;
            stage?: string;
            contextLimit?: number;
          };

          if (res.trace?.startedAt) traceDetails.startedAt = res.trace.startedAt;

          await ctx.recordKeeper.recordLLMCall(ctx.conversationId, traceDetails);
        }
        const llmLatency = res.trace?.latencyMs;
        if (llmLatency !== undefined || toolLatencyMsTotal) {
          const llmLabel = typeof llmLatency === "number" ? llmLatency : "n/a";
          console.info(`[intent] llm_latency_ms=${llmLabel} tool_latency_ms=${toolLatencyMsTotal}`);
        }
      };

      try {
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
        const parseDiagnostics = new Map<
          string,
          { success: boolean; error?: string | undefined; raw: unknown; args: Record<string, unknown> }
        >();
        const seenKeys = new Set<string>();
        const callFailures: ToolFailure[] = [];
        for (const call of lastToolCalls) {
          const parsed = normalizeArgs(extractCallArgs(call));
          const args = parsed.args;
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
          parseDiagnostics.set(call.id ?? key, {
            success: parsed.success,
            error: parsed.error,
            raw: parsed.raw,
            args
          });
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

        const parseFailures = deduped.filter((entry) => {
          const diag = parseDiagnostics.get(entry.call.id ?? entry.key);
          return diag ? !diag.success : false;
        });

        if (parseFailures.length) {
          correctionAttempts += 1;
          if (correctionAttempts > MAX_CORRECTION_ATTEMPTS) {
            throw new Error(
              `Intent halted: tool arguments could not be repaired after ${MAX_CORRECTION_ATTEMPTS} attempts.`
            );
          }

          for (const failure of parseFailures) {
            const diag = parseDiagnostics.get(failure.call.id ?? failure.key);
            const reason = diag?.error ?? "Tool arguments were not valid JSON.";
            transcript.push(
              new ToolMessage({
                tool_call_id: failure.call.id,
                name: failure.call.name,
                content: `Tool arguments parse failed: ${reason}`
              })
            );
          }

          const repairPrompt = buildRepairPrompt(parseFailures.map((f) => ({ call: f.call, args: f.args })));
          transcript.push(new SystemMessage(repairPrompt));
          continue;
        }

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
          const start = Date.now();
          try {
            const result = await runWithTimeout(() => tool.invoke(args), TOOL_TIMEOUT_MS, `Tool ${call.name}`);
            const elapsed = Date.now() - start;
            toolLatencyMsTotal += elapsed;
            if (ctx.recordKeeper && ctx.turnId) {
              await ctx.recordKeeper.recordToolResult(ctx.turnId, call.name, { ok: true, latencyMs: elapsed });
            }
            const message = toToolMessage(call, result);
            (message as { response_metadata?: Record<string, unknown> }).response_metadata = {
              ...(message as { response_metadata?: Record<string, unknown> }).response_metadata,
              toolLatencyMs: elapsed,
              traceType: "tool_call"
            };
            successfulToolRuns += 1;
            pendingFailureKeys.delete(key);
            transcript.push(message);
          } catch (err) {
            const elapsed = Date.now() - start;
            toolLatencyMsTotal += elapsed;
            if (ctx.recordKeeper && ctx.turnId) {
              const errorType = err instanceof Error ? err.name : "error";
              await ctx.recordKeeper.recordToolResult(ctx.turnId, call.name, {
                ok: false,
                latencyMs: elapsed,
                errorType
              });
            }
            const reason = `Tool ${call.name} failed: ${err instanceof Error ? err.message : String(err)}`;
            pendingFailureKeys.add(key);
            const failureMessage = new ToolMessage({
              tool_call_id: call.id,
              name: call.name,
              content: reason
            });
            (failureMessage as { response_metadata?: Record<string, unknown> }).response_metadata = {
              toolLatencyMs: elapsed,
              traceType: "tool_call",
              error: true
            };
            transcript.push(failureMessage);
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
      } finally {
        if (res.trace) {
          res.trace.toolLatencyMs = toolLatencyMsTotal;
        }
        await recordTrace();
      }
    }

    return { output: { transcript, toolCalls: lastToolCalls, done: true }, done: true };
  }
}


