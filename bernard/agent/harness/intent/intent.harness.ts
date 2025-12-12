import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";

import type { Logger } from "pino";

import { parseToolInputWithDiagnostics, safeStringify } from "@/lib/conversation/messages";
import {
  MAX_PARALLEL_TOOL_CALLS,
  buildIntentSystemPrompt
} from "./prompts";
import type { Harness, HarnessContext, HarnessResult, LLMCaller, ToolCall } from "../lib/types";
import type { MessageRecord } from "@/lib/conversation/recordKeeper";
import { childLogger, logger, startTimer, toErrorObject } from "@/lib/logging";

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

/**
 * Builds the reserved respond tool that signals the harness to hand off once tool calls are done.
 */
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

/**
 * Normalize tool arguments regardless of whether they are objects, primitives, or absent.
 */
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

/**
 * Extracts arguments from common call shapes produced by different model providers.
 */
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

/**
 * Builds a ToolMessage to append to the transcript after a tool invocation.
 */
function toToolMessage(call: ToolCall, result: unknown) {
  return new ToolMessage({
    tool_call_id: call.id,
    name: call.name,
    content: typeof result === "string" ? result : safeStringify(result)
  });
}

type ToolErrorResult = { status?: string; message?: string; errorType?: string };

function isToolErrorResult(result: unknown): result is ToolErrorResult {
  if (!result || typeof result !== "object") return false;
  return (result as ToolErrorResult).status === "error";
}

/**
 * Recursively sorts object keys to produce stable stringification for deduplication.
 */
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

/**
 * Builds a repair prompt instructing the model to resend corrected tool calls.
 */
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

/**
 * Produces a stable deduplication key for a tool call.
 */
function canonicalToolKey(name: string, args: Record<string, unknown>): string {
  try {
    return `${name}:${JSON.stringify(stableSortObject(args))}`;
  } catch {
    return `${name}:${safeStringify(args)}`;
  }
}

/**
 * Runs a promise with a deadline, surfacing a labeled timeout error.
 */
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

type ParsedCall = {
  call: ToolCall;
  args: Record<string, unknown>;
  key: string;
  name: string;
};

type ParseDiagnostic = {
  success: boolean;
  error?: string | undefined;
  raw: unknown;
  args: Record<string, unknown>;
};

type CallParseResult = {
  parsedCalls: ParsedCall[];
  parseDiagnostics: Map<string, ParseDiagnostic>;
  callFailures: ToolFailure[];
};

type RunState = {
  transcript: BaseMessage[];
  previousCallKeys: Set<string>;
  repeatCounts: Map<string, number>;
  pendingFailureKeys: Set<string>;
  successfulToolRuns: number;
  correctionAttempts: number;
};

export class IntentHarness implements Harness<IntentInput, IntentOutput> {
  private readonly tools: IntentTool[];
  private toolsForLLM: IntentTool[] = [];
  private disabledTools: DisabledTool[] = [];
  private _availableTools: IntentTool[] = [];
  private toolsReady?: Promise<void>;
  private readonly llm: LLMCaller;
  private readonly maxIterations: number;
  private readonly log = childLogger({ component: "intent_harness" }, logger);

  /**
   * Create a new intent harness.
   */
  constructor(llm: LLMCaller, tools: IntentTool[], maxIterations = 4) {
    this.llm = llm;
    if (tools.some((tool) => tool.name === RESPOND_TOOL_NAME)) {
      throw new Error(`Intent tool name "${RESPOND_TOOL_NAME}" is reserved by the harness.`);
    }
    this.tools = tools;
    this.maxIterations = maxIterations;
  }

  /**
   * Validate tool configuration and prepare tool lists for the model.
   */
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

  /**
   * Build the LLM context for the current iteration.
   */
  private buildRequestContext(input: IntentInput, ctx: HarnessContext, transcript: BaseMessage[]) {
    const systemPrompt = buildIntentSystemPrompt(ctx.now(), this.toolsForLLM, this.disabledTools);
    const context = [new SystemMessage(systemPrompt), ...transcript];
    if (input.messageText) {
      context.push(new HumanMessage({ content: input.messageText }));
    }
    return context;
  }

  /**
   * Deduplicate tool calls and collect parse diagnostics.
   */
  private parseToolCalls(
    toolCalls: ToolCall[],
    transcript: BaseMessage[]
  ): CallParseResult {
    const parsedCalls: ParsedCall[] = [];
    const parseDiagnostics = new Map<string, ParseDiagnostic>();
    const seenKeys = new Set<string>();
    const callFailures: ToolFailure[] = [];

    for (const call of toolCalls) {
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
      parsedCalls.push({ call, args, key, name: call.name });
      parseDiagnostics.set(call.id ?? key, {
        success: parsed.success,
        error: parsed.error,
        raw: parsed.raw,
        args
      });
    }

    return { parsedCalls, parseDiagnostics, callFailures };
  }

  /**
   * Limit parallelism to the configured maximum.
   */
  private enforceParallelLimit(
    parsedCalls: ParsedCall[],
    transcript: BaseMessage[],
    callFailures: ToolFailure[]
  ): ParsedCall[] {
    if (parsedCalls.length <= MAX_PARALLEL_TOOL_CALLS) return parsedCalls;
    const extras = parsedCalls.slice(MAX_PARALLEL_TOOL_CALLS);
    parsedCalls.length = MAX_PARALLEL_TOOL_CALLS;
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
    return parsedCalls;
  }

  /**
   * Update repetition tracking and short-circuit if work is already finished.
   */
  private handleRepeatTracking(
    parsedCalls: ParsedCall[],
    state: RunState,
    successfulToolRuns: number,
    transcript: BaseMessage[],
    context: BaseMessage[]
  ) {
    const currentKeys = new Set(parsedCalls.map((entry) => entry.key));
    const hasNewCalls = parsedCalls.some((entry) => !state.previousCallKeys.has(entry.key));
    if (!hasNewCalls && successfulToolRuns > 0) {
      const note = "Tool calls already completed in a prior turn; handing off to the responder.";
      for (const entry of parsedCalls) {
        transcript.push(
          new ToolMessage({
            tool_call_id: entry.call.id,
            name: entry.name,
            content: note
          })
        );
      }
      return {
        done: true as const,
        output: { output: { transcript: state.transcript, toolCalls: [], done: true }, done: true }
      };
    }

    for (const key of currentKeys) {
      const previousStreak = state.previousCallKeys.has(key) ? state.repeatCounts.get(key) ?? 1 : 0;
      const nextStreak = previousStreak ? previousStreak + 1 : 1;
      state.repeatCounts.set(key, nextStreak);
      if (nextStreak >= 3) {
        throw new Error(`Intent halted: tool "${key}" repeated ${nextStreak} times in a row.`);
      }
    }

    for (const key of Array.from(state.repeatCounts.keys())) {
      if (!currentKeys.has(key)) {
        state.repeatCounts.delete(key);
      }
    }

    state.previousCallKeys = currentKeys;
    return { done: false as const };
  }

  /**
   * Handle parse failures and inject repair prompts when needed.
   */
  private handleParseFailures(
    parsedCalls: ParsedCall[],
    parseDiagnostics: Map<string, ParseDiagnostic>,
    state: RunState,
    transcript: BaseMessage[]
  ) {
    const parseFailures = parsedCalls.filter((entry) => {
      const diag = parseDiagnostics.get(entry.call.id ?? entry.key);
      return diag ? !diag.success : false;
    });

    if (!parseFailures.length) return { shouldRepair: false as const };

    state.correctionAttempts += 1;
    if (state.correctionAttempts > MAX_CORRECTION_ATTEMPTS) {
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
    return { shouldRepair: true as const };
  }

  /**
   * Execute runnable tool calls, recording successes and failures.
   */
  private async executeRunnableCalls(
    runnableCalls: ParsedCall[],
    toolMap: Map<string, IntentTool>,
    ctx: HarnessContext,
    state: RunState,
    log: Logger
  ) {
    const callFailures: ToolFailure[] = [];
    let toolLatencyMsTotal = 0;
    for (const { call, args, key } of runnableCalls) {
      const callLogger = childLogger(
        {
          tool: call.name,
          conversationId: ctx.conversationId,
          requestId: ctx.requestId,
          turnId: ctx.turnId,
          stage: "intent"
        },
        log
      );
      const tool = toolMap.get(call.name);
      if (!tool) {
        const reason = `Tool ${call.name} unavailable`;
        state.transcript.push(
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
        if (isToolErrorResult(result)) {
          const reason = typeof result.message === "string" ? result.message : safeStringify(result);
          if (ctx.recordKeeper && ctx.turnId) {
            await ctx.recordKeeper.recordToolResult(ctx.turnId, call.name, {
              ok: false,
              latencyMs: elapsed,
              errorType: result.errorType ?? "error"
            });
          }
          state.pendingFailureKeys.add(key);
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
          state.transcript.push(failureMessage);
          callFailures.push({ call, reason });
          callLogger.warn({
            event: "tool.error",
            reason,
            durationMs: elapsed,
            argKeys: Object.keys(args ?? {})
          });
        } else {
          if (ctx.recordKeeper && ctx.turnId) {
            await ctx.recordKeeper.recordToolResult(ctx.turnId, call.name, { ok: true, latencyMs: elapsed });
          }
          const message = toToolMessage(call, result);
          (message as { response_metadata?: Record<string, unknown> }).response_metadata = {
            ...(message as { response_metadata?: Record<string, unknown> }).response_metadata,
            toolLatencyMs: elapsed,
            traceType: "tool_call"
          };
          state.successfulToolRuns += 1;
          state.pendingFailureKeys.delete(key);
          state.transcript.push(message);
          callLogger.info({
            event: "tool.success",
            durationMs: elapsed,
            argKeys: Object.keys(args ?? {}),
            responseType: typeof result
          });
        }
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
        state.pendingFailureKeys.add(key);
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
        state.transcript.push(failureMessage);
        callFailures.push({ call, reason });
        callLogger.error({
          event: "tool.exception",
          durationMs: elapsed,
          err: toErrorObject(err)
        });
      }
    }
    return { callFailures, toolLatencyMsTotal };
  }

  /**
   * Process respond tool calls and decide whether the harness is finished.
   */
  private handleRespondCalls(
    respondCalls: ParsedCall[],
    runnableCalls: ParsedCall[],
    callFailures: ToolFailure[],
    state: RunState
  ) {
    if (!respondCalls.length) return { done: false as const };

    const hasNonRespondCalls = runnableCalls.length > 0;
    const hasOutstandingFailures = state.pendingFailureKeys.size > 0 || callFailures.length > 0;

    for (const { call } of respondCalls) {
      if (!hasNonRespondCalls) {
        if (hasOutstandingFailures) {
          const failureSummary = callFailures.map((failure) => `- ${failure.call.name}: ${failure.reason}`).join("\n");
          const unresolvedNote = state.pendingFailureKeys.size
            ? "- Previous tool call(s) in this run failed; rerun the failing call(s) successfully, then call respond()."
            : "";
          const details = [failureSummary, unresolvedNote].filter(Boolean).join("\n").trim();
          const reason = details || "respond() failed: fix the failing tool call(s) and call respond() again.";
          const prefixed = reason.startsWith("respond() failed") ? reason : `respond() failed: ${reason}`;
          state.transcript.push(
            new ToolMessage({
              tool_call_id: call.id,
              name: call.name,
              content: prefixed
            })
          );
          continue;
        }
        const readyContent =
          state.successfulToolRuns > 0
            ? "All required tool calls already succeeded earlier in this run. Ready to hand off to the responder."
            : "No tool calls needed this turn. Ready to hand off to the responder.";
        state.transcript.push(
          new ToolMessage({
            tool_call_id: call.id,
            name: call.name,
            content: readyContent
          })
        );
        return { done: true as const, output: { transcript: state.transcript, toolCalls: [], done: true } };
      }
      if (hasOutstandingFailures) {
        const failureSummary = callFailures.map((failure) => `- ${failure.call.name}: ${failure.reason}`).join("\n");
        const unresolvedNote = state.pendingFailureKeys.size
          ? "- Previous tool call(s) in this run failed; rerun the failing call(s) successfully, then call respond()."
          : "";
        const details = [failureSummary, unresolvedNote].filter(Boolean).join("\n").trim();
        const reason = details || "respond() failed: fix the other tool call(s) and call respond() again next turn.";
        const prefixed = reason.startsWith("respond() failed") ? reason : `respond() failed: ${reason}`;
        state.transcript.push(
          new ToolMessage({
            tool_call_id: call.id,
            name: call.name,
            content: prefixed
          })
        );
        continue;
      }
      state.transcript.push(
        new ToolMessage({
          tool_call_id: call.id,
          name: call.name,
          content: "All tool calls in this turn succeeded. Ready to hand off to the responder."
        })
      );
      return { done: true as const, output: { transcript: state.transcript, toolCalls: [], done: true } };
    }

    return { done: false as const };
  }

  /**
   * Record traces with the record keeper and log latencies.
   */
  private async recordTrace(
    res: Awaited<ReturnType<LLMCaller["call"]>>,
    ctx: HarnessContext,
    context: BaseMessage[],
    toolLatencyMsTotal: number,
    log: Logger
  ) {
    if (ctx.recordKeeper) {
      const traceDetails = {
        model: ctx.config.intentModel,
        context: context,
        result: res.message,
        latencyMs: res.trace?.latencyMs,
        toolLatencyMs: toolLatencyMsTotal,
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
      log.debug({
        event: "intent.llm.trace",
        llmLatencyMs: llmLabel,
        toolLatencyMs: toolLatencyMsTotal
      });
    }
  }

  /**
   * Run the intent harness loop until completion or max iterations.
   */
  async run(input: IntentInput, ctx: HarnessContext): Promise<HarnessResult<IntentOutput>> {
    await this.ensureToolsReady();
    const runLogger = childLogger(
      {
        conversationId: ctx.conversationId,
        requestId: ctx.requestId,
        turnId: ctx.turnId,
        stage: "intent",
        component: "intent_harness"
      },
      this.log
    );
    const elapsed = startTimer();

    const state: RunState = {
      transcript: [...ctx.conversation.turns],
      previousCallKeys: new Set<string>(),
      repeatCounts: new Map<string, number>(),
      pendingFailureKeys: new Set<string>(),
      successfulToolRuns: 0,
      correctionAttempts: 0
    };
    let lastToolCalls: ToolCall[] = [];
    const toolMap = new Map(this.toolsForLLM.map((tool) => [tool.name, tool]));

    const finish = (result: HarnessResult<IntentOutput>) => {
      runLogger.info({
        event: "intent.run.success",
        durationMs: elapsed(),
        toolCalls: result.output.toolCalls?.length ?? 0,
        successfulToolRuns: state.successfulToolRuns,
        corrections: state.correctionAttempts
      });
      return result;
    };

    try {
      for (let i = 0; i < (ctx.config.maxIntentIterations ?? this.maxIterations); i++) {
        const context = this.buildRequestContext(input, ctx, state.transcript);
        const res = await this.llm.call({
          model: ctx.config.intentModel,
          messages: context,
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

        try {
          lastToolCalls = res.toolCalls ?? [];
          const hasTools = lastToolCalls.length > 0;

          if (hasTools) {
            state.transcript.push(res.message);
          } else {
            return finish({ output: { transcript: state.transcript, toolCalls: [], done: true }, done: true });
          }

          const parsedResult = this.parseToolCalls(lastToolCalls, state.transcript);
          const parsedCalls = this.enforceParallelLimit(parsedResult.parsedCalls, state.transcript, parsedResult.callFailures);

          const repeatCheck = this.handleRepeatTracking(parsedCalls, state, state.successfulToolRuns, state.transcript, context);
          if (repeatCheck.done) {
            return finish(repeatCheck.output as HarnessResult<IntentOutput>);
          }

          lastToolCalls = parsedCalls.map((entry) => entry.call);

          const parseRepair = this.handleParseFailures(parsedCalls, parsedResult.parseDiagnostics, state, state.transcript);
          if (parseRepair.shouldRepair) {
            continue;
          }

          const runnableCalls = parsedCalls.filter((entry) => entry.call.name !== RESPOND_TOOL_NAME);
          const respondCalls = parsedCalls.filter((entry) => entry.call.name === RESPOND_TOOL_NAME);

          const execution = await this.executeRunnableCalls(runnableCalls, toolMap, ctx, state, runLogger);
          toolLatencyMsTotal += execution.toolLatencyMsTotal;
          const combinedFailures = [...parsedResult.callFailures, ...execution.callFailures];

          const respondResult = this.handleRespondCalls(respondCalls, runnableCalls, combinedFailures, state);
          if (respondResult.done) {
            return finish({ output: respondResult.output as IntentOutput, done: true });
          }
        } finally {
          if (res.trace) {
            res.trace.toolLatencyMs = toolLatencyMsTotal;
          }
          await this.recordTrace(res, ctx, context, toolLatencyMsTotal, runLogger);
        }
      }

      return finish({ output: { transcript: state.transcript, toolCalls: lastToolCalls, done: true }, done: true });
    } catch (err) {
      runLogger.error({
        event: "intent.run.error",
        durationMs: elapsed(),
        err: toErrorObject(err)
      });
      throw err;
    }
  }
}


