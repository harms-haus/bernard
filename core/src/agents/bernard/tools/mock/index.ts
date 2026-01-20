/**
 * Mock Home Assistant tools for guest mode.
 * 
 * These tools provide a static, fake set of entities that don't connect
 * to an actual Home Assistant instance. They are used when users have
 * the 'guest' role.
 */

export { mockToggleLightToolFactory, createMockToggleLightTool, MOCK_LIGHT_ENTITIES, getMockLightEntities, findMockLightEntity, toggleMockLight } from "./home-assistant-toggle-light.mock.tool";
export { mockListHAEntitiesToolFactory, createMockListHAEntitiesTool, MOCK_ENTITIES, getMockEntities, formatMockEntitiesForDisplay, filterMockEntitiesByRegex } from "./home-assistant-list-entities.mock.tool";
export { mockExecuteHomeAssistantServicesToolFactory, createMockExecuteHomeAssistantServicesTool } from "./home-assistant-execute-services.mock.tool";

export type { MockLightEntity } from "./home-assistant-toggle-light.mock.tool";
export type { MockHomeAssistantEntity } from "./home-assistant-list-entities.mock.tool";
export type { MockServiceResult } from "./home-assistant-execute-services.mock.tool";
