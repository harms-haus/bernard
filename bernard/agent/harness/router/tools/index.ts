import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";

import { enhancedGeocodeSearchTool } from "./geocode-enhanced";
import { memorizeTool } from "./memorize";
import { webSearchTool } from "./web-search";
import { getWeatherCurrentTool } from "./weather-current";
import { getWeatherForecastTool } from "./weather-forecast";
import { getWeatherHistoricalTool } from "./weather-historical";
import { createListHAServicesToolInstance } from "./ha-execute-services";
import { createExecuteServicesToolInstance } from "./ha-execute-services";
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
  async () => {
    return { status: "ready_to_respond" };
  },
  {
    name: "respond",
    description: "Signal that you have completed all necessary tool calls and are ready to generate a response to the user. Call this when you have gathered all the information needed.",
    schema: z.object({})
  }
);

export function getRouterTools(haContextManager?: HomeAssistantContextManager): ToolWithInterpretation[] {
  const baseTools: ToolWithInterpretation[] = [
    webSearchTool,
    enhancedGeocodeSearchTool,
    // memorizeTool,
    getWeatherCurrentTool,
    getWeatherForecastTool,
    getWeatherHistoricalTool,
    respondTool, // Add respond tool at the end
  ];

  const haTools: ToolWithInterpretation[] = haContextManager ? [
    createListHAServicesToolInstance(haContextManager),
    createExecuteServicesToolInstance(haContextManager)
  ] : [];

  return [...baseTools, ...haTools];
}

export {
  enhancedGeocodeSearchTool,
  memorizeTool,
  webSearchTool,
  getWeatherCurrentTool,
  getWeatherForecastTool,
  getWeatherHistoricalTool,
  createListHAServicesToolInstance,
  createExecuteServicesToolInstance
};


