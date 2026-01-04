/**
 * Tool registry and exports for Bernard agent.
 * 
 * This module re-exports all available tools and provides a factory function
 * to get configured tool instances.
 */

// Web Search Tools
export { webSearchTool } from "./web-search.tool.js";
export { getWebsiteContentTool } from "./website-content.tool.js";

// Wikipedia Tools
export { wikipediaSearchTool } from "./wikipedia-search.tool.js";
export { wikipediaEntryTool } from "./wikipedia-entry.tool.js";

// Weather Tools
export { getWeatherDataTool } from "./get-weather-data.tool.js";

// Home Assistant Tools (factory functions)
export { createListHAEntitiesTool } from "./home-assistant-list-entities.tool.js";
export { createExecuteHomeAssistantServicesTool } from "./home-assistant-execute-services.tool.js";
export { createToggleLightTool } from "./home-assistant-toggle-light.tool.js";
export { createGetHistoricalStateTool } from "./home-assistant-historical-state.tool.js";
