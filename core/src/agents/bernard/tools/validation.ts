import { getWeatherDataToolFactory } from "./get-weather-data.tool";
import { executeHomeAssistantServicesToolFactory } from "./home-assistant-execute-services.tool";
import { getHistoricalStateToolFactory } from "./home-assistant-historical-state.tool";
import { listHAEntitiesToolFactory } from "./home-assistant-list-entities.tool";
import { toggleLightToolFactory } from "./home-assistant-toggle-light.tool";
import { playMediaTvToolFactory } from "./play_media_tv.tool";
import { searchMediaToolFactory } from "./search_media.tool";
import { DisabledTool, ToolFactory, ToolContext } from "./types";
import { webSearchToolFactory } from "./web-search.tool";
import { getWebsiteContentToolFactory } from "./website-content.tool";
import { wikipediaEntryToolFactory } from "./wikipedia-entry.tool";
import { wikipediaSearchToolFactory } from "./wikipedia-search.tool";

/**
 * Tools that should be completely hidden from guest users.
 * These tools are not shown in the disabled list - they're filtered out entirely.
 */
const GUEST_HIDDEN_TOOLS = [
  'play_media_tv',
  'search_media',
];

/**
 * Represents a tool definition that can be validated.
 * Used for testing - allows mock factories to be injected.
 */
export type ToolDefinition = {
  name: string;
  factory: ToolFactory;
};

/**
 * Result of validating a single tool factory.
 */
export type ToolValidationResult = {
  name: string;
  ok: boolean;
  tool?: unknown;
  reason?: string;
};

/**
 * Result of validating all tools.
 */
export type ToolsValidationResult = {
  validTools: any[];
  disabledTools: DisabledTool[];
};

/**
 * Get all tool definitions from the registry.
 * This function can be overridden in tests to provide mock factories.
 */
export function getToolDefinitions(context?: ToolContext): ToolDefinition[] {
  const allTools: ToolDefinition[] = [
    { name: 'web_search', factory: webSearchToolFactory },
    { name: 'website_content', factory: getWebsiteContentToolFactory },
    { name: 'wikipedia_search', factory: wikipediaSearchToolFactory },
    { name: 'wikipedia_entry', factory: wikipediaEntryToolFactory },
    { name: 'get_weather', factory: getWeatherDataToolFactory },
    { name: 'home_assistant_list_entities', factory: listHAEntitiesToolFactory },
    { name: 'home_assistant_execute_services', factory: executeHomeAssistantServicesToolFactory },
    { name: 'toggle_home_assistant_light', factory: toggleLightToolFactory },
    { name: 'get_home_assistant_historical_state', factory: getHistoricalStateToolFactory },
    { name: 'play_media_tv', factory: playMediaTvToolFactory },
    { name: 'search_media', factory: searchMediaToolFactory },
  ];

  // Filter out hidden tools for guests
  if (context?.userRole === 'guest') {
    return allTools.filter(t => !GUEST_HIDDEN_TOOLS.includes(t.name));
  }

  return allTools;
}

/**
 * Validate a single tool factory.
 */
export async function validateToolFactory(
  definition: ToolDefinition,
  _context?: ToolContext
): Promise<ToolValidationResult> {
  try {
    const result = await definition.factory();
    if (result.ok) {
      return {
        name: result.tool?.name ?? definition.name,
        ok: true,
        tool: result.tool,
      };
    }
    return {
      name: result.name,
      ok: false,
      reason: result.reason,
    };
  } catch (error) {
    return {
      name: definition.name,
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Validate tool factories and separate valid from disabled tools.
 * 
 * @param definitions - Optional tool definitions to validate. Defaults to getToolDefinitions().
 * @param context - Optional context for role-based tool filtering.
 */
export async function validateTools(
  definitions?: ToolDefinition[],
  context?: ToolContext
): Promise<ToolsValidationResult> {
  const toolDefinitions = definitions ?? getToolDefinitions(context);
  const disabledTools: DisabledTool[] = [];
  const validTools: any[] = [];

  for (const definition of toolDefinitions) {
    const result = await validateToolFactory(definition, context);

    if (result.ok) {
      validTools.push(result.tool);
    } else {
      disabledTools.push({ name: result.name, reason: result.reason });
    }
  }

  return { validTools, disabledTools };
}

/**
 * Original function for backward compatibility.
 * Validates all registered tool factories.
 */
export async function validateAndGetTools(context?: ToolContext): Promise<{
  validTools: any[];
  disabledTools: DisabledTool[];
}> {
  return validateTools(undefined, context);
}
