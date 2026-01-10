import { tool } from "@langchain/core/tools";
import { z } from "zod";

import type { HARestConfig } from "./home-assistant-list-entities.tool";
import { getHAConnection, verifyHomeAssistantConfigured } from "@/lib/home-assistant";
import { ToolFactory } from "./types";
import { getSettings } from "@/lib/config/settingsCache";

const TOOL_NAME = "get_home_assistant_historical_state";

/**
 * Home Assistant historical state data
 */
interface HistoricalStateData {
  entity_id: string;
  state: string;
  attributes: Record<string, string | number | boolean | null | Record<string, unknown>>;
  last_changed: string;
  last_updated: string;
}

/**
 * Home Assistant history response
 */
interface HistoryResponse {
  [entityId: string]: HistoricalStateData[];
}

/**
 * Dependencies for the get historical state tool
 */
export type GetHistoricalStateDependencies = {
  fetchHistoricalStateImpl?: typeof fetchHistoricalStateWebSocket;
};

const defaultDeps: GetHistoricalStateDependencies = {
  fetchHistoricalStateImpl: fetchHistoricalStateWebSocket
};

/**
 * Create the get historical state tool
 */
export function createGetHistoricalStateTool(
  restConfig?: HARestConfig,
  overrides: Partial<GetHistoricalStateDependencies> = {}
) {
  const deps: GetHistoricalStateDependencies = { ...defaultDeps, ...overrides };

  return tool(
    async ({ entity_ids, start_time, end_time }: {
      entity_ids: string[];
      start_time: string;
      end_time: string;
    }) => {
      if (!restConfig) {
        return "Home Assistant WebSocket configuration is required for historical state retrieval.";
      }

      if (!deps.fetchHistoricalStateImpl) {
        return "Historical state fetching is not available.";
      }

      try {
        const history = await deps.fetchHistoricalStateImpl(
          restConfig.baseUrl,
          restConfig.accessToken || "",
          entity_ids,
          new Date(start_time),
          new Date(end_time)
        );

        return formatHistoricalStateResponse(history);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Failed to fetch historical state: ${errorMessage}`;
      }
    },
    {
      name: TOOL_NAME,
      description: "Retrieve historical state data for Home Assistant entities within a specified time range. Returns state changes and attribute updates for the given entities.",
      schema: z.object({
        entity_ids: z.array(z.string()).describe("Array of entity IDs to retrieve historical data for"),
        start_time: z.string().describe("Start time in ISO 8601 format (e.g., '2024-01-01T00:00:00Z')"),
        end_time: z.string().describe("End time in ISO 8601 format (e.g., '2024-01-02T00:00:00Z')")
      })
    }
  );
}

/**
 * Fetch historical state data via WebSocket API
 */
async function fetchHistoricalStateWebSocket(
  baseUrl: string,
  accessToken: string,
  entityIds: string[],
  startTime: Date,
  endTime: Date
): Promise<HistoryResponse> {
  try {
    const connection = await getHAConnection(baseUrl, accessToken);

    // Use the history API via WebSocket message
    const response = await connection.sendMessagePromise({
      type: 'history/history_during_period',
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      entity_ids: entityIds,
      include_start_time_state: true,
      significant_changes_only: false
    });

    return response as HistoryResponse;
  } catch (error) {
    console.error('[HA WebSocket] Failed to fetch historical state:', error);

    // If WebSocket history API fails, try REST API as fallback
    try {
      return await fetchHistoricalStateREST(baseUrl, accessToken, entityIds, startTime, endTime);
    } catch (restError) {
      console.error('[HA REST] Fallback historical state fetch also failed:', restError);
      throw error; // Throw original WebSocket error
    }
  }
}

/**
 * Fetch historical state data via REST API (fallback)
 */
async function fetchHistoricalStateREST(
  baseUrl: string,
  accessToken: string,
  entityIds: string[],
  startTime: Date,
  endTime: Date
): Promise<HistoryResponse> {
  const url = new URL(`${baseUrl}/api/history/period`);
  url.searchParams.set('filter_entity_id', entityIds.join(','));
  url.searchParams.set('start_time', startTime.toISOString());
  url.searchParams.set('end_time', endTime.toISOString());

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`History API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as HistoricalStateData[][];

  // Transform array response to object keyed by entity_id
  const result: HistoryResponse = {};
  entityIds.forEach((entityId, index) => {
    result[entityId] = data[index] || [];
  });

  return result;
}

/**
 * Format historical state response for display
 */
function formatHistoricalStateResponse(history: HistoryResponse): string {
  const lines: string[] = [];

  for (const [entityId, states] of Object.entries(history)) {
    lines.push(`Historical data for ${entityId}:`);

    if (states.length === 0) {
      lines.push(`  No state changes found in the specified time range.`);
      continue;
    }

    for (const state of states) {
      const timestamp = new Date(state.last_changed).toISOString();
      const attributes = Object.entries(state.attributes)
        .filter(([key]) => key !== 'friendly_name') // Skip friendly_name for brevity
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join(', ');

      const attributesStr = attributes ? ` (${attributes})` : '';
      lines.push(`  ${timestamp}: ${state.state}${attributesStr}`);
    }

    lines.push(''); // Empty line between entities
  }

  return lines.join('\n').trim();
}

export const getHistoricalStateToolFactory: ToolFactory = async () => {
  const isValid = await verifyHomeAssistantConfigured();
  if (!isValid.ok) {
    return { ok: false, name: TOOL_NAME, reason: isValid.reason ?? "" };
  }
  const settings = await getSettings();
  const haConfig = settings.services?.homeAssistant;
  const tool = createGetHistoricalStateTool(haConfig);
  return { ok: true, tool: tool, name: tool.name };
};
