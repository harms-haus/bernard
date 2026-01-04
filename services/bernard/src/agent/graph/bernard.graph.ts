import type { AIMessage, BaseMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { MessagesAnnotation, StateGraph, START, END } from "@langchain/langgraph";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { AgentContext } from "../agentContext.js";
import { getModelConfig } from "../llm/modelBuilder.js";
import { getSettings } from "@/src/lib/config/settingsCache.js";

/**
 * Create the Bernard assistant graph with explicit ToolNode pattern.
 *
 * This implementation uses LangGraph's explicit ToolNode for tool execution,
 * enabling real-time streaming of tool calls as per the tool-call-streaming plan.
 * Middleware (retry, logging, tracing) is applied via wrapper functions.
 */
export function createBernardGraph(
  context: AgentContext,
) {
  const { tools, disabledTools } = context;

  // Filter available tools based on disabledTools and cast to StructuredToolInterface
  const availableTools = tools.filter(t => {
    if (!disabledTools || disabledTools.length === 0) return true;
    return !disabledTools.some(dt => dt.name === t.name);
  }).map(t => t as unknown as StructuredToolInterface);

  const callReactModel = async (
    state: typeof MessagesAnnotation.State,
    _config: RunnableConfig,
  ): Promise<typeof MessagesAnnotation.Update> => {
    const settings = await getSettings();
    const modelConfig = await getModelConfig(settings.models.router, availableTools);
    const ai_message = await modelConfig.invoke(state.messages) as AIMessage;
    const messages = [...state.messages, ai_message];

    // Execute tools and collect results
    if (ai_message.tool_calls && ai_message.tool_calls.length > 0) {
      for (const tool_call of ai_message.tool_calls) {
        // Execute the tool with the generated arguments
        const tool = availableTools.find(t => t.name === tool_call.name);
        if (tool) {
          const toolResult = await tool.invoke(tool_call.args) as BaseMessage;
          messages.push(toolResult);
        }
      }
    }

    return { messages };
  };

  const callResponseModel = async (
    state: typeof MessagesAnnotation.State,
    _config: RunnableConfig,
  ): Promise<typeof MessagesAnnotation.Update> => {
    const settings = await getSettings();
    const modelConfig = await getModelConfig(settings.models.response, []);
    const ai_message = await modelConfig.invoke(state.messages) as AIMessage;
    const messages = [...state.messages, ai_message];
    return { messages };
  };

  const shouldContinue = (state: typeof MessagesAnnotation.State) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage || !("tool_calls" in lastMessage)) return "response";
    const toolCalls = (lastMessage as AIMessage).tool_calls;
    if (toolCalls && toolCalls.length > 0) return "tools";
    return "response";
  };

  // Build the graph with explicit ToolNode pattern and middleware
  const graph = new StateGraph(MessagesAnnotation)
    .addNode("react", callReactModel)
    .addNode("response", callResponseModel)
    .addEdge(START, "react")
    .addConditionalEdges("react", shouldContinue, {
      tools: "react",
      response: "response",
    })
    // Response node ends the graph
    .addEdge("response", END);

  return graph.compile({ checkpointer: context.checkpointer });
}

/**
 * Run the Bernard graph with streaming support.
 *
 * @param graph - The compiled graph from createBernardGraph
 * @param messages - Input conversation messages
 * @param stream - Whether to stream output
 * @param threadId - Thread ID for conversation continuity
 */
export async function *runBernardGraph(
  graph: Awaited<ReturnType<typeof createBernardGraph>>,
  messages: BaseMessage[],
  stream: boolean,
  threadId: string,
): AsyncIterable<{ type: string; content: unknown; metadata?: Record<string, unknown> }> {
  const config = { configurable: { thread_id: threadId } };
  if (stream) {
    // Use messages, updates, and custom modes for full tool call visibility
    const streamResult = await graph.stream(
      { messages },
      { ...config, streamMode: ["messages", "updates", "custom"] as const }
    );
    for await (const [mode, chunk] of streamResult) {
      if (mode === "messages") {
        const [message, metadata] = chunk as [BaseMessage, Record<string, unknown>];
        if (message) {
          const content = typeof message.content === "string" ? message.content : 
                          (Array.isArray(message.content) ? message.content : "");
          yield { type: mode, content, metadata };
        }
      } else if (mode === "updates") {
        for (const [node, data] of Object.entries(chunk as Record<string, unknown>)) {
          yield { type: mode, content: data, metadata: { node } };
        }
      } else if (mode === "custom") {
        // Forward custom data (tool progress) directly
        yield { type: mode, content: chunk };
      }
    }
  } else {
    const result = await graph.invoke({ messages }, config);
    yield { type: "final", content: result };
  }
}
