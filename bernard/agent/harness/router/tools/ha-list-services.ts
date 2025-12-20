import { tool } from "@langchain/core/tools";
import type { BaseMessage } from "@langchain/core/messages";
import { z } from "zod";

import type { HomeAssistantEntity } from "./ha-entities";
import type { HomeAssistantContextManager } from "./ha-context";
import { extractHomeAssistantContext, formatEntitiesForDisplay } from "./ha-entities";
import { fetchHAEntities } from "./ha-rest-client";

/**
 * Home Assistant REST API configuration
 */
export interface HARestConfig {
  baseUrl: string;
  accessToken?: string;
}

/**
 * Dependencies for the list HA services tool
 */
export type ListHAServicesDependencies = {
  extractContextImpl: typeof extractHomeAssistantContext;
  formatEntitiesImpl: typeof formatEntitiesForDisplay;
  fetchEntitiesImpl?: typeof fetchHAEntities;
};

const defaultDeps: ListHAServicesDependencies = {
  extractContextImpl: extractHomeAssistantContext,
  formatEntitiesImpl: formatEntitiesForDisplay,
  fetchEntitiesImpl: fetchHAEntities
};

/**
 * Create the list HA services tool
 */
export function createListHAServicesTool(
  haContextManager: HomeAssistantContextManager,
  restConfig?: HARestConfig,
  overrides: Partial<ListHAServicesDependencies> = {}
) {
  const deps: ListHAServicesDependencies = { ...defaultDeps, ...overrides };
  
  return tool(
    async (_input: Record<string, unknown>, _runOpts?: unknown) => {
      // Get entities from scoped context manager
      const entities = haContextManager.getEntities();

      if (entities.length === 0) {
        // Try REST API fallback if configuration is provided
        if (restConfig && deps.fetchEntitiesImpl) {
          try {
            const restEntities = await deps.fetchEntitiesImpl(restConfig.baseUrl, restConfig.accessToken || "");
            if (restEntities.length > 0) {
              return deps.formatEntitiesImpl(restEntities);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return `Failed to fetch Home Assistant entities from REST API: ${errorMessage}`;
          }
        }

        return "No Home Assistant entities are currently available. Please ensure the system prompt contains Home Assistant entity information or configure Home Assistant REST API settings.";
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
export function createListHAServicesToolInstance(haContextManager: HomeAssistantContextManager, restConfig?: HARestConfig) {
  return createListHAServicesTool(haContextManager, restConfig);
}

/**
 * Get entities from context for use by other tools
 */
export function getEntitiesFromContext(messages: BaseMessage[]): HomeAssistantEntity[] {
  const context = extractHomeAssistantContext(messages);
  return context?.entities || [];
}