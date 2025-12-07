import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool as toolFactory } from "@langchain/core/tools";

import { tools as baseTools } from "@/libs/tools";
import type { RecordKeeper } from "@/lib/recordKeeper";

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

function classifyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/rate limit/i.test(message) || /429/.test(message)) return "rate_limit";
  if (/timeout/i.test(message)) return "timeout";
  if (/auth/i.test(message)) return "auth";
  return "other";
}

function hasToolCall(messages: BaseMessage[]): boolean {
  const last = messages[messages.length - 1];
  return last instanceof AIMessage && Array.isArray(last.tool_calls) && last.tool_calls.length > 0;
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

function instrumentTools(ctx: AgentContext) {
  const tools = baseTools as InstrumentedTool[];
  return tools.map((t) =>
    toolFactory(
      async (input, runOpts) => {
        const start = Date.now();
        try {
          const res = await t.invoke(input, runOpts);
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
      {
        name: t.name,
        description: t.description,
        schema: t.schema
      }
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

    await ctx.recordKeeper.recordOpenRouterResult(ctx.turnId, ctx.model, {
      ok: true,
      latencyMs: latency,
      tokensIn: typeof tokensIn === "number" ? tokensIn : undefined,
      tokensOut: typeof tokensOut === "number" ? tokensOut : undefined
    });

    return { messages: [result] };
  };
}

export function buildGraph(ctx: AgentContext) {
  const model = new ChatOpenAI({
    model: ctx.model ?? process.env.OPENROUTER_MODEL ?? "kwaipilot/KAT-coder-v1:free",
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1"
    },
    temperature: 0.2
  });

  const instrumentedTools = instrumentTools(ctx);
  const toolNode = new ToolNode(instrumentedTools);

  const workflow = new StateGraph(MessagesAnnotation)
    .addNode("agent", callModel(ctx, model, instrumentedTools))
    .addNode("tools", toolNode)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", (state) => (hasToolCall(state.messages) ? "tools" : "__end__"))
    .addEdge("tools", "agent");

  return workflow.compile();
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
        });
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

