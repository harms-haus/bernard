import { type StructuredToolInterface } from "@langchain/core/tools";

import { webSearchTool } from "./web-search.tool";
import { getWeatherDataTool } from "./get-weather-data.tool";
import { getWebsiteContentTool } from "./website-content.tool";
import { createListHAEntitiesToolInstance, type HARestConfig } from "./home-assistant-list-entities.tool";
import { createExecuteHomeAssistantServicesToolInstance } from "./home-assistant-execute-services.tool";
import { createGetHistoricalStateToolInstance } from "./home-assistant-historical-state.tool";
import { createToggleLightToolInstance } from "./home-assistant-toggle-light.tool";
import { wikipediaSearchTool } from "./wikipedia-search.tool";
import { wikipediaEntryTool } from "./wikipedia-entry.tool";
import type { HomeAssistantContextManager } from "@/lib/home-assistant";
import { createPlayPlexMediaToolInstance } from "./play_media_tv.tool";
import { recallTaskTool } from "./recall_task.tool";
import { createTimerToolInstance } from "./timer.tool";

/**
 * Extended tool interface that includes interpretation prompts for response generation
 */
export type ToolWithInterpretation = StructuredToolInterface & {
  interpretationPrompt?: string;
};


export function getRouterTools(
  haContextManager?: HomeAssistantContextManager,
  haRestConfig?: HARestConfig,
  plexConfig?: unknown, // Not used anymore, kept for compatibility
  taskContext?: {
    conversationId: string;
    userId: string;
    createTask: (toolName: string, args: Record<string, unknown>, settings: Record<string, unknown>) => Promise<{ taskId: string; taskName: string }>;
  }
): ToolWithInterpretation[] {
  const baseTools: ToolWithInterpretation[] = [
    webSearchTool,
    getWeatherDataTool,
    wikipediaSearchTool,
    wikipediaEntryTool,
    getWebsiteContentTool,
    recallTaskTool,
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

  if (taskContext) {
    haTools.push(createPlayPlexMediaToolInstance(haRestConfig, undefined, taskContext));
    haTools.push(createTimerToolInstance(taskContext));
  }

  return [...baseTools, ...haTools];
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
