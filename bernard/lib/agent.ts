import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { AIMessageChunk, BaseMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool as toolFactory } from "@langchain/core/tools";

import { tools as baseTools } from "@/libs/tools";
import type { RecordKeeper } from "@/lib/recordKeeper";
import { getPrimaryModel, resolveApiKey, resolveBaseUrl } from "./models";

/* c8 ignore start */
type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type OpenAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<{ type: string; text?: string }> | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

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

    const fnCandidate = (input as { function?: ToolFunctionArgs }).function;
    if (isRecord(fnCandidate) && fnCandidate.arguments !== undefined) {
      candidates.push(fnCandidate.arguments);
    }
  }

  if (isRecord(runOpts)) {
    const toolCallCandidate = (runOpts as ToolRunOpts).toolCall;
    if (isRecord(toolCallCandidate)) {
      if (toolCallCandidate.args !== undefined) candidates.push(toolCallCandidate.args);
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
  return toolCalls.map((call) => {
    if (call && typeof call === "object") {
      const record = call as ToolCallRecord;
      const fnName = record.function?.name;
      if (fnName && !record.name) {
        record.name = fnName;
      }
      return record;
    }
    return { name: String(call) } as ToolCallRecord;
  });
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

type InstrumentedTool = {
  name: string;
  description: string;
  schema?: unknown;
  invoke: (input: unknown, runOpts?: unknown) => Promise<unknown>;
};

type TokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
};

function extractTokenUsage(result: unknown): TokenUsage {
  if (!result || typeof result !== "object") return {};
  const withUsage = result as {
    response_metadata?: { token_usage?: TokenUsage };
    usage_metadata?: TokenUsage;
  };
  return withUsage.response_metadata?.token_usage ?? withUsage.usage_metadata ?? {};
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
          const res = await t.invoke(parsedInput, runOpts);
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

    return { messages: [result] };
  };
}

type GraphDeps = {
  model?: ChatOpenAI;
  intentModel?: ChatOpenAI;
  responseModel?: ChatOpenAI;
  tools?: InstrumentedTool[];
  ChatOpenAI?: typeof ChatOpenAI;
  toolNode?: ToolNode;
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
      temperature: 0.2
    });

  const instrumentedTools = instrumentTools(ctx, deps.tools);
  const respondTool = toolFactory(() => "respond", {
    name: "respond",
    description:
      "Use this when you are ready to stop gathering data and deliver the final answer to the user. " +
      "Do not request additional tools after calling this."
  });
  const intentTools = [...instrumentedTools, respondTool];

  const toolNode = deps.toolNode ?? new ToolNode(instrumentedTools, { handleToolErrors: false });
  const intentStep = callIntentModel(ctx, intentModelName, intentLLM, intentTools);
  const streamingIntentModel = intentLLM.bindTools(intentTools);
  const maxIterations = 8;
  const onUpdateHook = deps.onUpdate;

  const runTools = async (messages: BaseMessage[]): Promise<BaseMessage[]> => {
    const result: unknown = await toolNode.invoke({ messages });
    if (Array.isArray(result)) return result as BaseMessage[];
    if (result && typeof result === "object" && "messages" in result) {
      const messagesResult = (result as { messages?: unknown }).messages;
      return Array.isArray(messagesResult) ? (messagesResult as BaseMessage[]) : [];
    }
    return [];
  };

  const responseContext = (messages: BaseMessage[]) => dropRespondToolCalls(messages);

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
    try {
      const filtered = responseContext(messages);
      const rawResult: unknown = await responseLLM.invoke(filtered);
      if (!rawResult || typeof rawResult !== "object") {
        throw new Error("Response model returned invalid result");
      }
      const result = rawResult as BaseMessage;
      const usage = extractTokenUsage(result);
      await recordRespondMetrics(usage, Date.now() - start, true);
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

    try {
      const responseStream = await responseLLM.stream(filtered);

      for await (const chunk of responseStream) {
        responseAggregated = responseAggregated ? responseAggregated.concat(chunk) : chunk;
        const currentMessages = [...messages, responseAggregated];
        if (onUpdateHook) await onUpdateHook(currentMessages);
        yield { messages: currentMessages };
      }

      if (!responseAggregated) {
        throw new Error("Response model returned no chunks");
      }

      const usage = extractTokenUsage(responseAggregated);
      await recordRespondMetrics(usage, Date.now() - start, true);
      const finalMessages = [...messages, responseAggregated];
      if (onUpdateHook) await onUpdateHook(finalMessages);
      yield { messages: finalMessages };
      return finalMessages;
    } catch (err) {
      await recordRespondMetrics({}, Date.now() - start, false, classifyError(err));
      throw err;
    }
  }

  const execute = async (
    initialMessages: BaseMessage[],
    onUpdate: (messages: BaseMessage[]) => void | Promise<void> = onUpdateHook ?? (() => {})
  ): Promise<BaseMessage[]> => {
    let messages = initialMessages;
    let responded = false;
    for (let i = 0; i < maxIterations; i++) {
      const modelResult = await intentStep({ messages });
      const nextMessages = modelResult.messages ?? [];
      messages = [...messages, ...nextMessages];
      await onUpdate(messages);
      const toolCalls = latestToolCalls(messages);
      const wantsRespond = toolCalls.some(isRespondToolCall);
      if (!toolCalls.length || wantsRespond) {
        const responseMessage = await invokeRespond(messages);
        messages = [...messages, responseMessage];
        await onUpdate(messages);
        responded = true;
        break;
      }
      const toolMessages = await runTools(messages);
      messages = [...messages, ...toolMessages];
      await onUpdate(messages);
    }

    if (!responded) {
      const responseMessage = await invokeRespond(messages);
      messages = [...messages, responseMessage];
      await onUpdate(messages);
    }
    return messages;
  };

  /* c8 ignore start */
  async function* streamMessages(initialMessages: BaseMessage[]) {
    let messages = initialMessages;
    let responded = false;

    for (let i = 0; i < maxIterations; i++) {
      const start = Date.now();
      const stream = await streamingIntentModel.stream(messages);

      let aggregated: AIMessageChunk | null = null;
      let latestToolCalls: ToolCallRecord[] | undefined;
      let latestToolCallChunks: unknown[] | undefined;
      for await (const chunk of stream) {
        const chunkToolCalls =
          (chunk as { tool_calls?: unknown[]; additional_kwargs?: { tool_calls?: unknown[] } }).tool_calls ??
          (chunk as { additional_kwargs?: { tool_calls?: unknown[] } }).additional_kwargs?.tool_calls;
        const chunkToolCallChunks =
          (chunk as { tool_call_chunks?: unknown[]; additional_kwargs?: { tool_call_chunks?: unknown[] } }).tool_call_chunks ??
          (chunk as { additional_kwargs?: { tool_call_chunks?: unknown[] } }).additional_kwargs?.tool_call_chunks;

        if (Array.isArray(chunkToolCalls) && chunkToolCalls.length) latestToolCalls = normalizeToolCalls(chunkToolCalls);
        if (Array.isArray(chunkToolCallChunks) && chunkToolCallChunks.length) latestToolCallChunks = chunkToolCallChunks;

        aggregated = aggregated ? aggregated.concat(chunk) : chunk;
        if (aggregated && latestToolCalls) {
          (aggregated as { tool_calls?: unknown[] }).tool_calls = latestToolCalls;
        }
        if (aggregated && latestToolCallChunks) {
          (aggregated as { tool_call_chunks?: unknown[] }).tool_call_chunks = latestToolCallChunks;
        }
        const currentMessages = [...messages, aggregated];
        if (onUpdateHook) await onUpdateHook(currentMessages);
        const isResponding = latestToolCalls?.some(isRespondToolCall);
        if (!isResponding) {
          yield { messages: currentMessages };
        }
      }

      if (!aggregated) {
        throw new Error("Model returned no chunks");
      }

      if (latestToolCalls) {
        (aggregated as { tool_calls?: unknown[] }).tool_calls = latestToolCalls;
      }
      if (latestToolCallChunks) {
        (aggregated as { tool_call_chunks?: unknown[] }).tool_call_chunks = latestToolCallChunks;
      }

      const usage = extractTokenUsage(aggregated);
      const tokensIn = usage.prompt_tokens ?? usage.input_tokens;
      const tokensOut = usage.completion_tokens ?? usage.output_tokens;
      await ctx.recordKeeper.recordOpenRouterResult(ctx.turnId, intentModelName, {
        ok: true,
        latencyMs: Date.now() - start,
        ...(typeof tokensIn === "number" ? { tokensIn } : {}),
        ...(typeof tokensOut === "number" ? { tokensOut } : {})
      });

      messages = [...messages, aggregated];
      const toolCalls = latestToolCalls ?? [];
      const wantsRespond = toolCalls.some(isRespondToolCall);
      if (!toolCalls.length || wantsRespond) {
        for await (const responseChunk of streamRespond(messages)) {
          messages = responseChunk.messages ?? messages;
          yield responseChunk;
        }
        responded = true;
        break;
      }

      const toolMessages = await runTools(messages);
      messages = [...messages, ...toolMessages];
      if (onUpdateHook) await onUpdateHook(messages);
      yield { messages };
    }

    if (!responded) {
      for await (const responseChunk of streamRespond(messages)) {
        messages = responseChunk.messages ?? messages;
        yield responseChunk;
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
    switch (msg.role) {
      case "system":
        return new SystemMessage({ content });
      case "user":
        return new HumanMessage({ content });
      case "assistant": {
        const toolCalls =
          msg.tool_calls?.map((call) => ({
            id: call.id,
            type: "tool_call",
            function: {
              name: call.function.name,
              arguments: call.function.arguments
            }
          })) ?? [];
        return new AIMessage({
          content,
          tool_calls: toolCalls.length ? (toolCalls as AIMessage["tool_calls"]) : undefined
        });
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

