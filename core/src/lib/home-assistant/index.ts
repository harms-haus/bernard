// WebSocket client exports
export {
  getHAConnection,
  closeHAConnection,
  closeAllHAConnections,
  getHAConnectionStats
} from '@/lib/home-assistant/websocket-client';

// REST client exports
export {
  fetchHAEntities,
  callHAService
} from '@/lib/home-assistant/rest-client';

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
} from '@/lib/home-assistant/entities';

// Context manager exports
export { HomeAssistantContextManager } from '@/lib/home-assistant/context';

// Color utilities exports
export {
  type ColorInput,
  getCurrentBrightness,
  getSupportedColorModes,
  getCurrentColorTemp,
} from '@/lib/home-assistant/color-utils';

export {
  getColorByName,
  getColorNames,
  detectColorFormat,
  convertColorToSupportedFormat,
  getExampleColorNames
} from '@/lib/home-assistant/color-utils';

// Verification exports
export { verifyHomeAssistantConfigured } from '@/lib/home-assistant/verification';
