import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";

import { webSearchTool } from "./web-search";
import { getWeatherDataTool } from "./get-weather-data";
import { createListHAEntitiesToolInstance, type HARestConfig } from "./ha-list-entities";
import { createExecuteHomeAssistantServicesToolInstance } from "./ha-execute-services";
import { createGetHistoricalStateToolInstance } from "./ha-historical-state";
import { createToggleLightToolInstance } from "./ha-toggle-light";
import type { HomeAssistantContextManager } from "./ha-context";

/**
 * Extended tool interface that includes interpretation prompts for response generation
 */
export type ToolWithInterpretation = StructuredToolInterface & {
  interpretationPrompt?: string;
};

/**
 * Respond tool - signals that router harness is complete and ready for response generation.
 * This is a no-op tool that the LLM calls to indicate it's done with tool calling.
 */
const respondTool = tool(
  () => {
    return { status: "ready_to_respond" };
  },
  {
    name: "respond",
    description: "Signal that you have completed all necessary tool calls and are ready to generate a response to the user. Call this when you have gathered all the information needed.",
    schema: z.object({})
  }
);

export function getRouterTools(haContextManager?: HomeAssistantContextManager, haRestConfig?: HARestConfig): ToolWithInterpretation[] {
  const baseTools: ToolWithInterpretation[] = [
    webSearchTool,
    // memorizeTool,
    getWeatherDataTool,
    respondTool, // Add respond tool at the end
  ];

  const haTools: ToolWithInterpretation[] = [];

  if (haContextManager || haRestConfig) {
    haTools.push(createListHAEntitiesToolInstance(haContextManager, haRestConfig));
    haTools.push(createExecuteHomeAssistantServicesToolInstance(haContextManager, haRestConfig));
    haTools.push(createToggleLightToolInstance(haContextManager, haRestConfig));
  }

  if (haRestConfig) {
    haTools.push(createGetHistoricalStateToolInstance(haRestConfig));
  }

  return [...baseTools, ...haTools];
}

export {
  webSearchTool,
  getWeatherDataTool,
  createListHAEntitiesToolInstance,
  createExecuteHomeAssistantServicesToolInstance,
  createGetHistoricalStateToolInstance,
  createToggleLightToolInstance
};


