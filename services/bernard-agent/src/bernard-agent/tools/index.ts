/**
 * Tool registry and exports for Bernard agent.
 *
 * This module re-exports all available tools and provides a factory function
 * to get configured tool instances.
 */

// Web Search Tools
export { webSearchToolFactory } from "./web-search.tool";
export { getWebsiteContentToolFactory } from "./website-content.tool";

// Wikipedia Tools
export { wikipediaSearchToolFactory } from "./wikipedia-search.tool";
export { wikipediaEntryToolFactory } from "./wikipedia-entry.tool";

// Weather Tools
export { getWeatherDataToolFactory } from "./get-weather-data.tool";

// Home Assistant Tools (factory functions)
export { listHAEntitiesToolFactory } from "./home-assistant-list-entities.tool";
export { executeHomeAssistantServicesToolFactory } from "./home-assistant-execute-services.tool";
export { toggleLightToolFactory } from "./home-assistant-toggle-light.tool";
export { getHistoricalStateToolFactory } from "./home-assistant-historical-state.tool";

export {
  type ToolFactory
} from "./types";