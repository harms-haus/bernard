import { StateGraph, START, END } from "@langchain/langgraph";
import { BernardState, MAX_ROUTER_ITERATIONS } from "./state";
import { recollectionNode } from "../node/recollection.node";
import { routingAgentNode, type RoutingAgentContext } from "../routing.agent";
import { responseAgentNode, type ResponseAgentContext } from "../response.agent";
import { createToolNode } from "./toolNode";
import { AIMessage } from "@langchain/core/messages";

/**
 * Create the text chat graph with full trace streaming
 * 
 * Similar to voice graph but with:
 * - Full trace event streaming
 * - Progressive status updates as tool categories are called
 * - Longer tool execution tolerance
 */
export function createTextChatGraph(
  routingContext: RoutingAgentContext,
  responseContext: ResponseAgentContext
) {
  const tools = routingContext.tools;
  const toolNode = createToolNode(tools);

  // Conditional edge function - determines whether to continue with tools or go to response
  function shouldContinue(state: typeof BernardState.State): typeof END | "tools" | "response" {
    const lastMessage = state.messages[state.messages.length - 1];

    // Force response if maximum iterations reached to prevent infinite loops
    if (state.iterationCount >= MAX_ROUTER_ITERATIONS) {
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

  // Create router node with context binding
  const routerNode = async (
    state: typeof BernardState.State,
    config: { configurable?: { thread_id?: string } }
  ) => {
    const result = await routingAgentNode(state, config, routingContext);
    return {
      ...result,
      iterationCount: (state.iterationCount ?? 0) + 1,
    };
  };

  // Create response node with context binding
  const responseNode = async (
    state: typeof BernardState.State,
    config: { configurable?: { thread_id?: string } }
  ) => {
    return responseAgentNode(state, config, responseContext);
  };

  // Build the graph (same structure as voice, but can be extended with trace streaming)
  const graph = new StateGraph(BernardState)
    .addNode("recollection", recollectionNode)
    .addNode("router", routerNode)
    .addNode("tools", toolNode)
    .addNode("response", responseNode)
    .addEdge(START, "recollection")
    .addEdge("recollection", "router")
    .addConditionalEdges("router", shouldContinue, {
      tools: "tools",
      response: "response",
    })
    .addEdge("tools", "router") // Loop back to router after tools
    .addEdge("response", END);

  return graph.compile();
}
