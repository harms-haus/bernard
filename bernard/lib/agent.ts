import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { AIMessageChunk, AIMessageFields, BaseMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { tool as toolFactory } from "@langchain/core/tools";
import { z } from "zod";
import { parseToolCall } from "@langchain/core/output_parsers/openai_tools";

import { tools as baseTools } from "@/libs/tools";
import type { RecordKeeper } from "@/lib/recordKeeper";
import { getPrimaryModel, resolveApiKey, resolveBaseUrl } from "./models";
import { bernardSystemPrompt, intentSystemPrompt } from "./systemPrompt";

/* c8 ignore start */
type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type LegacyFunctionCall = {
  name: string;
  arguments: unknown;
};

export type OpenAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<{ type: string; text?: string }> | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  function_call?: LegacyFunctionCall;
};

type LangGraphToolCall = NonNullable<AIMessage["tool_calls"]>[number];

export type AgentContext = {
  recordKeeper: RecordKeeper;
  turnId: string;
  conversationId: string;
  requestId: string;
  token: string;
  model?: string;
  intentModel?: string;
  responseModel?: string;
};
/* c8 ignore end */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const VALID_ROLES = new Set<OpenAIMessage["role"]>(["system", "user", "assistant", "tool"]);
const DEBUG_UPSTREAM = process.env["DEBUG_UPSTREAM"] === "1";
const TOOL_FORMAT_INSTRUCTIONS =
  "When you call tools, respond only with a tool_calls array using OpenAI's function-calling shape: " +
  '[{"id":"unique_id","type":"function","function":{"name":"tool_name","arguments":<valid JSON object>}}]. ' +
  "Arguments must be valid JSON (no trailing text). Do not include natural-language text alongside tool_calls.";

function containsChatMLMarkers(value: unknown): boolean {
  if (typeof value === "string") return value.includes("<|") || value.includes("|>");
  if (Array.isArray(value)) return value.some((part) => containsChatMLMarkers(part));
  if (value && typeof value === "object") {
    const maybeText = (value as { text?: unknown }).text;
    if (maybeText !== undefined && containsChatMLMarkers(maybeText)) return true;
    const maybeContent = (value as { content?: unknown }).content;
    if (maybeContent !== undefined && containsChatMLMarkers(maybeContent)) return true;
  }
  return false;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

type ToolFunctionArgs = { arguments?: unknown };
type ToolCallArgs = { args?: unknown; function?: ToolFunctionArgs };
type ToolRunOpts = { toolCall?: ToolCallArgs };

function extractRawToolInput(input: unknown, runOpts?: unknown): unknown {
  const candidates: unknown[] = [];

  if (isRecord(input)) {
    const argsCandidate = (input as ToolCallArgs).args;
    if (argsCandidate !== undefined) candidates.push(argsCandidate);

    const inputCandidate = (input as { input?: unknown }).input;
    if (inputCandidate !== undefined) candidates.push(inputCandidate);

    const argumentsCandidate = (input as { arguments?: unknown }).arguments;
    if (argumentsCandidate !== undefined) candidates.push(argumentsCandidate);

    const fnCandidate = (input as { function?: ToolFunctionArgs }).function;
    if (isRecord(fnCandidate) && fnCandidate.arguments !== undefined) {
      candidates.push(fnCandidate.arguments);
    }
  }

  if (isRecord(runOpts)) {
    const toolCallCandidate = (runOpts as ToolRunOpts).toolCall;
    if (isRecord(toolCallCandidate)) {
      if (toolCallCandidate.args !== undefined) candidates.push(toolCallCandidate.args);
      const argumentsCandidate = (toolCallCandidate as { arguments?: unknown }).arguments;
      if (argumentsCandidate !== undefined) candidates.push(argumentsCandidate);
      const fnCandidate = toolCallCandidate.function;
      if (isRecord(fnCandidate) && fnCandidate.arguments !== undefined) {
        candidates.push(fnCandidate.arguments);
      }
    }
  }

  const found = candidates.find((candidate) => candidate !== undefined);
  return found !== undefined ? found : input;
}

function parseToolInput(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function classifyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/rate limit/i.test(message) || /429/.test(message)) return "rate_limit";
  if (/timeout/i.test(message)) return "timeout";
  if (/auth/i.test(message)) return "auth";
  return "other";
}

type ToolCallRecord = { name?: string; function?: { name?: string; arguments?: unknown }; [key: string]: unknown };
type ToolCallMessage = { tool_calls?: unknown[]; additional_kwargs?: { tool_calls?: unknown[] } };

function normalizeToolCalls(toolCalls: unknown[]): ToolCallRecord[] {
  return toolCalls.map((call, index) => {
    if (!call || typeof call !== "object") {
      const fallbackName = String(call ?? "") || "tool_call";
      const fallbackId = `${fallbackName}_${index}`;
      return {
        id: fallbackId,
        name: fallbackName,
        type: "tool_call",
        args: {},
        function: { name: fallbackName, arguments: "{}" }
      } as ToolCallRecord;
    }

    const record = { ...(call as ToolCallRecord) };
    const rawName = (record as { name?: unknown }).name;
    const fnName = record.function?.name;
    const name =
      typeof rawName === "string" && rawName.trim()
        ? rawName.trim()
        : typeof fnName === "string" && fnName.trim()
          ? fnName.trim()
          : "tool_call";
    const rawId = (record as { id?: unknown }).id;
    const id =
      typeof rawId === "string" && rawId.trim()
        ? rawId
        : `${name}_${index}`;

    const rawArgs =
      (record as { arguments?: unknown }).arguments ??
      (record as { args?: unknown }).args ??
      (record as { input?: unknown }).input ??
      record.function?.arguments;

    const parsedArgs = parseToolInput(rawArgs);
    const normalizedArgs =
      parsedArgs === undefined
        ? {}
        : isRecord(parsedArgs)
          ? parsedArgs
          : { value: parsedArgs };

    const functionArguments =
      isRecord(record.function) && record.function.arguments !== undefined
        ? record.function.arguments
        : typeof rawArgs === "string"
          ? rawArgs
          : safeStringify(normalizedArgs);

    const functionName =
      isRecord(record.function) && typeof record.function.name === "string" && record.function.name.trim()
        ? record.function.name.trim()
        : name;

    const typeCandidate = (record as { type?: unknown }).type;
    const type = typeof typeCandidate === "string" && typeCandidate.trim() ? typeCandidate : "tool_call";

    return {
      ...record,
      id,
      name,
      type,
      args: normalizedArgs,
      function: {
        ...(isRecord(record.function) ? record.function : {}),
        name: functionName,
        arguments: functionArguments
      }
    };
  });
}

async function parseToolCallsWithParser(message: BaseMessage): Promise<ToolCallRecord[]> {
  const rawCalls = extractToolCallsFromMessage(message as ToolCallMessage);
  if (!rawCalls.length) return [];

  const parsed: ToolCallRecord[] = [];
  for (const call of rawCalls) {
    try {
      const clone = JSON.parse(JSON.stringify(call));
      const parsedCall = parseToolCall(clone as Record<string, unknown>, { returnId: true, partial: false });
      if (parsedCall) {
        const argsRaw = parsedCall.args;
        const argsParsed = parseToolInput(argsRaw);
        const args = argsParsed === undefined ? {} : isRecord(argsParsed) ? argsParsed : { value: argsParsed };
        const name = (parsedCall as { name?: string }).name ?? (parsedCall as { type?: string }).type ?? "tool";
        parsed.push({
          id: (parsedCall as { id?: string }).id ?? name,
          type: "tool_call",
          name,
          args,
          function: {
            name,
            arguments: typeof argsRaw === "string" ? argsRaw : safeStringify(args)
          }
        } as unknown as ToolCallRecord);
        continue;
      }
    } catch (err) {
      if (DEBUG_UPSTREAM) {
        console.error("tool parse failed", err instanceof Error ? err.message : String(err), safeStringify(call));
      }
    }

    // Fallback to normalized call with args defaulted.
    const normalized = normalizeToolCalls([call])[0];
    if (normalized) parsed.push(normalized);
  }

  return parsed;
}

function hasToolCall(messages: BaseMessage[]): boolean {
  const last = messages[messages.length - 1];
  const toolCalls = (last as { tool_calls?: unknown[]; additional_kwargs?: { tool_calls?: unknown[] } } | undefined)?.tool_calls;
  const nestedToolCalls = (last as { additional_kwargs?: { tool_calls?: unknown[] } } | undefined)?.additional_kwargs?.tool_calls;
  const toolCallChunks = (last as { tool_call_chunks?: unknown[]; additional_kwargs?: { tool_call_chunks?: unknown[] } } | undefined)?.tool_call_chunks;
  const nestedToolCallChunks = (last as { additional_kwargs?: { tool_call_chunks?: unknown[] } } | undefined)?.additional_kwargs?.tool_call_chunks;

  return (
    (Array.isArray(toolCalls) && toolCalls.length > 0) ||
    (Array.isArray(nestedToolCalls) && nestedToolCalls.length > 0) ||
    (Array.isArray(toolCallChunks) && toolCallChunks.length > 0) ||
    (Array.isArray(nestedToolCallChunks) && nestedToolCallChunks.length > 0)
  );
}

function isRespondToolCall(call: ToolCallRecord): boolean {
  const name = call?.name ?? call.function?.name;
  return name === "respond";
}

function extractToolCallsFromMessage(message: { tool_calls?: unknown[]; additional_kwargs?: { tool_calls?: unknown[] } } | null | undefined): ToolCallRecord[] {
  if (!message) return [];
  const direct = (message as { tool_calls?: unknown[] }).tool_calls;
  const nested = (message as { additional_kwargs?: { tool_calls?: unknown[] } }).additional_kwargs?.tool_calls;
  if (Array.isArray(direct) && direct.length) return normalizeToolCalls(direct);
  if (Array.isArray(nested) && nested.length) return normalizeToolCalls(nested);
  return [];
}

function latestToolCalls(messages: BaseMessage[]): ToolCallRecord[] {
  if (!messages.length) return [];
  const last = messages[messages.length - 1];
  return extractToolCallsFromMessage(last as { tool_calls?: unknown[]; additional_kwargs?: { tool_calls?: unknown[] } });
}

function dropRespondToolCalls(messages: BaseMessage[]): BaseMessage[] {
  return messages.filter((message) => !extractToolCallsFromMessage(message as ToolCallMessage).some(isRespondToolCall));
}

type ToolValidationError = { call: ToolCallRecord; reason: string };

function validateToolCalls(toolCalls: ToolCallRecord[], allowedTools: Set<string>): {
  valid: ToolCallRecord[];
  invalid: ToolValidationError[];
} {
  const valid: ToolCallRecord[] = [];
  const invalid: ToolValidationError[] = [];

  for (const call of toolCalls) {
    const name = (call?.name ?? call.function?.name) as unknown;
    const id = (call as { id?: unknown }).id ?? (call as { function?: { name?: unknown } }).function?.name ?? name;

    if (typeof name !== "string" || !name.trim()) {
      invalid.push({ call, reason: "Tool call is missing a valid name" });
      continue;
    }

    if (!allowedTools.has(name)) {
      invalid.push({ call, reason: `Tool "${name}" is not available` });
      continue;
    }

    if (typeof id !== "string" || !id.trim()) {
      invalid.push({ call, reason: `Tool "${name}" is missing a valid id` });
      continue;
    }

    const argsRaw =
      (call as { arguments?: unknown }).arguments ??
      call.function?.arguments ??
      (call as { args?: unknown }).args ??
      (call as { input?: unknown }).input;

    const parsedArgs = parseToolInput(argsRaw);
    if (parsedArgs !== undefined && !isRecord(parsedArgs)) {
      invalid.push({ call, reason: `Tool "${name}" arguments must be an object` });
      continue;
    }

    const normalizedArgs = parsedArgs === undefined ? {} : (parsedArgs as Record<string, unknown>);
    const normalizedCall: ToolCallRecord = {
      ...call,
      id,
      name,
      args: normalizedArgs,
      function: {
        ...(call.function ?? {}),
        name,
        arguments: typeof argsRaw === "string" ? argsRaw : safeStringify(normalizedArgs)
      }
    };

    valid.push(normalizedCall);
  }

  return { valid, invalid };
}

function buildToolValidationMessage(invalid: ToolValidationError[]): string {
  const details = invalid.map(({ call, reason }) => {
    const name = call?.name ?? call.function?.name ?? "unknown_tool";
    const id = (call as { id?: unknown }).id ?? "missing_id";
    return `${reason} (tool="${name}", id="${String(id)}")`;
  });
  return (
    `${details.join("; ")}. ` +
    "Your last attempt to call a tool failed, try again with the correct format, tools, and arguments."
  );
}

function ensureIntentSystemPrompt(messages: BaseMessage[]): BaseMessage[] {
  const hasIntentPrompt = messages.some(
    (message) =>
      (message as { _getType?: () => string })._getType?.() === "system" &&
      (message as { content?: unknown }).content === intentSystemPrompt
  );
  if (hasIntentPrompt) return messages;
  return [new SystemMessage({ content: intentSystemPrompt }), ...messages];
}

function ensureResponseSystemPrompt(messages: BaseMessage[]): BaseMessage[] {
  const hasResponsePrompt = messages.some(
    (message) =>
      (message as { _getType?: () => string })._getType?.() === "system" &&
      (message as { content?: unknown }).content === bernardSystemPrompt
  );
  if (hasResponsePrompt) return messages;
  return [new SystemMessage({ content: bernardSystemPrompt }), ...messages];
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

type InstrumentedTool = {
  name: string;
  description: string;
  schema?: unknown;
  invoke: (input: unknown, runOpts?: unknown) => Promise<unknown>;
};

type ToolVerificationResult = boolean | { ok: boolean; reason?: string };

type ConfiguredTool = InstrumentedTool & {
  verifyConfiguration?: () => ToolVerificationResult;
};

type ToolAvailability = {
  ready: InstrumentedTool[];
  unavailable: Array<{ name: string; reason: string }>;
};

function normalizeVerificationResult(result: ToolVerificationResult): { ok: boolean; reason?: string } {
  if (typeof result === "boolean") return { ok: result };
  const normalized: { ok: boolean; reason?: string } = { ok: result.ok };
  if (result.reason) normalized.reason = result.reason;
  return normalized;
}

function evaluateToolAvailability(toolsList: ConfiguredTool[] = baseTools as ConfiguredTool[]): ToolAvailability {
  const ready: InstrumentedTool[] = [];
  const unavailable: ToolAvailability["unavailable"] = [];

  for (const tool of toolsList) {
    if (!tool.verifyConfiguration) {
      ready.push(tool);
      continue;
    }

    try {
      const verification = normalizeVerificationResult(tool.verifyConfiguration());
      if (verification.ok) {
        ready.push(tool);
      } else {
        unavailable.push({
          name: tool.name,
          reason: verification.reason ?? "Tool configuration is missing or invalid."
        });
      }
    } catch (err) {
      unavailable.push({
        name: tool.name,
        reason:
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Tool configuration verification failed."
      });
    }
  }

  return { ready, unavailable };
}

function buildToolAvailabilityMessage(unavailable: ToolAvailability["unavailable"]): string | null {
  if (!unavailable.length) return null;
  const summary = unavailable.map((t) => `${t.name}: ${t.reason}`).join("; ");
  return `Unavailable tools (configuration errors): ${summary}`;
}

function ensureToolAvailabilityContext(messages: BaseMessage[], availabilityMessage: string | null): BaseMessage[] {
  if (!availabilityMessage) return messages;
  const hasAvailabilityContext = messages.some(
    (message) =>
      (message as { _getType?: () => string })._getType?.() === "system" &&
      (message as { content?: unknown }).content === availabilityMessage
  );
  if (hasAvailabilityContext) return messages;
  return [...messages, new SystemMessage({ content: availabilityMessage })];
}

function stripIntentOnlySystemMessages(messages: BaseMessage[]): BaseMessage[] {
  return messages.filter((message) => {
    const isSystem = (message as { _getType?: () => string })._getType?.() === "system";
    if (!isSystem) return true;
    const content = (message as { content?: unknown }).content;
    if (typeof content !== "string") return true;
    if (content === TOOL_FORMAT_INSTRUCTIONS) return false;
    if (content === intentSystemPrompt) return false;
    return true;
  });
}

async function runToolCalls(
  toolCalls: ToolCallRecord[],
  toolMap: Map<string, ReturnType<typeof instrumentTools>[number]>
): Promise<BaseMessage[]> {
  const executions = toolCalls.map(async (call) => {
    const name = (call?.name ?? call.function?.name ?? "unknown_tool") as string;
    const toolCallId = ((call as { id?: unknown }).id ?? name) as string;
    const tool = toolMap.get(name);
    const rawArgs =
      (call as { arguments?: unknown }).arguments ??
      call.function?.arguments ??
      (call as { args?: unknown }).args ??
      (call as { input?: unknown }).input;
    const parsedArgs = parseToolInput(rawArgs);
    const normalizedArgs =
      parsedArgs === undefined ? {} : isRecord(parsedArgs) ? parsedArgs : ({ value: parsedArgs } as Record<string, unknown>);

    if (!tool) {
      return new ToolMessage({
        tool_call_id: toolCallId,
        name,
        status: "error" as any,
        content: `Error: tool "${name}" is not available`
      });
    }

    try {
      const result = await tool.invoke(normalizedArgs);
      return new ToolMessage({
        tool_call_id: toolCallId,
        name,
        content: typeof result === "string" ? result : safeStringify(result)
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new ToolMessage({
        tool_call_id: toolCallId,
        name,
        status: "error" as any,
        content: `Error: ${message}`
      });
    }
  });

  return Promise.all(executions);
}

type TokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_write_input_tokens?: number;
  cached?: boolean;
};

type TokenAccounting = {
  in?: number;
  out?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cached?: boolean;
};

function extractTokenUsage(result: unknown): TokenUsage {
  if (!result || typeof result !== "object") return {};
  const withUsage = result as {
    response_metadata?: { token_usage?: TokenUsage };
    usage_metadata?: TokenUsage;
  };
  return withUsage.response_metadata?.token_usage ?? withUsage.usage_metadata ?? {};
}

function normalizeTokenAccounting(usage: TokenUsage): TokenAccounting {
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

function instrumentTools(ctx: AgentContext, toolsList: InstrumentedTool[] = baseTools as InstrumentedTool[]) {
  const tools = toolsList;
  return tools.map((t) =>
    toolFactory(
      async (input: unknown, runOpts?: ToolRunOpts) => {
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
        ...(t.schema ? { schema: t.schema } : {})
      } satisfies Parameters<typeof toolFactory>[1])
    )
  );
}

function callIntentModel(
  ctx: AgentContext,
  modelName: string,
  model: ChatOpenAI,
  tools: ReturnType<typeof instrumentTools>
) {
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

    const parsedToolCalls = await parseToolCallsWithParser(result);
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

type GraphDeps = {
  model?: ChatOpenAI;
  intentModel?: ChatOpenAI;
  responseModel?: ChatOpenAI;
  tools?: ConfiguredTool[];
  ChatOpenAI?: typeof ChatOpenAI;
  onUpdate?: (messages: BaseMessage[]) => void | Promise<void>;
};

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

  const { ready: verifiedTools, unavailable: unavailableTools } = evaluateToolAvailability(
    deps.tools as ConfiguredTool[] | undefined
  );
  const toolAvailabilityMessage = buildToolAvailabilityMessage(unavailableTools);
  const instrumentedTools = instrumentTools(ctx, verifiedTools);
  const respondTool = toolFactory(async () => "respond", {
    name: "respond",
    description:
      "Use this when you are ready to stop gathering data and deliver the final answer to the user. " +
      "Do not request additional tools after calling this.",
    schema: z.object({}).default({})
  }) as ReturnType<typeof instrumentTools>[number];
  const intentTools = [...instrumentedTools, respondTool];
  const intentToolNames = new Set(intentTools.map((tool) => tool.name));
  const toolMap = new Map<string, ReturnType<typeof instrumentTools>[number]>(
    instrumentedTools.map((tool) => [tool.name, tool])
  );
  const intentStep = callIntentModel(ctx, intentModelName, intentLLM, intentTools);
  const streamingIntentModel = intentLLM.bindTools(intentTools);
  const maxIterations = 20;
  const onUpdateHook = deps.onUpdate;

  const normalizeArgs = (raw: unknown) => parseToolInput(raw);

  const canonicalToolCalls = (toolCalls: ToolCallRecord[]): string | null => {
    if (!toolCalls.length) return null;
    const normalized = toolCalls
      .filter((call) => !isRespondToolCall(call))
      .map((call) => {
        const name = call.name ?? call.function?.name ?? "unknown_tool";
        const args = isRecord((call as { args?: unknown }).args)
          ? (call as { args?: Record<string, unknown> }).args
          : normalizeArgs(
              (call as { arguments?: unknown }).arguments ??
                call.function?.arguments ??
                (call as { input?: unknown }).input
            );
        return { name, args };
      });
    normalized.sort((a, b) => {
      if (a.name === b.name) return safeStringify(a.args).localeCompare(safeStringify(b.args));
      return a.name.localeCompare(b.name);
    });
    return safeStringify(normalized);
  };

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

  const responseContext = (messages: BaseMessage[]) =>
    ensureResponseSystemPrompt(stripIntentOnlySystemMessages(dropRespondToolCalls(messages)));

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

      const parsedToolCalls = await parseToolCallsWithParser(aggregated as unknown as BaseMessage);
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
    let forcedReason: string | null = null;
    let lastToolCallsSignature: string | null = null;
    let identicalToolCallStreak = 0;

    const setForcedReason = (reason: string) => {
      if (!forcedReason) forcedReason = reason;
    };

    for (let i = 0; i < maxIterations; i++) {
      const intentMessages = await invokeIntent(messages, "invoke");
      messages = [...messages, ...intentMessages];
      await onUpdate(messages);

      const toolCalls = latestToolCalls(messages);
      const validation = validateToolCalls(toolCalls, intentToolNames);

      if (validation.invalid.length) {
        messages = [...messages, new SystemMessage({ content: buildToolValidationMessage(validation.invalid) })];
        await onUpdate(messages);
        lastToolCallsSignature = null;
        identicalToolCallStreak = 0;
        continue;
      }

      const runnableCalls = validation.valid.filter((call) => !isRespondToolCall(call));
      const wantsRespond = validation.valid.some(isRespondToolCall);

      const toolCallsSignature = canonicalToolCalls(runnableCalls);
      if (toolCallsSignature) {
        if (toolCallsSignature === lastToolCallsSignature) {
          identicalToolCallStreak += 1;
        } else {
          identicalToolCallStreak = 1;
          lastToolCallsSignature = toolCallsSignature;
        }
      } else {
        identicalToolCallStreak = 0;
        lastToolCallsSignature = null;
      }

      if (toolCallsSignature && identicalToolCallStreak >= 3) {
        const firstCall = runnableCalls[0] ?? validation.valid[0];
        const name = firstCall?.name ?? firstCall?.function?.name ?? "unknown_tool";
        setForcedReason(`Tool "${name}" was requested with identical parameters ${identicalToolCallStreak} times`);
      }

      if (wantsRespond || runnableCalls.length === 0 || forcedReason) {
        const responseMessage = await invokeRespond(addFailureContext(messages, forcedReason));
        messages = [...messages, responseMessage];
        await onUpdate(messages);
        responded = true;
        break;
      }

      const toolMessages = await runToolCalls(runnableCalls, toolMap);
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

  /* c8 ignore start */
  async function* streamMessages(initialMessages: BaseMessage[]) {
    let messages = ensureToolAvailabilityContext(
      ensureToolFormatInstructions(ensureIntentSystemPrompt(initialMessages)),
      toolAvailabilityMessage
    );
    let responded = false;
    let forcedReason: string | null = null;
    let lastToolCallsSignature: string | null = null;
    let identicalToolCallStreak = 0;

    const setForcedReason = (reason: string) => {
      if (!forcedReason) forcedReason = reason;
    };

    for (let i = 0; i < maxIterations; i++) {
      const intentMessages = await invokeIntent(messages, "stream");
      messages = [...messages, ...intentMessages];
      if (onUpdateHook) await onUpdateHook(messages);

      const toolCalls = latestToolCalls(messages);
      const validation = validateToolCalls(toolCalls, intentToolNames);

      if (validation.invalid.length) {
        messages = [...messages, new SystemMessage({ content: buildToolValidationMessage(validation.invalid) })];
        if (onUpdateHook) await onUpdateHook(messages);
        yield { messages };
        lastToolCallsSignature = null;
        identicalToolCallStreak = 0;
        continue;
      }

      const runnableCalls = validation.valid.filter((call) => !isRespondToolCall(call));
      const wantsRespond = validation.valid.some(isRespondToolCall);

      const toolCallsSignature = canonicalToolCalls(runnableCalls);
      if (toolCallsSignature) {
        if (toolCallsSignature === lastToolCallsSignature) {
          identicalToolCallStreak += 1;
        } else {
          identicalToolCallStreak = 1;
          lastToolCallsSignature = toolCallsSignature;
        }
      } else {
        identicalToolCallStreak = 0;
        lastToolCallsSignature = null;
      }

      if (toolCallsSignature && identicalToolCallStreak >= 3) {
        const firstCall = runnableCalls[0] ?? validation.valid[0];
        const name = firstCall?.name ?? firstCall?.function?.name ?? "unknown_tool";
        setForcedReason(`Tool "${name}" was requested with identical parameters ${identicalToolCallStreak} times`);
      }

      if (wantsRespond || runnableCalls.length === 0 || forcedReason) {
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
  /* c8 ignore end */

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

export function mapOpenAIToMessages(input: OpenAIMessage[]): BaseMessage[] {
  return input.map((msg) => {
    const content = msg.content ?? "";
    if (!VALID_ROLES.has(msg.role)) {
      throw new Error(`Unsupported role "${String(msg.role)}"`);
    }
    if (containsChatMLMarkers(content)) {
      throw new Error("Unsupported ChatML markers in message content");
    }
    switch (msg.role) {
      case "system":
        return new SystemMessage({ content });
      case "user":
        return new HumanMessage({ content });
      case "assistant": {
        const toolCalls: AIMessage["tool_calls"] = [];

        if (Array.isArray(msg.tool_calls)) {
          for (const call of msg.tool_calls) {
            const name = call.function.name ?? "tool_call";
            const fallbackId = `${name}_${toolCalls.length}`;
            const id = typeof call.id === "string" && call.id.trim() ? call.id : fallbackId;
            const rawArgs = call.function.arguments;
            const parsedArgs = parseToolInput(rawArgs);
            const argsObject = isRecord(parsedArgs) ? parsedArgs : { value: parsedArgs };

            toolCalls.push({
              id,
              type: "tool_call",
              name,
              args: argsObject as Record<string, unknown>,
              function: {
                name,
                arguments: typeof rawArgs === "string" ? rawArgs : safeStringify(rawArgs)
              }
            } as LangGraphToolCall);
          }
        }

        if (msg.function_call) {
          const rawArgs = msg.function_call.arguments;
          const parsedArgs = parseToolInput(rawArgs);
          const argsObject = isRecord(parsedArgs) ? parsedArgs : { value: parsedArgs };

          toolCalls.push({
            id: msg.function_call.name ?? "function_call",
            type: "tool_call",
            name: msg.function_call.name,
            args: argsObject as Record<string, unknown>,
            function: {
              name: msg.function_call.name,
              arguments: typeof rawArgs === "string" ? rawArgs : safeStringify(rawArgs)
            }
          } as LangGraphToolCall);
        }

        const aiFields: AIMessageFields = { content };
        if (toolCalls.length) {
          (aiFields as { tool_calls?: AIMessage["tool_calls"] }).tool_calls = toolCalls;
        }
        return new AIMessage(aiFields);
      }
      case "tool":
        return new ToolMessage({
          tool_call_id: msg.tool_call_id ?? msg.name ?? "unknown_tool_call",
          content
        });
      default:
        throw new Error("Unsupported role");
    }
  });
}

// Exposed for focused unit tests
export const __agentTestHooks = {
  classifyError,
  hasToolCall,
  extractTokenUsage,
  instrumentTools
};

