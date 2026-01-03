import type { AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { MessagesAnnotation, StateGraph, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { StructuredToolInterface } from "@langchain/core/tools";

import { getModelConfig } from "../llm/modelBuilder.js";
import { getSettings } from "@/lib/config/settingsCache.js";
import type { AgentContext } from "../agentContext.js";

/**
 * Create the Bernard assistant graph with explicit ToolNode pattern.
 *
 * This implementation uses LangGraph's explicit ToolNode for tool execution,
 * enabling real-time streaming of tool calls as per the tool-call-streaming plan.
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

  // Create the tool node for explicit tool execution
  const toolsNode = new ToolNode(availableTools);

  /**
   * callModel node - Calls the LLM with tools bound
   * This replaces the implicit tool execution via reactAgent middleware
   */
   const callModel = async (
     state: typeof MessagesAnnotation.State,
     _config: RunnableConfig,
   ): Promise<typeof MessagesAnnotation.Update> => {
    const settings = await getSettings();
    const modelConfig = await getModelConfig(settings.models.router);

    // Get system prompt for router (same as in react.agent.ts)
    const now = new Date();
    const timeStr = now.toLocaleString(undefined, { timeZone: process.env.TZ || undefined });

    const systemPrompt = `You are a Tool Executor. Your job is to choose and call the appropriate tool(s) for the user's query. You are not allowed to chat.

Current time: ${timeStr}

Instructions:
1. Analyze the user's query to determine what information is needed and/or what actions are needed to be taken.
2. Use available tools to gather required data and/or perform the requested actions.
3. When you have sufficient information and/or have performed all requested actions, respond with no tool calls.
4. Do not generate response text - only gather data and/or perform actions.

Call tools as needed, then respond with no tool calls when you are done.`;

    // Bind tools to the model and invoke
    // LanguageModelLike is a union type that doesn't include bindTools, so we need to cast
    const modelWithTools = (modelConfig as unknown as { bindTools(tools: StructuredToolInterface[]): { invoke(input: unknown[]): Promise<BaseMessage> } }).bindTools(availableTools);

    const response = await modelWithTools.invoke([
      {
        role: "system",
        content: systemPrompt,
      },
      ...state.messages,
    ]);

    return { messages: [response] };
  };

  /**
   * responseNode - Calls the LLM without tools (for final response generation)
   */
   const responseNode = async (
     state: typeof MessagesAnnotation.State,
     _config: RunnableConfig,
   ): Promise<typeof MessagesAnnotation.Update> => {
    const settings = await getSettings();
    const modelConfig = await getModelConfig(settings.models.response);

    // Get system prompt for response agent
    const now = new Date();
    const timeStr = now.toLocaleString(undefined, { timeZone: process.env.TZ || undefined });

    const systemPrompt = `You are a helpful voice assistant. Respond to the user in a natural, conversational way.

Current time: ${timeStr}

Use the provided information from tool calls to craft a helpful, informative response.
Do not mention that you used tools - just provide the answer directly.`;

    const model = modelConfig;

    const response = await model.invoke([
      {
        role: "system",
        content: systemPrompt,
      },
      ...state.messages,
    ]);

    return { messages: [response] };
  };

  /**
   * routeModelOutput - Determines where to route after callModel
   * Returns "tools" if the LLM made tool calls, otherwise "response"
   */
  function routeModelOutput(state: typeof MessagesAnnotation.State): typeof END | "tools" | "response" {
    const lastMessage = state.messages[state.messages.length - 1];

    // Check if it's an AIMessage with tool_calls
    if (!lastMessage || !("tool_calls" in lastMessage)) {
      return "response";
    }

    const toolCalls = (lastMessage as AIMessage).tool_calls;
    if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
      return "tools";
    }

    return "response";
  }

  // Build the graph with explicit ToolNode pattern
  const graph = new StateGraph(MessagesAnnotation)
    // Define the nodes
    .addNode("callModel", callModel)
    .addNode("tools", toolsNode)
    .addNode("response", responseNode)
    // Set the entrypoint
    .addEdge(START, "callModel")
    // Conditional edges from callModel - route based on tool calls
    .addConditionalEdges("callModel", routeModelOutput, {
      tools: "tools",
      response: "response",
    })
    // After tools, loop back to callModel for next iteration
    .addEdge("tools", "callModel")
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
        // Extract message content - handle both string and structured content
        if (message && typeof message.content === "string") {
          yield { type: mode, content: message.content, metadata };
        } else if (message && Array.isArray(message.content)) {
          // Handle content arrays (e.g., from tool results)
          yield { type: mode, content: message.content, metadata };
        } else {
          yield { type: mode, content: message, metadata };
        }
      } else if (mode === "updates") {
        for (const [_node, data] of Object.entries(chunk as Record<string, unknown>)) {
          if (data && typeof data === "object" && "messages" in data) {
            const messagesData = (data as { messages: unknown[] }).messages;
            if (messagesData && messagesData.length > 0) {
              const [message] = messagesData;
              if (message && typeof (message as { content?: unknown }).content === "string") {
                yield { type: mode, content: (message as { content: string }).content };
              }
            }
          }
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
