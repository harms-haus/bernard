import { AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { AIMessageChunk, AIMessageFields, BaseMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { tool as toolFactory } from "@langchain/core/tools";
import { z } from "zod";

import { getPrimaryModel, resolveApiKey, resolveBaseUrl } from "./models";
import {
  bernardSystemPromptBase,
  intentSystemPromptBase,
  buildSystemPrompts,
  MAX_PARALLEL_TOOL_CALLS
} from "./systemPrompt";
import { extractTokenUsage, parseToolInput, safeStringify, type TokenUsage } from "./messages";
import type { MessageRecord, OpenRouterResult, ToolResult } from "./recordKeeper";
import {
  buildToolAvailabilityMessage,
  buildToolValidationMessage,
  canonicalToolCalls,
  ensureToolAvailabilityContext,
  evaluateToolAvailability,
  extractToolCallsFromMessage,
  hasToolCall,
  latestToolCalls,
  normalizeToolCalls,
  parseToolCallsWithParser,
  stripIntentOnlySystemMessages,
  validateToolCalls
} from "./tools/toolCalls";
import type {
  ConfiguredTool,
  InstrumentedTool,
  ToolCallMessage,
  ToolCallRecord
} from "./tools/toolCalls";
import { tools as baseTools } from "@/libs/tools";

const DEBUG_UPSTREAM = process.env["DEBUG_UPSTREAM"] === "1";
export const TOOL_FORMAT_INSTRUCTIONS =
  "When you call tools, respond only with a tool_calls array using OpenAI's function-calling shape: " +
  '[{"id":"unique_id","type":"function","function":{"name":"tool_name","arguments":<valid JSON object>}}]. ' +
  "Arguments must be valid JSON (no trailing text). Do not include natural-language text alongside tool_calls.";

export type AgentContext = {
  recordKeeper: {
    recordToolResult: (turnId: string, toolName: string, result: ToolResult) => Promise<void>;
    recordOpenRouterResult: (turnId: string, modelName: string, result: OpenRouterResult) => Promise<void>;
    recordLLMCall: (
      conversationId: string,
      payload: {
        model: string;
        startedAt?: string;
        latencyMs?: number;
        tokens?: { in?: number; out?: number; cacheRead?: number; cacheWrite?: number; cached?: boolean };
        context: Array<BaseMessage | MessageRecord>;
        result?: Array<BaseMessage | MessageRecord>;
      }
    ) => Promise<void>;
  };
  turnId: string;
  conversationId: string;
  requestId: string;
  token: string;
  model?: string;
  intentModel?: string;
  responseModel?: string;
};

export type GraphDeps = {
  model?: ChatOpenAI;
  intentModel?: ChatOpenAI;
  responseModel?: ChatOpenAI;
  tools?: ConfiguredTool[];
  ChatOpenAI?: typeof ChatOpenAI;
  onUpdate?: (messages: BaseMessage[]) => void | Promise<void>;
};

function classifyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/rate limit/i.test(message) || /429/.test(message)) return "rate_limit";
  if (/timeout/i.test(message)) return "timeout";
  if (/auth/i.test(message)) return "auth";
  return "other";
}

function isEmptyIntentOutput(messages: BaseMessage[]): boolean {
  if (!messages.length) return true;
  const last = messages[messages.length - 1];
  const hasToolCalls = extractToolCallsFromMessage(last as ToolCallMessage).length > 0;
  if (hasToolCalls) return false;
  const content = (last as { content?: unknown }).content;
  if (content === null || content === undefined) return true;
  if (typeof content === "string") return content.trim().length === 0;
  if (Array.isArray(content)) {
    const combined = content
      .map((part) => (typeof part === "string" ? part : safeStringify(part)))
      .join("")
      .trim();
    return combined.length === 0;
  }
  return false;
}

function extractRawToolInput(input: unknown, runOpts?: unknown): unknown {
  const candidates: unknown[] = [];

  if (input && typeof input === "object") {
    const argsCandidate = (input as { args?: unknown }).args;
    if (argsCandidate !== undefined) candidates.push(argsCandidate);

    const inputCandidate = (input as { input?: unknown }).input;
    if (inputCandidate !== undefined) candidates.push(inputCandidate);

    const argumentsCandidate = (input as { arguments?: unknown }).arguments;
    if (argumentsCandidate !== undefined) candidates.push(argumentsCandidate);

    const fnCandidate = (input as { function?: { arguments?: unknown } }).function;
    if (fnCandidate && typeof fnCandidate === "object" && "arguments" in fnCandidate) {
      const fnArgs = (fnCandidate as { arguments?: unknown }).arguments;
      if (fnArgs !== undefined) candidates.push(fnArgs);
    }
  }

  if (runOpts && typeof runOpts === "object") {
    const toolCallCandidate = (runOpts as { toolCall?: { args?: unknown; function?: { arguments?: unknown } } }).toolCall;
    if (toolCallCandidate && typeof toolCallCandidate === "object") {
      if (toolCallCandidate.args !== undefined) candidates.push(toolCallCandidate.args);
      const argumentsCandidate = (toolCallCandidate as { arguments?: unknown }).arguments;
      if (argumentsCandidate !== undefined) candidates.push(argumentsCandidate);
      const fnCandidate = toolCallCandidate.function;
      if (fnCandidate && typeof fnCandidate === "object" && "arguments" in fnCandidate) {
        const fnArgs = (fnCandidate as { arguments?: unknown }).arguments;
        if (fnArgs !== undefined) candidates.push(fnArgs);
      }
    }
  }

  const found = candidates.find((candidate) => candidate !== undefined);
  return found !== undefined ? found : input;
}

function normalizeTokenAccounting(usage: TokenUsage) {
  const tokensIn = usage.prompt_tokens ?? usage.input_tokens;
  const tokensOut = usage.completion_tokens ?? usage.output_tokens;
  const cacheRead = usage.cache_read_input_tokens;
  const cacheWrite = usage.cache_creation_input_tokens ?? usage.cache_write_input_tokens;
  const cachedFlag = usage.cached === true || (typeof cacheRead === "number" && cacheRead > 0);

  return {
    ...(typeof tokensIn === "number" ? { in: tokensIn } : {}),
    ...(typeof tokensOut === "number" ? { out: tokensOut } : {}),
    ...(typeof cacheRead === "number" ? { cacheRead } : {}),
    ...(typeof cacheWrite === "number" ? { cacheWrite } : {}),
    ...(cachedFlag ? { cached: true } : {})
  };
}

function dedupeToolCalls(toolCalls: ToolCallRecord[]): ToolCallRecord[] {
  const seen = new Set<string>();
  return toolCalls.filter((call) => {
    const name = call.name ?? call.function?.name ?? "unknown_tool";
    const args = (call as { args?: unknown }).args;
    if (args && typeof args === "object") {
      const { lat, lon } = args as { lat?: unknown; lon?: unknown };
      const latNum = typeof lat === "number" ? lat : null;
      const lonNum = typeof lon === "number" ? lon : null;
      const latPresent = lat !== undefined;
      const lonPresent = lon !== undefined;
      const latValid = !latPresent || (latNum !== null && Number.isFinite(latNum) && latNum >= -90 && latNum <= 90);
      const lonValid = !lonPresent || (lonNum !== null && Number.isFinite(lonNum) && lonNum >= -180 && lonNum <= 180);
      if (!latValid || !lonValid) return false;
    }
    const key = `${name}:${safeStringify(args)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function recordLLMTrace(
  ctx: AgentContext,
  modelName: string,
  startedAt: number,
  latencyMs: number,
  usage: TokenUsage,
  contextMessages: BaseMessage[],
  resultMessages?: BaseMessage | BaseMessage[]
) {
  const contextSnapshot = contextMessages.slice();
  const resultSnapshot = resultMessages
    ? Array.isArray(resultMessages)
      ? resultMessages
      : [resultMessages]
    : undefined;

  await ctx.recordKeeper.recordLLMCall(ctx.conversationId, {
    model: modelName,
    startedAt: new Date(startedAt).toISOString(),
    latencyMs,
    tokens: normalizeTokenAccounting(usage),
    context: contextSnapshot,
    ...(resultSnapshot ? { result: resultSnapshot } : {})
  });
}

export function instrumentTools(ctx: AgentContext, toolsList: InstrumentedTool[] = baseTools as InstrumentedTool[]) {
  const tools = toolsList;
  return tools.map((t) =>
    toolFactory(
      async (input: unknown, runOpts?: { toolCall?: { args?: unknown; function?: { arguments?: unknown } } }) => {
        const start = Date.now();
        try {
          const rawInput = extractRawToolInput(input, runOpts);
          const parsedInput = parseToolInput(rawInput);
          const normalizedInput = parsedInput === undefined ? {} : parsedInput;
          const res = await t.invoke(normalizedInput, runOpts);
          await ctx.recordKeeper.recordToolResult(ctx.turnId, t.name, { ok: true, latencyMs: Date.now() - start });
          return res;
        } catch (err) {
          await ctx.recordKeeper.recordToolResult(ctx.turnId, t.name, {
            ok: false,
            latencyMs: Date.now() - start,
            errorType: classifyError(err)
          });
          throw err;
        }
      },
      ({
        name: t.name,
        description: t.description,
        ...(t.schema ? { schema: t.schema } : { schema: z.any().default({}) })
      } satisfies Parameters<typeof toolFactory>[1])
    )
  );
}

function ensureToolFormatInstructions(messages: BaseMessage[]): BaseMessage[] {
  const hasToolFormat = messages.some(
    (message) =>
      (message as { _getType?: () => string })._getType?.() === "system" &&
      typeof (message as { content?: unknown }).content === "string" &&
      (message as { content?: string }).content === TOOL_FORMAT_INSTRUCTIONS
  );
  if (hasToolFormat) return messages;
  return [...messages, new SystemMessage({ content: TOOL_FORMAT_INSTRUCTIONS })];
}

async function runToolCalls(
  toolCalls: ToolCallRecord[],
  toolMap: Map<string, ReturnType<typeof instrumentTools>[number]>
): Promise<BaseMessage[]> {
  const executions = toolCalls.map(async (call) => {
    const name = String(call?.name ?? call.function?.name ?? "unknown_tool");
    const rawToolCallId = (call as { id?: unknown }).id ?? name;
    const toolCallId = typeof rawToolCallId === "string" ? rawToolCallId : safeStringify(rawToolCallId);
    const tool = toolMap.get(name);
    const rawArgs =
      (call as { arguments?: unknown }).arguments ??
      call.function?.arguments ??
      (call as { args?: unknown }).args ??
      (call as { input?: unknown }).input;
    const parsedArgs = parseToolInput(rawArgs);
    let normalizedArgs: Record<string, unknown>;
    if (parsedArgs === undefined) {
      normalizedArgs = {};
    } else if (typeof parsedArgs === "object" && parsedArgs !== null) {
      normalizedArgs = parsedArgs as Record<string, unknown>;
    } else {
      normalizedArgs = { value: parsedArgs };
    }

    if (!tool) {
      return new ToolMessage({
        tool_call_id: toolCallId,
        name,
        content: `Error: tool "${name}" is not available`,
        additional_kwargs: { status: "error" }
      });
    }

    const result = await tool.invoke(normalizedArgs);
    return new ToolMessage({
      tool_call_id: toolCallId,
      name,
      content: typeof result === "string" ? result : safeStringify(result)
    });
  });

  return Promise.all(executions);
}

function callIntentModel(ctx: AgentContext, modelName: string, model: ChatOpenAI, tools: ReturnType<typeof instrumentTools>) {
  const bound = model.bindTools(tools);
  return async (state: { messages: BaseMessage[] }) => {
    const start = Date.now();
    const rawResult: unknown = await bound.invoke(state.messages);
    if (!rawResult || typeof rawResult !== "object") {
      throw new Error("Model returned invalid result");
    }
    const result = rawResult as BaseMessage;
    const latency = Date.now() - start;
    const usage = extractTokenUsage(result);

    const parsedToolCalls = parseToolCallsWithParser(result);
    const normalizedToolCalls = normalizeToolCalls(
      parsedToolCalls.length ? parsedToolCalls : extractToolCallsFromMessage(result as ToolCallMessage)
    );
    if (normalizedToolCalls.length) {
      (result as { tool_calls?: unknown[] }).tool_calls = normalizedToolCalls;
    }

    const tokensIn = usage.prompt_tokens ?? usage.input_tokens;
    const tokensOut = usage.completion_tokens ?? usage.output_tokens;

    const openRouterResult: {
      ok: boolean;
      latencyMs: number;
      tokensIn?: number;
      tokensOut?: number;
    } = {
      ok: true,
      latencyMs: latency
    };
    if (typeof tokensIn === "number") openRouterResult.tokensIn = tokensIn;
    if (typeof tokensOut === "number") openRouterResult.tokensOut = tokensOut;

    await ctx.recordKeeper.recordOpenRouterResult(ctx.turnId, modelName, openRouterResult);
    await recordLLMTrace(ctx, modelName, start, latency, usage, state.messages, result);

    return { messages: [result] };
  };
}

export function buildGraph(ctx: AgentContext, deps: GraphDeps = {}) {
  const ChatOpenAIImpl = deps.ChatOpenAI ?? ChatOpenAI;
  const baseURL = resolveBaseUrl();
  const apiKey = resolveApiKey();
  const responseModelName = ctx.responseModel ?? ctx.model ?? getPrimaryModel("response");
  const intentModelName = ctx.intentModel ?? getPrimaryModel("intent", { fallback: [responseModelName] });

  if (!apiKey && !deps.model && !deps.intentModel && !deps.responseModel && !deps.ChatOpenAI) {
    throw new Error("OPENROUTER_API_KEY is required for agent model access");
  }

  const intentLLM =
    deps.intentModel ??
    deps.model ??
    new ChatOpenAIImpl({
      model: intentModelName,
      apiKey,
      configuration: { baseURL },
      temperature: 0
    });

  const responseLLM =
    deps.responseModel ??
    deps.model ??
    new ChatOpenAIImpl({
      model: responseModelName,
      apiKey,
      configuration: { baseURL },
      temperature: 0.5
    });

  const { ready: verifiedTools, unavailable: unavailableTools } = evaluateToolAvailability(deps.tools);
  const toolAvailabilityMessage = buildToolAvailabilityMessage(unavailableTools);
  const instrumentedTools = instrumentTools(ctx, verifiedTools);
  const intentTools = instrumentedTools;
  const intentToolNames = new Set(intentTools.map((tool) => tool.name));
  const toolMap = new Map<string, ReturnType<typeof instrumentTools>[number]>(
    instrumentedTools.map((tool) => [tool.name, tool])
  );
  const intentStep = callIntentModel(ctx, intentModelName, intentLLM, intentTools);
  const streamingIntentModel = intentLLM.bindTools(intentTools);
  const maxIterations = 20;
  const onUpdateHook = deps.onUpdate;
  let lastRunnableToolName: string | null = null;
  const signatureCounts = new Map<string, number>();
  const { bernardSystemPrompt, intentSystemPrompt } = buildSystemPrompts();
  const matchesPromptBase = (content: unknown, basePrompt: string) =>
    typeof content === "string" && content.startsWith(basePrompt);

  const upsertSystemPrompt = (messages: BaseMessage[], prompt: string, basePrompt: string): BaseMessage[] => {
    const hasCurrentPrompt = messages.some(
      (message) =>
        (message as { _getType?: () => string })._getType?.() === "system" &&
        typeof (message as { content?: unknown }).content === "string" &&
        (message as { content?: string }).content === prompt
    );
    if (hasCurrentPrompt) return messages;
    const withoutPriorPrompt = messages.filter((message) => {
      if ((message as { _getType?: () => string })._getType?.() !== "system") return true;
      const content = (message as { content?: unknown }).content;
      return !matchesPromptBase(content, basePrompt);
    });
    return [new SystemMessage({ content: prompt }), ...withoutPriorPrompt];
  };

  const ensureIntentSystemPrompt = (messages: BaseMessage[]): BaseMessage[] =>
    upsertSystemPrompt(messages, intentSystemPrompt, intentSystemPromptBase);

  const ensureResponseSystemPrompt = (messages: BaseMessage[]): BaseMessage[] =>
    upsertSystemPrompt(messages, bernardSystemPrompt, bernardSystemPromptBase);

  const normalizeArgs = (raw: unknown) => parseToolInput(raw);

  const failureStreakByTool = new Map<string, number>();
  type ToolFailureInfo = { count: number; lastError?: string };
  const failureInfoByTool = new Map<string, ToolFailureInfo>();

  const updateFailureTracking = (toolMessages: BaseMessage[], setForcedReason: (reason: string) => void) => {
    for (const msg of toolMessages) {
      const type = (msg as { getType?: () => string }).getType?.();
      if (type !== "tool") continue;
      const name = (msg as { name?: string }).name ?? "unknown_tool";
      const status = (msg as { status?: string }).status;
      const contentVal = (msg as { content?: unknown }).content;
      const content =
        typeof contentVal === "string"
          ? contentVal
          : Array.isArray(contentVal)
            ? contentVal.map((part) => (typeof part === "string" ? part : safeStringify(part))).join(" ")
            : contentVal !== undefined
              ? safeStringify(contentVal)
              : "";
      const isError = status === "error" || content.toLowerCase().startsWith("error");

      if (isError) {
        const prev = failureStreakByTool.get(name) ?? 0;
        const next = prev + 1;
        failureStreakByTool.set(name, next);

        const info = failureInfoByTool.get(name) ?? { count: 0 };
        info.count += 1;
        if (content) info.lastError = content;
        failureInfoByTool.set(name, info);

        if (next >= 5) {
          setForcedReason(`Tool "${name}" failed ${next} times consecutively`);
        }
      } else {
        failureStreakByTool.set(name, 0);
      }
    }
  };

  const buildFailureContext = (forcedReason: string | null) => {
    if (!forcedReason && failureInfoByTool.size === 0) return null;
    const parts: string[] = [];
    if (forcedReason) parts.push(`Tool loop capped: ${forcedReason}`);
    if (failureInfoByTool.size) {
      const summaries = Array.from(failureInfoByTool.entries()).map(([name, info]) => {
        const details = [`failures=${info.count}`];
        if (info.lastError) details.push(`last_error=${info.lastError}`);
        return `${name} (${details.join(", ")})`;
      });
      parts.push(`Failed tools: ${summaries.join("; ")}`);
    }
    return parts.join(". ");
  };

  const addFailureContext = (messages: BaseMessage[], forcedReason: string | null) => {
    const context = buildFailureContext(forcedReason);
    if (!context) return messages;
    return [...messages, new SystemMessage({ content: context })];
  };

  const stripToolingSystemMessages = (messages: BaseMessage[]) => {
    const maybeToolAvailability = toolAvailabilityMessage;
    return messages.filter((message) => {
      const isSystem = (message as { _getType?: () => string })._getType?.() === "system";
      if (!isSystem) return true;
      const content = (message as { content?: unknown }).content;
      if (typeof content !== "string") return true;
      if (content === TOOL_FORMAT_INSTRUCTIONS) return false;
      if (matchesPromptBase(content, intentSystemPromptBase)) return false;
      if (maybeToolAvailability && content === maybeToolAvailability) return false;
      const normalized = content.toLowerCase();
      if (normalized.startsWith("unavailable tools")) return false;
      if (normalized.includes("last attempt to call a tool failed")) return false;
      if (normalized.startsWith("tool loop capped")) return false;
      if (normalized.includes("failed tools:")) return false;
      return true;
    });
  };

  const responseContext = (messages: BaseMessage[]) => {
    const withoutTooling = stripToolingSystemMessages(messages);
    const intentLess = stripIntentOnlySystemMessages(withoutTooling, TOOL_FORMAT_INSTRUCTIONS, intentSystemPrompt);
    return ensureResponseSystemPrompt(intentLess);
  };

  const recordRespondMetrics = async (usage: TokenUsage, latencyMs: number, ok: boolean, errorType?: string) => {
    const tokensIn = usage.prompt_tokens ?? usage.input_tokens;
    const tokensOut = usage.completion_tokens ?? usage.output_tokens;

    await ctx.recordKeeper.recordOpenRouterResult(ctx.turnId, responseModelName, {
      ok,
      latencyMs,
      ...(typeof tokensIn === "number" ? { tokensIn } : {}),
      ...(typeof tokensOut === "number" ? { tokensOut } : {})
    });

    await ctx.recordKeeper.recordToolResult(ctx.turnId, "respond", {
      ok,
      latencyMs,
      ...(errorType ? { errorType } : {})
    });
  };

  const invokeRespond = async (messages: BaseMessage[]) => {
    const start = Date.now();
    const filtered = responseContext(messages);
    try {
      const rawResult: unknown = await responseLLM.invoke(filtered);
      if (!rawResult || typeof rawResult !== "object") {
        throw new Error("Response model returned invalid result");
      }
      const result = rawResult as BaseMessage;
      const usage = extractTokenUsage(result);
      const latencyMs = Date.now() - start;
      await recordRespondMetrics(usage, latencyMs, true);
      await recordLLMTrace(ctx, responseModelName, start, latencyMs, usage, filtered, result);
      return result;
    } catch (err) {
      await recordRespondMetrics({}, Date.now() - start, false, classifyError(err));
      throw err;
    }
  };

  async function* streamRespond(messages: BaseMessage[]) {
    const start = Date.now();
    const filtered = responseContext(messages);
    let responseAggregated: AIMessageChunk | null = null;
    let lastResponseChunk: unknown;

    try {
      const responseStream = await responseLLM.stream(filtered);

      for await (const chunk of responseStream) {
        lastResponseChunk = chunk;
        if (DEBUG_UPSTREAM) {
          console.warn("response upstream chunk", safeStringify(chunk));
        }
        responseAggregated = responseAggregated ? responseAggregated.concat(chunk) : chunk;
        const currentMessages = [...messages, responseAggregated];
        if (onUpdateHook) await onUpdateHook(currentMessages);
        yield { messages: currentMessages };
      }

      if (!responseAggregated) {
        throw new Error("Response model returned no chunks");
      }

      const usage = extractTokenUsage(responseAggregated);
      const responseMessage = new AIMessage({
        content: responseAggregated.content,
        additional_kwargs: (responseAggregated as { additional_kwargs?: Record<string, unknown> }).additional_kwargs,
        response_metadata: (responseAggregated as { response_metadata?: unknown }).response_metadata,
        usage_metadata: (responseAggregated as { usage_metadata?: unknown }).usage_metadata,
        ...(responseAggregated as { tool_calls?: AIMessage["tool_calls"] }).tool_calls
          ? ({
              tool_calls: (responseAggregated as { tool_calls?: AIMessage["tool_calls"] }).tool_calls
            } as { tool_calls: AIMessage["tool_calls"] })
          : {}
      } as AIMessageFields);
      const latencyMs = Date.now() - start;
      await recordRespondMetrics(usage, latencyMs, true);
      await recordLLMTrace(ctx, responseModelName, start, latencyMs, usage, filtered, responseMessage);
      const finalMessages = [...messages, responseMessage];
      if (onUpdateHook) await onUpdateHook(finalMessages);
      yield { messages: finalMessages };
      return finalMessages;
    } catch (err) {
      if (DEBUG_UPSTREAM) {
        console.error(
          "response upstream error",
          err instanceof Error ? err.message : String(err),
          safeStringify(lastResponseChunk)
        );
      }
      await recordRespondMetrics({}, Date.now() - start, false, classifyError(err));
      throw err;
    }
  }

  const invokeIntent = async (messages: BaseMessage[], mode: "invoke" | "stream" = "invoke") => {
    if (mode === "stream" && typeof streamingIntentModel.stream === "function") {
      const start = Date.now();
      let aggregated: AIMessageChunk | null = null;
      let latestToolCallChunks: unknown[] | undefined;
      let stream: AsyncIterable<AIMessageChunk>;
      try {
        stream = await streamingIntentModel.stream(messages);
      } catch (err) {
        if (DEBUG_UPSTREAM) {
          console.error(
            "intent upstream error (stream acquisition)",
            err instanceof Error ? err.message : String(err),
            safeStringify(messages)
          );
        }
        throw err;
      }

      try {
        for await (const chunk of stream) {
          if (DEBUG_UPSTREAM) {
            console.warn("intent upstream chunk", safeStringify(chunk));
          }
          aggregated = aggregated ? aggregated.concat(chunk) : chunk;
          const chunkToolCallChunks =
            (chunk as { tool_call_chunks?: unknown[]; additional_kwargs?: { tool_call_chunks?: unknown[] } }).tool_call_chunks ??
            (chunk as { additional_kwargs?: { tool_call_chunks?: unknown[] } }).additional_kwargs?.tool_call_chunks;
          if (Array.isArray(chunkToolCallChunks) && chunkToolCallChunks.length) {
            latestToolCallChunks = chunkToolCallChunks;
          }
        }
      } catch (err) {
        if (DEBUG_UPSTREAM) {
          console.error(
            "intent upstream error (during stream)",
            err instanceof Error ? err.message : String(err),
            safeStringify(messages)
          );
        }
        throw err;
      }

      if (!aggregated) {
        throw new Error("Model returned no chunks");
      }

      if (latestToolCallChunks) {
        (aggregated as { tool_call_chunks?: unknown[] }).tool_call_chunks = latestToolCallChunks;
      }

      const parsedToolCalls = parseToolCallsWithParser(aggregated as unknown as BaseMessage);
      const aggregatedToolCallChunks =
        (aggregated as { tool_call_chunks?: unknown[]; additional_kwargs?: { tool_call_chunks?: unknown[] } }).tool_call_chunks ??
        (aggregated as { additional_kwargs?: { tool_call_chunks?: unknown[] } }).additional_kwargs?.tool_call_chunks;
      const chunkCalls =
        aggregatedToolCallChunks ??
        (Array.isArray(latestToolCallChunks) && latestToolCallChunks.length ? latestToolCallChunks : null);
      const normalizedChunkCalls =
        chunkCalls && Array.isArray(chunkCalls) && chunkCalls.length ? normalizeToolCalls(chunkCalls) : [];
      let toolCalls =
        parsedToolCalls.length > 0 ? parsedToolCalls : extractToolCallsFromMessage(aggregated as ToolCallMessage);
      const hasNamedToolCalls = toolCalls.some((call) => {
        const name = call?.name ?? call.function?.name;
        return typeof name === "string" && name.trim().length > 0 && name.trim() !== "tool_call";
      });
      if ((!toolCalls.length || !hasNamedToolCalls) && normalizedChunkCalls.length) {
        toolCalls = normalizedChunkCalls;
      }
      if (toolCalls.length) {
        toolCalls = normalizeToolCalls(toolCalls);
        (aggregated as { tool_calls?: unknown[] }).tool_calls = toolCalls;
      }

      const usage = extractTokenUsage(aggregated);
      const tokensIn = usage.prompt_tokens ?? usage.input_tokens;
      const tokensOut = usage.completion_tokens ?? usage.output_tokens;
      const latencyMs = Date.now() - start;
      await ctx.recordKeeper.recordOpenRouterResult(ctx.turnId, intentModelName, {
        ok: true,
        latencyMs,
        ...(typeof tokensIn === "number" ? { tokensIn } : {}),
        ...(typeof tokensOut === "number" ? { tokensOut } : {})
      });

      const aggregatedMessage = new AIMessage({
        content: aggregated.content,
        additional_kwargs: (aggregated as { additional_kwargs?: Record<string, unknown> }).additional_kwargs,
        response_metadata: (aggregated as { response_metadata?: unknown }).response_metadata,
        usage_metadata: (aggregated as { usage_metadata?: unknown }).usage_metadata,
        ...(toolCalls.length
          ? ({ tool_calls: toolCalls as unknown as AIMessage["tool_calls"] } as { tool_calls: AIMessage["tool_calls"] })
          : {})
      } as AIMessageFields);
      await recordLLMTrace(ctx, intentModelName, start, latencyMs, usage, messages, aggregatedMessage);
      return [aggregatedMessage];
    }

    const result = await intentStep({ messages });
    return result.messages ?? [];
  };

  const execute = async (
    initialMessages: BaseMessage[],
    onUpdate: (messages: BaseMessage[]) => void | Promise<void> = onUpdateHook ?? (() => {})
  ): Promise<BaseMessage[]> => {
    let messages = ensureToolAvailabilityContext(
      ensureToolFormatInstructions(ensureIntentSystemPrompt(initialMessages)),
      toolAvailabilityMessage
    );
    let responded = false;
    let sawToolExecution = false;
    let forcedReason: string | null = null;

    const setForcedReason = (reason: string) => {
      if (!forcedReason) forcedReason = reason;
    };

    for (let i = 0; i < maxIterations; i++) {
      const intentMessages = await invokeIntent(messages, "invoke");
      messages = [...messages, ...intentMessages];
      await onUpdate(messages);

      const toolCalls = intentMessages.length ? latestToolCalls(messages) : [];
      const validation = validateToolCalls(toolCalls, intentToolNames, {
        maxParallelCalls: MAX_PARALLEL_TOOL_CALLS,
        enforceUniqueParallelCalls: true
      });

      if (validation.invalid.length) {
        messages = [...messages, new SystemMessage({ content: buildToolValidationMessage(validation.invalid) })];
        await onUpdate(messages);
        continue;
      }

      const runnableCalls = dedupeToolCalls(validation.valid);
      const intentOutputEmpty = isEmptyIntentOutput(intentMessages);

      const toolCallsSignature = canonicalToolCalls(runnableCalls, normalizeArgs);
      if (toolCallsSignature && runnableCalls.length) {
        lastRunnableToolName = runnableCalls[0]?.name ?? runnableCalls[0]?.function?.name ?? "unknown_tool";
        const count = signatureCounts.get(toolCallsSignature) ?? 0;
        if (count >= 2) {
          setForcedReason(
            `Tool "${lastRunnableToolName}" was requested with identical parameters ${count + 1} times`
          );
          const responseMessage = await invokeRespond(addFailureContext(messages, forcedReason));
          messages = [...messages, responseMessage];
          await onUpdate(messages);
          responded = true;
          break;
        }
        signatureCounts.set(toolCallsSignature, count + 1);
      }

      const shouldRespond = forcedReason || intentOutputEmpty || runnableCalls.length === 0;

      if (shouldRespond) {
        if (!forcedReason && !intentOutputEmpty && runnableCalls.length === 0 && sawToolExecution) {
          await ctx.recordKeeper.recordToolResult(ctx.turnId, "respond", { ok: true, latencyMs: 0 });
          responded = true;
          break;
        }
        const responseMessage = await invokeRespond(addFailureContext(messages, forcedReason));
        messages = [...messages, responseMessage];
        await onUpdate(messages);
        responded = true;
        break;
      }

      const toolMessages = await runToolCalls(runnableCalls, toolMap);
      sawToolExecution = true;
      messages = [...messages, ...toolMessages];
      await onUpdate(messages);

      updateFailureTracking(toolMessages, setForcedReason);
    }

    if (!responded) {
      const responseMessage = await invokeRespond(addFailureContext(messages, forcedReason));
      messages = [...messages, responseMessage];
      await onUpdate(messages);
    }
    return messages;
  };

  async function* streamMessages(initialMessages: BaseMessage[]) {
    let messages = ensureToolAvailabilityContext(
      ensureToolFormatInstructions(ensureIntentSystemPrompt(initialMessages)),
      toolAvailabilityMessage
    );
    let responded = false;
    let forcedReason: string | null = null;

    const setForcedReason = (reason: string) => {
      if (!forcedReason) forcedReason = reason;
    };

    for (let i = 0; i < maxIterations; i++) {
      const intentMessages = await invokeIntent(messages, "stream");
      messages = [...messages, ...intentMessages];
      if (onUpdateHook) await onUpdateHook(messages);

      const toolCalls = intentMessages.length ? latestToolCalls(messages) : [];
      const validation = validateToolCalls(toolCalls, intentToolNames, {
        maxParallelCalls: MAX_PARALLEL_TOOL_CALLS,
        enforceUniqueParallelCalls: true
      });

      if (validation.invalid.length) {
        messages = [...messages, new SystemMessage({ content: buildToolValidationMessage(validation.invalid) })];
        if (onUpdateHook) await onUpdateHook(messages);
        yield { messages };
        continue;
      }

      const runnableCalls = dedupeToolCalls(validation.valid);
      const intentOutputEmpty = isEmptyIntentOutput(intentMessages);

      const toolCallsSignature = canonicalToolCalls(runnableCalls, normalizeArgs);
      if (toolCallsSignature && runnableCalls.length) {
        lastRunnableToolName = runnableCalls[0]?.name ?? runnableCalls[0]?.function?.name ?? "unknown_tool";
        const count = signatureCounts.get(toolCallsSignature) ?? 0;
        if (count >= 2) {
          setForcedReason(
            `Tool "${lastRunnableToolName}" was requested with identical parameters ${count + 1} times`
          );
          const contextualized = addFailureContext(messages, forcedReason);
          if (onUpdateHook) await onUpdateHook(contextualized);
          for await (const responseChunk of streamRespond(contextualized)) {
            messages = responseChunk.messages ?? messages;
            yield responseChunk;
          }
          responded = true;
          break;
        }
        signatureCounts.set(toolCallsSignature, count + 1);
      }

      const shouldRespond = forcedReason || intentOutputEmpty || runnableCalls.length === 0;

      if (shouldRespond) {
        const contextualized = addFailureContext(messages, forcedReason);
        if (onUpdateHook) await onUpdateHook(contextualized);
        for await (const responseChunk of streamRespond(contextualized)) {
          messages = responseChunk.messages ?? messages;
          yield responseChunk;
        }
        responded = true;
        break;
      }

      const toolMessages = await runToolCalls(runnableCalls, toolMap);
      messages = [...messages, ...toolMessages];
      if (onUpdateHook) await onUpdateHook(messages);
      yield { messages };

      updateFailureTracking(toolMessages, setForcedReason);
    }

    if (!responded) {
      try {
        const contextualized = addFailureContext(messages, forcedReason);
        if (onUpdateHook) await onUpdateHook(contextualized);
        for await (const responseChunk of streamRespond(contextualized)) {
          messages = responseChunk.messages ?? messages;
          yield responseChunk;
        }
      } catch (err) {
        if (DEBUG_UPSTREAM) {
          console.error("intent -> response error", err instanceof Error ? err.message : String(err));
        }
        throw err;
      }
    }
  }

  return {
    async invoke(input: { messages: BaseMessage[] }) {
      const messages = await execute(input.messages ?? []);
      return { messages };
    },
    stream(input: { messages: BaseMessage[] }) {
      return streamMessages(input.messages ?? []);
    }
  };
}

export const __runnerTestHooks = {
  classifyError,
  hasToolCall,
  extractRawToolInput
};


