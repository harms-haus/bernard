import { getWeatherDataToolFactory } from "./get-weather-data.tool";
import { executeHomeAssistantServicesToolFactory } from "./home-assistant-execute-services.tool";
import { getHistoricalStateToolFactory } from "./home-assistant-historical-state.tool";
import { listHAEntitiesToolFactory } from "./home-assistant-list-entities.tool";
import { toggleLightToolFactory } from "./home-assistant-toggle-light.tool";
import { playMediaTvToolFactory } from "./play_media_tv.tool";
import { searchMediaToolFactory } from "./search_media.tool";
import { DisabledTool, ToolFactory } from "./types";
import { webSearchToolFactory } from "./web-search.tool";
import { getWebsiteContentToolFactory } from "./website-content.tool";
import { wikipediaEntryToolFactory } from "./wikipedia-entry.tool";
import { wikipediaSearchToolFactory } from "./wikipedia-search.tool";


export async function validateAndGetTools(): Promise<{
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
    playMediaTvToolFactory,
    searchMediaToolFactory,
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
