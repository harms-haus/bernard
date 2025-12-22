import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";

import { webSearchTool } from "./web-search";
import { getWeatherDataTool } from "./get-weather-data";
import { getWebsiteContentTool } from "./get-website-content";
import { createListHAEntitiesToolInstance, type HARestConfig } from "./ha-list-entities";
import { createExecuteHomeAssistantServicesToolInstance } from "./ha-execute-services";
import { createGetHistoricalStateToolInstance } from "./ha-historical-state";
import { createToggleLightToolInstance } from "./ha-toggle-light";
import { wikipediaSearchTool, wikipediaEntryTool } from "./wikipedia";
import type { HomeAssistantContextManager } from "./ha-context";
import { createPlayPlexMediaToolInstance, type PlexConfig } from "./plex-play-media";

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
  (args: { reason?: string }) => {
    return { status: "ready_to_respond", reason: args.reason };
  },
  {
    name: "respond",
    description: "Signal that you have completed all necessary tool calls and are ready to generate a response to the user. Call this when you have gathered all the information needed. Optionally provide a reason if the response is being forced.",
    schema: z.object({
      reason: z.string().optional().describe("Optional reason for responding (e.g., when forced due to limits)")
    })
  }
);

export function getRouterTools(haContextManager?: HomeAssistantContextManager, haRestConfig?: HARestConfig, plexConfig?: PlexConfig): ToolWithInterpretation[] {
  const baseTools: ToolWithInterpretation[] = [
    webSearchTool,
    // memorizeTool,
    getWeatherDataTool,
    wikipediaSearchTool,
    wikipediaEntryTool,
    getWebsiteContentTool,
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

  if (plexConfig) {
    haTools.push(createPlayPlexMediaToolInstance(haRestConfig, plexConfig));
  }

  return [...baseTools, ...haTools];
}

export {
  webSearchTool,
  getWeatherDataTool,
  wikipediaSearchTool,
  wikipediaEntryTool,
  getWebsiteContentTool,
  createListHAEntitiesToolInstance,
  createExecuteHomeAssistantServicesToolInstance,
  createGetHistoricalStateToolInstance,
  createToggleLightToolInstance,
  createPlayPlexMediaToolInstance
};


