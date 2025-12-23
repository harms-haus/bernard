import { tool } from "@langchain/core/tools";
import { z } from "zod";

import type { HomeAssistantServiceCall } from "./utility/home-assistant-entities";
import { getHAConnection } from "./utility/home-assistant-websocket-client";
import type { HARestConfig } from "./home-assistant-list-entities.tool";
import { getEntityState } from "./home-assistant-get-entity-state.tool";
import {
  resolveDeviceConfig,
  resolveHAEntityId,
  resolveHAPlexEntityId,
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
 * Check if the media player is powered on
 */
async function checkMediaPlayerPowerState(
  haConfig: HARestConfig,
  entityId: string
): Promise<boolean> {
  if (!haConfig.accessToken) {
    console.warn(`Home Assistant access token is required to check power state for ${entityId}`);
    return true; // Assume device is on if we can't check
  }

  try {
    const entityState = await getEntityState(
      haConfig.baseUrl,
      haConfig.accessToken,
      entityId
    );

    console.log(`[DEBUG] ${entityId} current state:`, entityState);

    // Media players use various states: 'on', 'idle', 'playing', 'paused', etc.
    // Only 'off' means the TV is off. Everything else (including 'idle', 'unavailable') means it's on
    const state = entityState?.state?.toLowerCase();
    return state !== 'off' && state !== 'unavailable' && state !== 'unknown';
  } catch (error) {
    console.warn(`Failed to check power state for ${entityId}:`, error);
    // If we can't determine the state, assume it's on to avoid breaking functionality
    return true;
  }
}

/**
 * Check if Plex appears to be the current app by examining source/app_name/app_id attributes
 * Note: Only returns true if Plex is explicitly detected, not based on device state alone
 */
async function checkIfPlexIsCurrentApp(
  haConfig: HARestConfig,
  entityId: string
): Promise<boolean> {
  if (!haConfig.accessToken) {
    console.warn(`Home Assistant access token is required to check Plex app state for ${entityId}`);
    return false; // Assume Plex is not current if we can't check
  }

  try {
    const entityState = await getEntityState(
      haConfig.baseUrl,
      haConfig.accessToken,
      entityId
    );

    // Check various indicators that might suggest Plex is running
    const appName = entityState?.attributes?.['app_name'];
    const source = entityState?.attributes?.['source'];
    const appId = entityState?.attributes?.['app_id'];

    console.log(`[DEBUG] Checking if Plex is current app for ${entityId}:`, {
      state: entityState,
      source,
      app_name: appName,
      app_id: appId
    });

    // Check app_name (most reliable indicator)
    const appNameStr = typeof appName === 'string' ? appName : '';
    if (appNameStr.toLowerCase().includes('plex')) {
      console.log(`[DEBUG] Plex detected via app_name: "${appNameStr}"`);
      return true;
    }

    // Check source (running apps as sources) - this is very reliable
    const sourceStr = typeof source === 'string' ? source : '';
    if (sourceStr.toLowerCase().includes('plex')) {
      console.log(`[DEBUG] Plex detected via source: "${sourceStr}"`);
      return true;
    }

    // Check app_id
    const appIdStr = typeof appId === 'string' ? appId : '';
    if (appIdStr.includes('plex') || appIdStr.includes('com.plexapp.android')) {
      console.log(`[DEBUG] Plex detected via app_id: "${appIdStr}"`);
      return true;
    }

    // Only consider Plex current if we can explicitly detect it via source/app_name/app_id
    // Do NOT assume Plex is running just because the device is idle/playing/paused

    console.log(`[DEBUG] Plex not detected as current app`);
    return false;

  } catch (error) {
    console.warn(`Failed to check if Plex is current app for ${entityId}:`, error);
    // If we can't determine, assume Plex is not current to trigger launch
    return false;
  }
}

/**
 * Turn on the media player device
 */
async function turnOnMediaPlayer(
  haConfig: HARestConfig,
  entityId: string,
  deps: PlayPlexMediaDependencies
): Promise<void> {
  if (!haConfig.accessToken) {
    throw new Error('Home Assistant access token is required to turn on media player');
  }

  await deps.callHAServiceWebSocketImpl(
    haConfig.baseUrl,
    haConfig.accessToken,
    'media_player',
    'turn_on',
    { entity_id: entityId }
  );
}


/**
 * Launch Plex app on Android TV device via Home Assistant media_player.select_source
 * Uses the Plex app ID: com.plexapp.android
 */
async function launchPlexApp(
  haConfig: HARestConfig,
  entityId: string,
  deps: PlayPlexMediaDependencies
): Promise<void> {
  if (!haConfig.accessToken) {
    throw new Error('Home Assistant access token is required');
  }

  // Use Home Assistant's media_player.select_source to launch Plex
  const plexAppId = 'com.plexapp.android';

  try {
    await deps.callHAServiceWebSocketImpl(
      haConfig.baseUrl,
      haConfig.accessToken,
      'media_player',
      'select_source',
      {
        entity_id: entityId,
        source: plexAppId
      }
    );

  } catch (error) {
    throw error;
  }
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
      const haPlexEntityId = resolveHAPlexEntityId(location_id);

      try {
        const actions: string[] = [];

        const {bestMatch, mediaType} = await searchPlexBestMatch(plexConfig, media_query, deps);

        await ensureTvOn(haEntityId, haRestConfig, actions, deviceName, deps);

        await ensurePlexActive(haEntityId, haRestConfig, actions, deviceName, deps);

        await playMediaOnPlex(haPlexEntityId, haRestConfig, deps, mediaType, bestMatch, deviceName, actions, location_id);

        if (actions.length === 0) {
          return `Found "${bestMatch.title}" (${mediaType}) but no actions are available for location "${location_id}". Please check device configuration.`;
        }

        return `Found "${bestMatch.title}" (${mediaType})\n${actions.join('\n')}`;

      } catch (error) {
        const errorMessage = error instanceof Error
          ? `${error.message}\n${error.stack}`
          : typeof error === 'object'
          ? JSON.stringify(error, null, 2)
          : String(error);
        return `Error playing Plex media: ${errorMessage}`;
      }
    },
    {
      name: "play_media_tv",
      description: `Search for media in Plex libraries and control playback on supported TV locations. Supported locations: ${supportedLocations.join(', ')}. The tool automatically powers on the TV if needed, launches Plex via Home Assistant media_player.select_source, and uses Home Assistant's Plex integration to play media directly. It searches both Movies and TV Shows libraries and selects the best match. Actions performed depend on device capabilities: powers on device, launches apps via Home Assistant, and uses Home Assistant Plex entities for media playback.`,
      schema: z.object({
        location_id: z.enum(supportedLocations as [string, ...string[]]).describe(`TV location identifier. Supported: ${supportedLocations.join(', ')}`),
        media_query: z.string().describe("Media title to search for in Plex (e.g., 'Inception', 'The Matrix')")
      })
    }
  );
}

async function searchPlexBestMatch(plexConfig: PlexConfig, media_query: string, deps: PlayPlexMediaDependencies): Promise<{ bestMatch: PlexMediaItem, mediaType: 'movie' | 'show' }> {
  const searchResults: PlexMediaItem[] = [];

  // Get available library sections dynamically
  const librarySections = await deps.getPlexLibrarySectionsImpl(plexConfig);

  // Filter sections to common media libraries (Movies and TV Shows)
  // These are the most common library types for media playback
  const targetSectionTitles = ['Movies', 'TV Shows'];
  const sectionsToSearch = librarySections.filter(section =>
    targetSectionTitles.some(title =>
      section.title.toLowerCase().includes(title.toLowerCase())
    )
  );

  if (sectionsToSearch.length === 0) {
    console.warn(`No matching library sections found. Available sections: ${librarySections.map(s => s.title).join(', ')}`);
    throw new Error(`No suitable media libraries found in Plex (looking for: ${targetSectionTitles.join(', ')})`);
  }

  console.log(`Searching ${sectionsToSearch.length} library sections: ${sectionsToSearch.map(s => s.title).join(', ')}`);

  // Search each matching section
  for (const section of sectionsToSearch) {
    try {
      console.log(`Searching library "${section.title}" (ID: ${section.key}) for "${media_query}"`);
      const results = await deps.searchPlexMediaImpl(plexConfig, section.key, media_query);
      console.log(`Found ${results.length} results in "${section.title}"`);
      searchResults.push(...results);
    } catch (err) {
      console.warn(`Search failed for library "${section.title}" (ID: ${section.key}):`, err);
      // Continue with other sections even if one fails
    }
  }

  if (searchResults.length === 0) {
    const searchedLibraries = sectionsToSearch.map(s => s.title).join(', ');
    throw new Error(`No media found matching "${media_query}" in Plex libraries (${searchedLibraries})`);
  }

  const bestMatch = deps.rankSearchResultsImpl(media_query, searchResults);
  return {
    bestMatch,
    mediaType: bestMatch.type === 'movie' ? 'movie' : 'show',
  };
}

async function ensureTvOn(haEntityId: string | null, haRestConfig: HARestConfig | undefined, actions: string[], deviceName: string, deps: PlayPlexMediaDependencies) {
  if (haEntityId && haRestConfig) {
    const isPoweredOn = await checkMediaPlayerPowerState(haRestConfig, haEntityId);

    if (isPoweredOn) {
      actions.push(`TV ${deviceName} is already on`);
    } else {
      for (let i = 0; i < 3; i++) {
        try {
          await turnOnMediaPlayer(haRestConfig, haEntityId, deps);
        } catch (error) {
          console.warn(`Failed to turn on ${deviceName}:`, error);
          if (i === 2) {
            throw error;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      const isPoweredOnNow = await checkMediaPlayerPowerState(haRestConfig, haEntityId);
      if (isPoweredOnNow) {
        actions.push(`Turned on TV ${deviceName}`);
      } else {
        actions.push(`Turned on then assumed TV ${deviceName} is on`);
      }
    }
  }
}

async function ensurePlexActive(haEntityId: string | null, haRestConfig: HARestConfig | undefined, actions: string[], deviceName: string, deps: PlayPlexMediaDependencies) {
  if (haEntityId && haRestConfig) {
    const isPlexCurrent = await checkIfPlexIsCurrentApp(haRestConfig, haEntityId);

    if (isPlexCurrent) {
      actions.push(`Plex is already current app on ${deviceName}`);
    } else {
      for (let i = 0; i < 3; i++) {
        try {
          await launchPlexApp(haRestConfig, haEntityId, deps);
        } catch (error) {
          console.warn(`Failed to launch Plex on ${deviceName}:`, error);
          if (i === 2) {
            throw error;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      const isPlexCurrentNow = await checkIfPlexIsCurrentApp(haRestConfig, haEntityId);
      if (isPlexCurrentNow) {
        actions.push(`Set Plex as the current app on ${deviceName}`);
      } else {
        actions.push(`Set then assumed Plex is the current app on ${deviceName}`);
      }
    }
  }
}

async function playMediaOnPlex(haPlexEntityId: string | null, haRestConfig: HARestConfig | undefined, deps: PlayPlexMediaDependencies, mediaType: 'movie' | 'show', bestMatch: PlexMediaItem, deviceName: string, actions: string[], location_id: string) {
  if (haPlexEntityId && haRestConfig && haRestConfig.accessToken) {
    // Use Home Assistant's Plex integration to play media directly
    for (let i = 0; i < 3; i++) {
      try {
        await deps.callHAServiceWebSocketImpl(
          haRestConfig.baseUrl,
          haRestConfig.accessToken,
          'media_player',
          'play_media',
          {
            entity_id: haPlexEntityId,
            media_content_type: mediaType,
            media_content_id: `plex://{"library_name": "${mediaType === 'movie' ? 'Movies' : 'TV Shows'}", "title": "${bestMatch.title}"}`
          }
        );
      } catch (error) {
        console.warn(`Failed to play media on ${deviceName}:`, error);
        if (i === 2) {
          throw error;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    actions.push(`Started "${bestMatch.title}" playback on ${deviceName} via Home Assistant Plex`);
  } else {
    actions.push(`No Home Assistant Plex entity configured for ${location_id}`);
  }
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
