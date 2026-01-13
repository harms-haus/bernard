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

// Media Playback Tools
export { playMediaTvToolFactory } from "./play_media_tv.tool";
export { searchMediaToolFactory } from "./search_media.tool";

// Overseerr Tools
export { findMediaStatusToolFactory } from "./overseerr-find-media.tool";
export { requestMediaToolFactory } from "./overseerr-request-media.tool";
export { listMediaRequestsToolFactory } from "./overseerr-list-requests.tool";
export { cancelMediaRequestToolFactory } from "./overseerr-cancel-request.tool";
export { reportMediaIssueToolFactory } from "./overseerr-report-issue.tool";

export {
  type ToolFactory,
  type DisabledTool,
} from "./types";

export {
  validateAndGetTools,
  validateTools,
  getToolDefinitions,
  type ToolDefinition,
  type ToolValidationResult,
  type ToolsValidationResult,
} from "./validation";