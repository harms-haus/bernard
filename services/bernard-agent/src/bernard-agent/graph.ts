/**
 * Main Bernard agent graph using LangGraph.
 */
import {
  LangGraphRunnableConfig,
  START,
  StateGraph,
  END,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage } from "@langchain/core/messages";
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";
import { initChatModel } from "langchain/chat_models/universal";

import { BernardStateAnnotation } from "./state";
import { BernardConfigurationAnnotation } from "./configuration";
import { getSettings } from "@/lib/config/settingsCache";
import { resolveModel } from "@/lib/config/models";

import {
  webSearchToolFactory,
  getWebsiteContentToolFactory,
  wikipediaSearchToolFactory,
  wikipediaEntryToolFactory,
  getWeatherDataToolFactory,
  listHAEntitiesToolFactory,
  executeHomeAssistantServicesToolFactory,
  toggleLightToolFactory,
  getHistoricalStateToolFactory,
  ToolFactory,
} from "./tools";
import { buildReactSystemPrompt } from "./prompts/react.prompt";


interface DisabledTool {
  name: string;
  reason?: string | undefined;
}

async function validateAndGetTools(): Promise<{
  validTools: any[];
  disabledTools: DisabledTool[];
}> {
  const disabledTools: DisabledTool[] = [];
  const validTools: any[] = [];

  const toolDefinitions: ToolFactory[] = [
    webSearchToolFactory,
    getWebsiteContentToolFactory,
    wikipediaSearchToolFactory,
    wikipediaEntryToolFactory,
    getWeatherDataToolFactory,
    listHAEntitiesToolFactory,
    executeHomeAssistantServicesToolFactory,
    toggleLightToolFactory,
    getHistoricalStateToolFactory,
  ];

  for (const factory of toolDefinitions) {
    if (factory) {
      const result = await factory();

      if (result.ok) {
        validTools.push(result.tool);
      } else {
        const disabledTool: DisabledTool = { name: result.name, reason: result.reason };
        disabledTools.push(disabledTool);
      }
    }
  }

  return { validTools, disabledTools };
}

async function callReactModel(
  state: typeof BernardStateAnnotation.State,
  _config: LangGraphRunnableConfig,
) {
  const {id, options} = await resolveModel("router");
  const llm = await initChatModel(id, options);

  const { validTools, disabledTools } = await validateAndGetTools();

  const boundLLM = llm.bindTools ? llm.bindTools(validTools) : llm;

  const result = await boundLLM.invoke(
    [{ role: "system", content: buildReactSystemPrompt(new Date(), [], disabledTools) }, ...state.messages],
    { configurable: { model: id } }
  );

  return { messages: [result] };
}

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

async function executeTools(
  state: typeof BernardStateAnnotation.State,
  _config: LangGraphRunnableConfig,
) {
  const { validTools } = await validateAndGetTools();

  const toolNode = new ToolNode(validTools);
  const result = await toolNode.invoke(state, { configurable: {} });

  return { messages: result.messages };
}

export async function createBernardGraph() {
  const settings = await getSettings();
  const redisUrl = settings.services?.infrastructure?.redisUrl ?? "redis://localhost:6379";

  const workflow = new StateGraph(
    BernardStateAnnotation,
    BernardConfigurationAnnotation,
  )
    .addNode("call_react_model", callReactModel)
    .addNode("tools", executeTools)

    .addEdge(START, "call_react_model")
    .addConditionalEdges(
      "call_react_model",
      shouldCallTools,
      { tools: "tools", call_response_model: END }
    )
    .addEdge("tools", "call_react_model")

  const checkpointer = await RedisSaver.fromUrl(redisUrl);

  const graph = workflow.compile({
    checkpointer,
    interruptBefore: [],
    interruptAfter: [],
  });
  graph.name = "BernardAgent";
  return graph;
}

export const graph = await createBernardGraph();
