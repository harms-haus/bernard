import { StateGraph, START, END, MessagesAnnotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import { reactAgent } from "../react.agent";
import { responseAgent } from "../response.agent";
import type { AgentContext } from "../agentContext";

/**
 * Create the Bernard assistant graph
 * 
 * The react node loops back to itself after tool execution until no more tools are needed.
 */
export function createBernardGraph(
  context: AgentContext,
) {

  // Conditional edge function - determines whether to continue with tools or go to response
  function shouldContinue(state: typeof MessagesAnnotation.State): typeof END | "tools" | "response" {
    const lastMessage = state.messages[state.messages.length - 1];

    // Check if it's an AIMessage before accessing tool_calls
    if (!lastMessage || !("tool_calls" in lastMessage)) {
      return "response";
    }

    // If the LLM makes a tool call, then perform an action
    if (lastMessage.tool_calls && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
      return "tools";
    }

    // Otherwise, go to response generation
    return "response";
  }

  // Create react node with context binding
  const reactNode = async (
    state: typeof MessagesAnnotation.State,
    config: { configurable?: { thread_id?: string } }
  ): Promise<{ messages: BaseMessage[] }> => {
    const agent = await reactAgent(state, config, context);
    const response = await agent.invoke(state) as { messages: BaseMessage[] };
    // Extract and normalize messages to avoid extra fields causing reducer issues
    return { messages: [...response.messages] };
  };

  // Create response node with context binding
  const responseNode = async (
    state: typeof MessagesAnnotation.State,
    config: { configurable?: { thread_id?: string } }
  ): Promise<{ messages: BaseMessage[] }> => {
    const agent = await responseAgent(state, config, context);
    const response = await agent.invoke(state, {...config, tags: ["response"]}) as { messages: BaseMessage[] };
    return { messages: [...response.messages] };
  };

  // Build the graph
  const graph = new StateGraph(MessagesAnnotation)
    .addNode("react", reactNode)
    .addNode("response", responseNode)
    .addEdge(START, "react")
    .addConditionalEdges("react", shouldContinue, {
      tools: "react",
      response: "response",
    })
    .addEdge("response", END);

  return graph.compile({ checkpointer: context.checkpointer });
}

export async function *runBernardGraph(graph: Awaited<ReturnType<typeof createBernardGraph>>, messages: BaseMessage[], stream: boolean, threadId: string): AsyncIterable<{ type: string; content: unknown }> {
  const config = { configurable: { thread_id: threadId } };
  if (stream) {
    const streamResult = await graph.stream(
      { messages }, 
      { ...config, streamMode: ["messages", "updates"] as const }
    );
    for await (const [mode, chunk] of streamResult) {
      if (mode === "messages") {
        const [message, metadata] = chunk;
        if (((metadata as Record<string, unknown>)['tags'] as string[]).includes("response")) {
          yield { type: mode, content: message.content };
        }
      } else if (mode === "updates") {
        for (const [_node, data] of Object.entries(chunk)) {
          if (data.messages && data.messages.length > 0) {
            const [message] = data.messages;
            if (message && typeof message.content === 'string') {
              yield { type: mode, content: message.content };
            }
          }
        }
      }
    }
  } else {    
    const result = await graph.invoke({ messages }, config);
    yield { type: "final", content: result };
  }
}
