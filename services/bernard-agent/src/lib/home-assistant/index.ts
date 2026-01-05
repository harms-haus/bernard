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
export {
  type HAEntityState,
  type HomeAssistantEntity,
  type HomeAssistantServiceCall,
  getEntityState,
  getEntityStateREST,
  getMultipleEntityStates,
  entityStateCache,
  clearEntityStateCache,
  getDomainFromEntityId,
  formatEntitiesForDisplay,
  extractHomeAssistantContext,
  findEntity,
  validateEntityId
} from "./entities";

// Context manager exports
export { HomeAssistantContextManager } from "./context";

// Color utilities exports
export {
  type ColorInput,
  getCurrentBrightness,
  getSupportedColorModes,
  getCurrentColorTemp,
} from "./color-utils";

export {
  getColorByName,
  getColorNames,
  detectColorFormat,
  convertColorToSupportedFormat,
  getExampleColorNames
} from "./color-utils";

// Verification exports
export { verifyHomeAssistantConfigured } from "./verification";
