import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool as toolFactory } from "@langchain/core/tools";

import { tools as baseTools } from "@/libs/tools";
import type { RecordKeeper } from "@/lib/recordKeeper";

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
  model: string;
};
/* c8 ignore end */

function classifyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/rate limit/i.test(message) || /429/.test(message)) return "rate_limit";
  if (/timeout/i.test(message)) return "timeout";
  if (/auth/i.test(message)) return "auth";
  return "other";
}

function hasToolCall(messages: BaseMessage[]): boolean {
  const last = messages[messages.length - 1];
  const toolCalls = (last as { tool_calls?: unknown[] } | undefined)?.tool_calls;
  return Array.isArray(toolCalls) && toolCalls.length > 0;
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
      async (input, runOpts) => {
        const start = Date.now();
        try {
            const rawInput =
              (input as any)?.args ??
              (input as any)?.input ??
              (input as any)?.function?.arguments ??
              (runOpts as any)?.toolCall?.args ??
              (runOpts as any)?.toolCall?.function?.arguments ??
              input;
            const parsedInput =
              typeof rawInput === "string"
                ? (() => {
                    try {
                      return JSON.parse(rawInput);
                    } catch {
                      return rawInput;
                    }
                  })()
                : rawInput;
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
        ...(t.schema ? { schema: t.schema as any } : {})
      } as any)
    )
  );
}

function callModel(ctx: AgentContext, model: ChatOpenAI, tools: ReturnType<typeof instrumentTools>) {
  const bound = model.bindTools(tools);
  return async (state: { messages: BaseMessage[] }) => {
    const start = Date.now();
    const result = await bound.invoke(state.messages);
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

    await ctx.recordKeeper.recordOpenRouterResult(ctx.turnId, ctx.model, openRouterResult);

    return { messages: [result] };
  };
}

type GraphDeps = {
  model?: ChatOpenAI;
  tools?: InstrumentedTool[];
  ChatOpenAI?: typeof ChatOpenAI;
  toolNode?: ToolNode;
  onUpdate?: (messages: BaseMessage[]) => void | Promise<void>;
};

export function buildGraph(ctx: AgentContext, deps: GraphDeps = {}) {
  const ChatOpenAIImpl = deps.ChatOpenAI ?? ChatOpenAI;
  const model =
    deps.model ??
    new ChatOpenAIImpl({
      model: ctx.model ?? process.env["OPENROUTER_MODEL"] ?? "kwaipilot/KAT-coder-v1:free",
      apiKey: process.env["OPENROUTER_API_KEY"],
      configuration: {
        baseURL: process.env["OPENROUTER_BASE_URL"] ?? "https://openrouter.ai/api/v1"
      },
      temperature: 0.2
    });

  const instrumentedTools = instrumentTools(ctx, deps.tools);
  const toolNode = deps.toolNode ?? new ToolNode(instrumentedTools, { handleToolErrors: false });
  const modelStep = callModel(ctx, model, instrumentedTools);
  const maxIterations = 8;
  const onUpdateHook = deps.onUpdate;

  const runTools = async (messages: BaseMessage[]): Promise<BaseMessage[]> => {
    const result = await toolNode.invoke({ messages });
    if (Array.isArray(result)) return result;
    if (result && typeof result === "object" && "messages" in result) {
      return (result as { messages?: BaseMessage[] }).messages ?? [];
    }
    return [];
  };

  const execute = async (
    initialMessages: BaseMessage[],
    onUpdate: (messages: BaseMessage[]) => void | Promise<void> = onUpdateHook ?? (() => {})
  ): Promise<BaseMessage[]> => {
    let messages = initialMessages;
    for (let i = 0; i < maxIterations; i++) {
      const modelResult = await modelStep({ messages });
      /* c8 ignore next */
      const nextMessages = modelResult.messages ?? [];
      messages = [...messages, ...nextMessages];
      await onUpdate(messages);
      if (!hasToolCall(messages)) break;
      const toolMessages = await runTools(messages);
      messages = [...messages, ...toolMessages];
      await onUpdate(messages);
    }
    return messages;
  };

  /* c8 ignore start */
  async function* streamMessages(initialMessages: BaseMessage[]) {
    let messages = initialMessages;
    for (let i = 0; i < maxIterations; i++) {
      const modelResult = await modelStep({ messages });
      const nextMessages = modelResult.messages ?? [];
      messages = [...messages, ...nextMessages];
      if (onUpdateHook) await onUpdateHook(messages);
      yield { messages };
      if (!hasToolCall(messages)) break;
      const toolMessages = await runTools(messages);
      messages = [...messages, ...toolMessages];
      if (onUpdateHook) await onUpdateHook(messages);
      yield { messages };
    }
  }
  /* c8 ignore end */

  return {
    async invoke(input: { messages: BaseMessage[] }) {
      const messages = await execute(input.messages ?? []);
      return { messages };
    },
    async stream(input: { messages: BaseMessage[] }) {
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
      case "assistant":
        return new AIMessage({
          content,
          tool_calls: msg.tool_calls as AIMessage["tool_calls"]
        } as any);
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

