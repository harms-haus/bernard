import { StateGraph, START, END } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage } from "@langchain/core/messages";
import { MAX_REACT_ITERATIONS, BernardState } from "./state";
import { reactAgent } from "../react.agent";
import { responseAgent } from "../response.agent";
import type { AgentContext } from "../agentContext";
import type { BernardStateType } from "./state";

/**
 * Create the Bernard assistant graph
 *  * 
 * The react node loops back to itself after tool execution until no more tools are needed.
 */
export function createBernardGraph(
  context: AgentContext,
) {

  // Conditional edge function - determines whether to continue with tools or go to response
  function shouldContinue(state: BernardStateType): typeof END | "tools" | "response" {
    const lastMessage = state.messages[state.messages.length - 1];

    // Force response if maximum iterations reached to prevent infinite loops
    if (state.iterationCount >= MAX_REACT_ITERATIONS) {
      return "response";
    }

    // Check if it's an AIMessage before accessing tool_calls
    if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
      return "response";
    }

    // If the LLM makes a tool call, then perform an action
    if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      return "tools";
    }

    // Otherwise, go to response generation
    return "response";
  }

  // Create react node with context binding
  const reactNode = async (
    state: BernardStateType,
    config: { configurable?: { thread_id?: string } }
  ) => {
    return await reactAgent(state, config, context);
  };

  // Create response node with context binding
  const responseNode = async (
    state: BernardStateType,
    config: { configurable?: { thread_id?: string } }
  ) => {
    return await responseAgent(state, config, context);
  };

  // Build the graph
  const graph = new StateGraph(BernardState)
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
    const streamResult = await graph.stream({ messages }, { ...config, streamMode: ["messages", "updates"] } as const);
    for await (const [mode, chunk] of streamResult) {
      if (mode === "messages") {
        const [message] = chunk as [BaseMessage, unknown];
        yield { type: mode, content: message.content as string };
      } else if (mode === "updates") {
        yield { type: mode, content: chunk };
      }
    }
  } else {    
    const result = await graph.invoke({ messages }, config);
    yield { type: "final", content: result };
  }
}
