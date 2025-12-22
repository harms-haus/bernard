import { tool } from "@langchain/core/tools";
import { z } from "zod";

import type { HomeAssistantServiceCall } from "./utility/home-assistant-entities";
import { getHAConnection } from "./utility/home-assistant-websocket-client";
import type { HARestConfig } from "./home-assistant-list-entities.tool";
import {
  resolveDeviceConfig,
  resolveHAEntityId,
  resolvePlexClientId,
  getDeviceName,
  getSupportedLocations
} from "./utility/plex-device-mapping";

/**
 * Plex configuration
 */
export type PlexConfig = {
  baseUrl: string;
  token: string;
};

/**
 * Plex Media Item interface
 */
interface PlexMediaItem {
  ratingKey: string;
  key: string;
  title: string;
  type: 'movie' | 'show' | 'season' | 'episode';
  year: number;
  thumb: string;
  art: string;
  summary?: string;
  duration?: number;
  addedAt: number;
  viewCount?: number;
}

/**
 * Plex Library Section interface
 */
interface LibrarySection {
  key: string;
  title: string;
  type: string;
  thumb: string;
}

/**
 * Dependencies for the play plex media tool
 */
export type PlayPlexMediaDependencies = {
  searchPlexMediaImpl: typeof searchPlexMedia;
  getPlexLibrarySectionsImpl: typeof getPlexLibrarySections;
  callHAServiceWebSocketImpl: typeof callHAServiceWebSocket;
  rankSearchResultsImpl: typeof rankSearchResults;
  recordServiceCallImpl: (serviceCall: HomeAssistantServiceCall) => void | Promise<void>;
};

const defaultDeps: PlayPlexMediaDependencies = {
  searchPlexMediaImpl: searchPlexMedia,
  getPlexLibrarySectionsImpl: getPlexLibrarySections,
  callHAServiceWebSocketImpl: callHAServiceWebSocket,
  rankSearchResultsImpl: rankSearchResults,
  recordServiceCallImpl: () => {
    throw new Error("recordServiceCallImpl must be provided via dependencies");
  },
};

/**
 * Call a Home Assistant service via WebSocket API (internal function)
 */
async function callHAServiceWebSocket(
  baseUrl: string,
  accessToken: string,
  domain: string,
  service: string,
  serviceData: Record<string, unknown>
): Promise<void> {
  try {
    const connection = await getHAConnection(baseUrl, accessToken);
    await connection.sendMessagePromise({
      type: "call_service",
      domain,
      service,
      service_data: serviceData
    });
  } catch (error) {
    console.error('[HA WebSocket] Failed to call service:', error);
    throw error;
  }
}

/**
 * Plex client information
 */
interface PlexClientInfo {
  machineIdentifier: string;
  name: string;
  host?: string;
  port?: number;
  protocol?: string;
}

/**
 * Get Plex server identity information
 */
async function getPlexServerIdentity(plexConfig: PlexConfig): Promise<{ machineIdentifier: string }> {
  const response = await fetch(`${plexConfig.baseUrl}/identity`, {
    headers: {
      'X-Plex-Token': plexConfig.token,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(
      `Failed to get Plex server identity: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json() as { MediaContainer?: { machineIdentifier?: string } };
  const machineIdentifier = data.MediaContainer?.machineIdentifier;
  if (!machineIdentifier) {
    throw new Error('Server machine identifier not found in identity response');
  }
  return { machineIdentifier };
}

/**
 * Discover Plex clients and find one by machine identifier
 */
async function discoverPlexClient(
  plexConfig: PlexConfig,
  targetMachineIdentifier: string
): Promise<PlexClientInfo | null> {
  const response = await fetch(`${plexConfig.baseUrl}/clients`, {
    headers: {
      'X-Plex-Token': plexConfig.token,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(
      `Failed to discover Plex clients: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json() as { MediaContainer?: { Server?: PlexClientInfo[] } };
  const clients: PlexClientInfo[] = data.MediaContainer?.Server || [];

  // Find the client by machine identifier
  const targetClient = clients.find(client =>
    client.machineIdentifier === targetMachineIdentifier
  );

  if (!targetClient) {
    console.warn(`Plex client with machineIdentifier '${targetMachineIdentifier}' not found in discovered clients`);
    return null;
  }

  return targetClient;
}

/**
 * Play media directly on a Plex client
 */
async function playMediaOnPlexClient(
  clientInfo: PlexClientInfo,
  plexConfig: PlexConfig,
  mediaKey: string,
  serverMachineIdentifier: string
): Promise<void> {
  if (!clientInfo.host) {
    throw new Error(`Plex client '${clientInfo.name}' has no host address`);
  }

  const clientPort = clientInfo.port || 32400;
  const clientUrl = `http://${clientInfo.host}:${clientPort}/player/playback/playMedia`;

  // Build query parameters including media data
  const params = new URLSearchParams({
    'X-Plex-Token': plexConfig.token,
    key: mediaKey,
    offset: '0',
    machineIdentifier: serverMachineIdentifier
  });

  const response = await fetch(`${clientUrl}?${params}`, {
    method: 'GET',
    headers: {
      'X-Plex-Target-Client-Identifier': clientInfo.machineIdentifier
    }
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `Failed to play media on Plex client '${clientInfo.name}': ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  console.warn(`Successfully initiated playback of media on Plex client '${clientInfo.name}'`);
}

/**
 * Search Plex libraries for media
 */
async function searchPlexMedia(
  plexConfig: PlexConfig,
  sectionId: string,
  query: string
): Promise<PlexMediaItem[]> {
  const params = new URLSearchParams({
    title: query,
    limit: '10'
  });

  const response = await fetch(
    `${plexConfig.baseUrl}/library/sections/${sectionId}/all?${params}`,
    {
      headers: {
        'X-Plex-Token': plexConfig.token,
        'Accept': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `Plex API error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json() as { MediaContainer?: { Metadata?: PlexMediaItem[] } };
  return data.MediaContainer?.Metadata || [];
}

/**
 * Get Plex library sections
 */
async function getPlexLibrarySections(plexConfig: PlexConfig): Promise<LibrarySection[]> {
  const response = await fetch(`${plexConfig.baseUrl}/library/sections`, {
    headers: {
      'X-Plex-Token': plexConfig.token,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(
      `Plex API error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json() as { MediaContainer?: { Directory?: LibrarySection[] } };
  return data.MediaContainer?.Directory || [];
}

/**
 * Rank search results and return the best match
 */
function rankSearchResults(query: string, results: PlexMediaItem[]): PlexMediaItem {
  const queryLower = query.toLowerCase();

  // Score each result
  const scored = results.map(item => {
    let score = 0;

    // Exact match
    if (item.title.toLowerCase() === queryLower) score += 100;
    // Starts with query
    else if (item.title.toLowerCase().startsWith(queryLower)) score += 80;
    // Contains query
    else if (item.title.toLowerCase().includes(queryLower)) score += 50;

    // Prefer media with more metadata (higher view count = more relevant)
    if (item.viewCount) score += Math.min(item.viewCount, 20);

    // Prefer recently added
    const ageInDays = (Date.now() / 1000 - item.addedAt) / 86400;
    if (ageInDays < 30) score += 15;

    return { item, score };
  });

  // Return highest scored result
  const sorted = scored.sort((a, b) => b.score - a.score);
  if (sorted.length === 0) {
    throw new Error('No search results to rank');
  }
  return sorted[0]!.item;
}

/**
 * Launch Plex app on Android TV device via Home Assistant
 */
async function launchPlexApp(
  haConfig: HARestConfig,
  entityId: string,
  deps: PlayPlexMediaDependencies
): Promise<void> {
  if (!haConfig.accessToken) {
    throw new Error('Home Assistant access token is required');
  }

  await deps.callHAServiceWebSocketImpl(
    haConfig.baseUrl,
    haConfig.accessToken,
    'androidtv',
    'adb_command',
    {
      command: 'am start -n com.plexapp.android/com.plexapp.activities.MainActivity',
      entity_id: entityId
    }
  );
}

/**
 * Create the play plex media tool
 */
export function createPlayPlexMediaTool(
  haRestConfig?: HARestConfig,
  plexConfig?: PlexConfig,
  overrides: Partial<PlayPlexMediaDependencies> = {}
) {
  const deps: PlayPlexMediaDependencies = {
    ...defaultDeps,
    ...overrides,
    recordServiceCallImpl: haRestConfig ? (serviceCall: HomeAssistantServiceCall) => {
      // For now, we'll record the service call but not actually execute it
      // The WebSocket implementation handles the actual execution
      console.warn('Recording service call:', serviceCall);
    } : () => {
      throw new Error("Home Assistant context manager not available for recording service calls");
    }
  };

  const supportedLocations = getSupportedLocations();

  return tool(
    async ({
      location_id,
      media_query
    }: {
      location_id: string;
      media_query: string;
    }) => {
      // Validate inputs
      if (!location_id || typeof location_id !== 'string') {
        return "Error: location_id parameter is required and must be a string";
      }

      if (!media_query || media_query.trim().length === 0) {
        return "Error: media_query parameter is required and cannot be empty";
      }

      if (!plexConfig) {
        return "Error: Plex configuration is required to search media libraries";
      }

      // Resolve device configuration
      const deviceConfig = resolveDeviceConfig(location_id);
      if (!deviceConfig) {
        return `Error: Location "${location_id}" is not supported. Supported locations: ${supportedLocations.join(', ')}`;
      }

      const deviceName = getDeviceName(location_id);
      const haEntityId = resolveHAEntityId(location_id);
      const plexClientId = resolvePlexClientId(location_id);

      try {
        // Search Plex libraries (Movies and TV Shows)
        const searchResults: PlexMediaItem[] = [];
        const librariesToSearch = ['1', '2']; // Movies, TV Shows

        for (const sectionId of librariesToSearch) {
          try {
            const results = await deps.searchPlexMediaImpl(plexConfig, sectionId, media_query);
            searchResults.push(...results);
          } catch (err) {
            console.warn(`Search failed for section ${sectionId}:`, err);
          }
        }

        if (searchResults.length === 0) {
          return `No media found matching "${media_query}" in Plex libraries`;
        }

        // Rank and select best match
        const bestMatch = deps.rankSearchResultsImpl(media_query, searchResults);
        const mediaType = bestMatch.type === 'movie' ? 'movie' : 'show';

        // Execute actions based on available capabilities
        const actions = [];

        // 1. Launch Plex app via Home Assistant ADB (if HA entity available)
        if (haEntityId && haRestConfig) {
          await launchPlexApp(haRestConfig, haEntityId, deps);
          actions.push(`launched Plex app on ${deviceName}`);
        }

        // 2. Navigate to content via Plex API (if Plex client ID available)
        if (plexClientId) {
          try {
            // Discover the Plex client to get its network information
            const clientInfo = await discoverPlexClient(plexConfig, plexClientId);
            if (!clientInfo) {
              actions.push(`Plex client (id=${plexClientId}) not found or unreachable — manual navigation required`);
            } else {
              // Get server identity for the playback request
              const serverIdentity = await getPlexServerIdentity(plexConfig);

              // Play the media directly on the client
              await playMediaOnPlexClient(clientInfo, plexConfig, bestMatch.key, serverIdentity.machineIdentifier);
              actions.push(`started "${bestMatch.title}" on ${deviceName} via Plex API`);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Failed to navigate to media via Plex API: ${errorMessage}`);
            actions.push(`Plex navigation failed: ${errorMessage} — app launched but manual selection required`);
          }
        }

        if (actions.length === 0) {
          return `Found "${bestMatch.title}" (${mediaType}) but no actions are available for location "${location_id}". Please check device configuration.`;
        }

        return `Found "${bestMatch.title}" (${mediaType}) and ${actions.join(' and ')}.`;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Error playing Plex media: ${errorMessage}`;
      }
    },
    {
      name: "play_media_tv",
      description: `Search for media in Plex libraries and control playback on supported TV locations. Supported locations: ${supportedLocations.join(', ')}. The tool searches both Movies and TV Shows libraries and selects the best match. Actions performed depend on device capabilities: launches Plex app via Home Assistant ADB when available, and can navigate directly to content when Plex client ID is configured.`,
      schema: z.object({
        location_id: z.enum(supportedLocations as [string, ...string[]]).describe(`TV location identifier. Supported: ${supportedLocations.join(', ')}`),
        media_query: z.string().describe("Media title to search for in Plex (e.g., 'Inception', 'The Matrix')")
      })
    }
  );
}

/**
 * The play plex media tool instance factory
 */
export function createPlayPlexMediaToolInstance(
  haRestConfig?: HARestConfig,
  plexConfig?: PlexConfig
) {
  return createPlayPlexMediaTool(haRestConfig, plexConfig);
}
