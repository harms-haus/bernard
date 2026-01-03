import type { StructuredToolInterface } from "@langchain/core/tools";

import { webSearchTool } from "./web-search.tool";
import { getWeatherDataTool } from "./get-weather-data.tool";
import { getWebsiteContentTool } from "./website-content.tool";
import { createListHAEntitiesToolInstance } from "./home-assistant-list-entities.tool";
import { createExecuteHomeAssistantServicesToolInstance } from "./home-assistant-execute-services.tool";
import { createGetHistoricalStateToolInstance } from "./home-assistant-historical-state.tool";
import { createToggleLightToolInstance } from "./home-assistant-toggle-light.tool";
import { wikipediaSearchTool } from "./wikipedia-search.tool";
import { wikipediaEntryTool } from "./wikipedia-entry.tool";
import { createPlayPlexMediaToolInstance } from "./play_media_tv.tool";
import { recallTaskTool } from "./recall_task.tool";
import { createTimerToolInstance } from "./timer.tool";
import { getSettings } from "@/lib/config";

/**
 * Extended tool interface that includes interpretation prompts for response generation
 */
export type ToolWithInterpretation = StructuredToolInterface & {
  interpretationPrompt?: string;
};

/**
 * Result of loading tools - includes both available and disabled tools
 */
export interface LoadedTools {
  tools: ToolWithInterpretation[];
  disabledTools: Array<{ name: string; reason: string }>;
}

/**
 * Known tool names for disabled tool reporting
 */
const HA_TOOL_NAMES = [
  "list_home_assistant_entities",
  "execute_home_assistant_service",
  "toggle_home_assistant_light",
  "get_home_assistant_historical_state"
] as const;

const HA_HISTORICAL_TOOL = "get_home_assistant_historical_state";


export async function getReactTools(): Promise<LoadedTools> {
  const tools: ToolWithInterpretation[] = [];
  const disabledTools: Array<{ name: string; reason: string }> = [];

  const settings = await getSettings();
  // Base tools - always available
  tools.push(
    webSearchTool,
    getWeatherDataTool,
    wikipediaSearchTool,
    wikipediaEntryTool,
    getWebsiteContentTool,
    recallTaskTool
  );

  // Home Assistant tools - disabled if no config
  const haRestConfig = {
    baseUrl: settings.services.homeAssistant?.baseUrl ?? "",
    accessToken: settings.services.homeAssistant?.accessToken ?? ""
  };
  const hasHAConfig = haRestConfig.baseUrl && haRestConfig.accessToken;
  if (hasHAConfig) {
    tools.push(createListHAEntitiesToolInstance(haRestConfig));
    tools.push(createExecuteHomeAssistantServicesToolInstance(haRestConfig));
    tools.push(createToggleLightToolInstance(haRestConfig));
  } else {
    // Add all HA tools as disabled
    for (const toolName of HA_TOOL_NAMES) {
      disabledTools.push({
        name: toolName,
        reason: "Home Assistant not configured. Set HA_BASE_URL environment variable."
      });
    }
  }

  // Historical state tool - requires REST config specifically
  if (haRestConfig) {
    tools.push(createGetHistoricalStateToolInstance(haRestConfig));
  } else if (hasHAConfig) {
    // HA is configured but no REST - historical state needs REST
    disabledTools.push({
      name: HA_HISTORICAL_TOOL,
      reason: "Historical state requires HA_BASE_URL with access token for REST API."
    });
  }

  // Task-based tools (Plex, Timer) - disabled if no task context
  // if (taskContext) {
  //   tools.push(createPlayPlexMediaToolInstance(haRestConfig, undefined, taskContext));
  //   tools.push(createTimerToolInstance(taskContext));
  // } else {
  //   // Add task tools as disabled
  //   for (const toolName of TASK_TOOL_NAMES) {
  //     disabledTools.push({
  //       name: toolName,
  //       reason: "Background task system not configured."
  //     });
  //   }
  // }

  return { tools, disabledTools };
}

export {
  webSearchTool,
  getWeatherDataTool,
  wikipediaSearchTool,
  wikipediaEntryTool,
  getWebsiteContentTool,
  recallTaskTool,
  createListHAEntitiesToolInstance,
  createExecuteHomeAssistantServicesToolInstance,
  createGetHistoricalStateToolInstance,
  createToggleLightToolInstance,
  createPlayPlexMediaToolInstance,
  createTimerToolInstance
};
