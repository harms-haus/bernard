import { tool } from "@langchain/core/tools";
import type { BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getStates } from "home-assistant-js-websocket";

import type { HomeAssistantEntity } from "./ha-entities";
import type { HomeAssistantContextManager } from "./ha-context";
import { extractHomeAssistantContext, formatEntitiesForDisplay } from "./ha-entities";
import { getHAConnection } from "./ha-websocket-client";

/**
 * Home Assistant API configuration (supports both WebSocket and REST)
 */
export interface HARestConfig {
  baseUrl: string;
  accessToken?: string;
}

/**
 * Dependencies for the list HA entities tool
 */
export type ListHAEntitiesDependencies = {
  extractContextImpl: typeof extractHomeAssistantContext;
  formatEntitiesImpl: typeof formatEntitiesForDisplay;
  fetchEntitiesImpl?: typeof fetchHAEntitiesWebSocket;
};

const defaultDeps: ListHAEntitiesDependencies = {
  extractContextImpl: extractHomeAssistantContext,
  formatEntitiesImpl: formatEntitiesForDisplay,
  fetchEntitiesImpl: fetchHAEntitiesWebSocket
};

/**
 * Format entity for regex matching in CSV-like format: entity_id, name, aliases, state
 */
function formatEntityForRegexMatch(entity: HomeAssistantEntity): string {
  const aliases = entity.aliases.join('/');
  return `${entity.entity_id}, ${entity.name}, ${aliases}, ${entity.state}`;
}

/**
 * Filter entities by domain (case-insensitive match)
 */
function filterEntitiesByDomain(entities: HomeAssistantEntity[], domain: string): HomeAssistantEntity[] {
  const normalizedDomain = domain.toLowerCase();
  return entities.filter(entity => {
    const entityDomain = entity.entity_id.split('.')[0];
    return entityDomain.toLowerCase() === normalizedDomain;
  });
}

/**
 * Filter entities by regex pattern applied to formatted entity string
 */
function filterEntitiesByRegex(entities: HomeAssistantEntity[], regex: string): HomeAssistantEntity[] {
  try {
    const pattern = new RegExp(regex, 'i'); // case-insensitive
    return entities.filter(entity => {
      const formatted = formatEntityForRegexMatch(entity);
      return pattern.test(formatted);
    });
  } catch (error) {
    // If regex is invalid, return empty array with warning
    console.warn(`Invalid regex pattern: ${regex}`, error);
    return [];
  }
}

/**
 * Filter entities by visibility to assistants
 * Entities are hidden if they have 'hidden_by' attribute containing 'assistant' or 'cloud'
 */
function filterEntitiesByVisibility(entities: HomeAssistantEntity[]): HomeAssistantEntity[] {
  return entities.filter(entity => {
    // Check if entity has visibility attributes (from WebSocket API)
    const attributes = (entity as any).attributes;
    if (!attributes) return true; // No attributes means visible (backward compatibility)

    const hiddenBy = attributes.hidden_by;
    if (!hiddenBy) return true; // No hidden_by means visible

    // Hidden by assistant or cloud means not visible to assistants
    if (Array.isArray(hiddenBy)) {
      return !hiddenBy.includes('assistant') && !hiddenBy.includes('cloud');
    } else if (typeof hiddenBy === 'string') {
      return hiddenBy !== 'assistant' && hiddenBy !== 'cloud';
    }

    return true; // Default to visible if hidden_by format is unexpected
  });
}

/**
 * Fetch all Home Assistant entities from the WebSocket API
 */
async function fetchHAEntitiesWebSocket(baseUrl: string, accessToken: string): Promise<HomeAssistantEntity[]> {
  try {
    const connection = await getHAConnection(baseUrl, accessToken);
    const states = await getStates(connection);

    // Filter to only commonly exposed entity domains (matching HA assistant pipeline)
    const exposedDomains = new Set([
      'light', 'switch', 'sensor', 'binary_sensor', 'climate', 'media_player',
      'cover', 'lock', 'fan', 'vacuum', 'camera', 'alarm_control_panel',
      'humidifier', 'water_heater', 'remote', 'siren'
    ]);

    const filteredStates = states.filter(state => {
      const domain = state.entity_id.split('.')[0];
      return exposedDomains.has(domain);
    });

    // Transform HA state objects to HomeAssistantEntity format (matching CSV structure)
    const entities: HomeAssistantEntity[] = filteredStates.map(state => ({
      entity_id: state.entity_id,
      name: state.attributes.friendly_name || state.entity_id,
      state: state.state,
      aliases: [], // HA WebSocket API doesn't provide aliases, keep empty array
      // Store attributes for visibility filtering
      attributes: state.attributes
    }));

    // Filter by visibility to assistants
    return filterEntitiesByVisibility(entities);

  } catch (error) {
    console.error('[HA WebSocket] Failed to fetch entities:', error);
    throw error;
  }
}

/**
 * Create the list HA entities tool
 */
export function createListHAEntitiesTool(
  haContextManager?: HomeAssistantContextManager,
  restConfig?: HARestConfig,
  overrides: Partial<ListHAEntitiesDependencies> = {}
) {
  const deps: ListHAEntitiesDependencies = { ...defaultDeps, ...overrides };

  return tool(
    async ({ domain, regex }: { domain?: string; regex?: string }) => {
      // Get entities from scoped context manager if available
      let entities = haContextManager?.getEntities() || [];

      if (entities.length === 0) {
        // Try WebSocket API first if configuration is provided
        if (restConfig && deps.fetchEntitiesImpl) {
          try {
            const wsEntities = await deps.fetchEntitiesImpl(restConfig.baseUrl, restConfig.accessToken || "");
            if (wsEntities.length > 0) {
              entities = wsEntities;
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return `Failed to fetch Home Assistant entities from WebSocket API: ${errorMessage}`;
          }
        }

        if (entities.length === 0) {
          return "No Home Assistant entities are currently available. Please ensure the system prompt contains Home Assistant entity information or configure Home Assistant WebSocket API settings.";
        }
      }

      // Apply domain filter first if provided
      if (domain) {
        entities = filterEntitiesByDomain(entities, domain);
      }

      // Apply regex filter if provided
      if (regex) {
        entities = filterEntitiesByRegex(entities, regex);
      }

      return deps.formatEntitiesImpl(entities);
    },
    {
      name: "list_home_assistant_entities",
      description: "List Home Assistant entities with optional filtering by domain and regex pattern. Domain filters by entity type (e.g., 'light', 'sensor'). Regex searches across entity_id, name, aliases, and state in CSV format.",
      schema: z.object({
        domain: z.string().optional().describe("Filter entities by domain (e.g., 'light', 'sensor', 'climate')"),
        regex: z.string().optional().describe("Filter entities using regex pattern matching against 'entity_id, name, aliases, state' format")
      })
    }
  );
}

/**
 * The list HA entities tool instance factory
 */
export function createListHAEntitiesToolInstance(haContextManager?: HomeAssistantContextManager, restConfig?: HARestConfig) {
  return createListHAEntitiesTool(haContextManager, restConfig);
}

/**
 * Get entities from context for use by other tools
 */
export function getEntitiesFromContext(messages: BaseMessage[]): HomeAssistantEntity[] {
  const context = extractHomeAssistantContext(messages);
  return context?.entities || [];
}
