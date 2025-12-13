import { tool } from "@langchain/core/tools";
import type { BaseMessage } from "@langchain/core/messages";
import { z } from "zod";

import type { HomeAssistantContext, HomeAssistantEntity } from "./ha-entities";
import type { HomeAssistantContextManager } from "./ha-context";
import { extractHomeAssistantContext, formatEntitiesForDisplay } from "./ha-entities";

/**
 * Dependencies for the list HA services tool
 */
export type ListHAServicesDependencies = {
  extractContextImpl: typeof extractHomeAssistantContext;
  formatEntitiesImpl: typeof formatEntitiesForDisplay;
};

const defaultDeps: ListHAServicesDependencies = {
  extractContextImpl: extractHomeAssistantContext,
  formatEntitiesImpl: formatEntitiesForDisplay
};

/**
 * Create the list HA services tool
 */
export function createListHAServicesTool(
  haContextManager: HomeAssistantContextManager,
  overrides: Partial<ListHAServicesDependencies> = {}
) {
  const deps: ListHAServicesDependencies = { ...defaultDeps, ...overrides };
  
  return tool(
    async (_input: Record<string, unknown>, runOpts?: unknown) => {
      // Get entities from scoped context manager
      const entities = haContextManager.getEntities();
      
      if (entities.length === 0) {
        return "No Home Assistant entities are currently available. Please ensure the system prompt contains Home Assistant entity information.";
      }
      
      return deps.formatEntitiesImpl(entities);
    },
    {
      name: "list_ha_entities",
      description: "List all available Home Assistant entities with their current states and aliases.",
      schema: z.object({})
    }
  );
}

/**
 * The list HA services tool instance factory
 */
export function createListHAServicesToolInstance(haContextManager: HomeAssistantContextManager) {
  return createListHAServicesTool(haContextManager);
}

/**
 * Get entities from context for use by other tools
 */
export function getEntitiesFromContext(messages: BaseMessage[]): HomeAssistantEntity[] {
  const context = extractHomeAssistantContext(messages);
  return context?.entities || [];
}