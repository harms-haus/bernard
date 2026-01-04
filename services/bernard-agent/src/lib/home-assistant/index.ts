// WebSocket client exports
export {
  getHAConnection,
  closeHAConnection,
  closeAllHAConnections,
  getHAConnectionStats
} from "./websocket-client";

// REST client exports
export {
  fetchHAEntities,
  callHAService
} from "./rest-client";

// Entity utilities exports
export type {
  HomeAssistantEntity,
  HomeAssistantServiceCall
} from "./entities";

export {
  getDomainFromEntityId,
  formatEntitiesForDisplay,
  extractHomeAssistantContext,
  findEntity,
  validateEntityId
} from "./entities";

// Context manager exports
export { HomeAssistantContextManager } from "./context";

// Color utilities exports
export type {
  ColorInput
} from "./color-utils";

export {
  getColorByName,
  getColorNames,
  detectColorFormat,
  convertColorToSupportedFormat,
  getExampleColorNames
} from "./color-utils";
