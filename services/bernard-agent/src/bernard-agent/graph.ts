/**
 * Main Bernard agent graph using LangGraph.
 * 
 * Implements a ReAct pattern with:
 * - call_react_model: Routing agent that decides which tools to call
 * - tools: Executes tool calls using ToolNode
 * - call_response_model: Generates final natural language response
 */
import {
  LangGraphRunnableConfig,
  START,
  StateGraph,
  END,
  MemorySaver,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage } from "@langchain/core/messages";

import { BernardStateAnnotation } from "./state.js";
import { BernardConfigurationAnnotation, ensureBernardConfiguration } from "./configuration.js";
import { loadChatModel } from "./utils.js";

import {
  webSearchTool,
  getWebsiteContentTool,
  wikipediaSearchTool,
  wikipediaEntryTool,
  getWeatherDataTool,
  createListHAEntitiesTool,
  createExecuteHomeAssistantServicesTool,
  createToggleLightTool,
  createGetHistoricalStateTool,
} from "./tools/index.js";

/**
 * Node: call_react_model
 * 
 * The routing agent - decides which tools to call, then decides if more are needed.
 * Has tools bound so it can output tool calls.
 */
async function callReactModel(
  state: typeof BernardStateAnnotation.State,
  config: LangGraphRunnableConfig,
): Promise<typeof BernardStateAnnotation.Update> {
  const bernardConfig = ensureBernardConfiguration(config);

  // Create tool instances with HA config if available
  const tools = [
    webSearchTool,
    getWebsiteContentTool,
    wikipediaSearchTool,
    wikipediaEntryTool,
    getWeatherDataTool,
    createListHAEntitiesTool(bernardConfig.homeAssistantConfig ? {
      baseUrl: bernardConfig.homeAssistantConfig.baseUrl,
      accessToken: bernardConfig.homeAssistantConfig.accessToken,
    } : undefined),
    createExecuteHomeAssistantServicesTool(bernardConfig.homeAssistantConfig ? {
      baseUrl: bernardConfig.homeAssistantConfig.baseUrl,
      accessToken: bernardConfig.homeAssistantConfig.accessToken,
    } : undefined),
    createToggleLightTool(bernardConfig.homeAssistantConfig ? {
      baseUrl: bernardConfig.homeAssistantConfig.baseUrl,
      accessToken: bernardConfig.homeAssistantConfig.accessToken,
    } : undefined),
    createGetHistoricalStateTool(bernardConfig.homeAssistantConfig ? {
      baseUrl: bernardConfig.homeAssistantConfig.baseUrl,
      accessToken: bernardConfig.homeAssistantConfig.accessToken,
    } : undefined),
  ];

  const llm = await loadChatModel(bernardConfig.reactModel);
  // bindTools is available on BaseChatModel instances - cast to any to handle type variations
  const boundLLM = (llm as any).bindTools ? (llm as any).bindTools(tools) : llm;

  const systemPrompt = bernardConfig.systemPrompt
    .replace("{time}", new Date().toISOString());

  const result = await boundLLM.invoke(
    [{ role: "system", content: systemPrompt }, ...state.messages],
    { configurable: { model: bernardConfig.reactModel } }
  );

  return { messages: [result] };
}

/**
 * Route from call_react_model: tools or response?
 */
function shouldCallTools(
  state: typeof BernardStateAnnotation.State,
): "tools" | "call_response_model" {
  const lastMessage = state.messages[state.messages.length - 1];

  if (!lastMessage || !("tool_calls" in lastMessage)) {
    return "call_response_model";
  }

  const toolCalls = (lastMessage as AIMessage).tool_calls;
  if (!toolCalls || toolCalls.length === 0) {
    return "call_response_model";
  }

  return "tools";
}

/**
 * Node: tools
 * 
 * Execute tool calls using prebuilt ToolNode.
 * CRITICAL: After tools execute, we ALWAYS return to call_react_model.
 */
async function executeTools(
  state: typeof BernardStateAnnotation.State,
  config: LangGraphRunnableConfig,
): Promise<typeof BernardStateAnnotation.Update> {
  const bernardConfig = ensureBernardConfiguration(config);

  // Create tool instances with HA config if available
  const tools = [
    webSearchTool,
    getWebsiteContentTool,
    wikipediaSearchTool,
    wikipediaEntryTool,
    getWeatherDataTool,
    createListHAEntitiesTool(bernardConfig.homeAssistantConfig ? {
      baseUrl: bernardConfig.homeAssistantConfig.baseUrl,
      accessToken: bernardConfig.homeAssistantConfig.accessToken,
    } : undefined),
    createExecuteHomeAssistantServicesTool(bernardConfig.homeAssistantConfig ? {
      baseUrl: bernardConfig.homeAssistantConfig.baseUrl,
      accessToken: bernardConfig.homeAssistantConfig.accessToken,
    } : undefined),
    createToggleLightTool(bernardConfig.homeAssistantConfig ? {
      baseUrl: bernardConfig.homeAssistantConfig.baseUrl,
      accessToken: bernardConfig.homeAssistantConfig.accessToken,
    } : undefined),
    createGetHistoricalStateTool(bernardConfig.homeAssistantConfig ? {
      baseUrl: bernardConfig.homeAssistantConfig.baseUrl,
      accessToken: bernardConfig.homeAssistantConfig.accessToken,
    } : undefined),
  ];

  const toolNode = new ToolNode(tools);
  const result = await toolNode.invoke(state, config);

  return { messages: result.messages };
}

/**
 * Node: call_response_model
 * 
 * The response agent - generates the final natural language response.
 * Has NO tools bound - pure response generation.
 */
async function callResponseModel(
  state: typeof BernardStateAnnotation.State,
  config: LangGraphRunnableConfig,
): Promise<typeof BernardStateAnnotation.Update> {
  const bernardConfig = ensureBernardConfiguration(config);

  const llm = await loadChatModel(bernardConfig.responseModel);

  const systemPrompt = bernardConfig.systemPrompt
    .replace("{time}", new Date().toISOString());

  const result = await llm.invoke(
    [{ role: "system", content: systemPrompt }, ...state.messages],
    { configurable: { model: bernardConfig.responseModel } }
  );

  return { messages: [result] };
}

/**
 * Create the Bernard agent graph.
 * 
 * Graph structure:
 * 
 *     START
 *        │
 *        ▼
 *  call_react_model
 *        │
 *        ├── tools ──► tools ──► call_react_model ──► ...
 *        │
 *        └── no tools ──► call_response_model ──► END
 */
export function createBernardGraph() {
  const workflow = new StateGraph(
    BernardStateAnnotation,
    BernardConfigurationAnnotation,
  )
    .addNode("call_react_model", callReactModel)
    .addNode("tools", executeTools)
    .addNode("call_response_model", callResponseModel)

    .addEdge(START, "call_react_model")
    .addConditionalEdges(
      "call_react_model",
      shouldCallTools,
      { tools: "tools", call_response_model: "call_response_model" }
    )
    .addEdge("tools", "call_react_model")  // NO CHOICE - always ask for more
    .addEdge("call_response_model", END);

  const checkpointer = new MemorySaver();

  return workflow.compile({
    checkpointer,
    interruptBefore: [],
    interruptAfter: [],
  });
}

export const graph = createBernardGraph();
graph.name = "BernardAgent";
