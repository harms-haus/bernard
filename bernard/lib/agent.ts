import { AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";

import { tools } from "@/libs/tools";

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

function hasToolCall(messages: BaseMessage[]): boolean {
  const last = messages[messages.length - 1];
  return last instanceof AIMessage && Array.isArray(last.tool_calls) && last.tool_calls.length > 0;
}

function callModel(model: ChatOpenAI) {
  const bound = model.bindTools(tools);
  return async (state: { messages: BaseMessage[] }) => {
    const result = await bound.invoke(state.messages);
    return { messages: [result] };
  };
}

function buildGraph() {
  const model = new ChatOpenAI({
    model: process.env.OPENROUTER_MODEL ?? "kwaipilot/KAT-coder-v1:free",
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1"
    },
    temperature: 0.2
  });

  const toolNode = new ToolNode(tools);

  const workflow = new StateGraph(MessagesAnnotation)
    .addNode("agent", callModel(model))
    .addNode("tools", toolNode)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", (state) => (hasToolCall(state.messages) ? "tools" : "__end__"))
    .addEdge("tools", "agent");

  return workflow.compile();
}

let compiledGraph: ReturnType<typeof buildGraph> | null = null;

export function getGraph() {
  if (!compiledGraph) {
    compiledGraph = buildGraph();
  }
  return compiledGraph;
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
        throw new Error(`Unsupported role: ${msg.role}`);
    }
  });
}

