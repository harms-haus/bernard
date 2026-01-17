import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { callService } from "home-assistant-js-websocket";
import { exec } from "child_process";
import { promisify } from "util";

import type { HARestConfig } from "./home-assistant-list-entities.tool";
import {
  resolveDeviceConfig,
  resolveHAEntityId,
  resolveHAPlexEntityId,
  resolveAdbAddress,
  getDeviceName,
  getSupportedLocations,
  type PlexConfig,
  type PlexMediaItem,
  searchPlexMedia,
  getPlexLibrarySections,
  getPlexItemMetadata,
  searchPlexMediaWithRanking
} from "@/lib/plex";
import {
  getHAConnection,
  getEntityState,
  type HomeAssistantServiceCall
} from "@/lib/home-assistant";
import { ToolFactory } from "./types";
import { getSettings } from "@/lib/config/settingsCache";
import { createProgressReporter } from "../utils";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { getUpdate } from "../updates";
import { logger } from "@/lib/logging";

const execAsync = promisify(exec);

const TOOL_NAME = "play_media_tv";

/**
 * Dependencies for the play media tool
 */
export type PlayMediaTvDependencies = {
  searchPlexMediaImpl: typeof searchPlexMedia;
  getPlexLibrarySectionsImpl: typeof getPlexLibrarySections;
  getPlexItemMetadataImpl: typeof getPlexItemMetadata;
  callHAServiceWebSocketImpl: typeof callHAServiceWebSocket;
  recordServiceCallImpl: (serviceCall: HomeAssistantServiceCall) => void | Promise<void>;
};

/**
 * Call a Home Assistant service via WebSocket API
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
    await callService(connection, domain, service, serviceData);
  } catch (error) {
    console.error('[HA WebSocket] Failed to call service:', error);
    throw error;
  }
}

/**
 * Create default dependencies for play media operations
 */
function createPlayMediaTvDependencies(
  _haRestConfig?: HARestConfig
): PlayMediaTvDependencies {
  return {
    searchPlexMediaImpl: searchPlexMedia,
    getPlexLibrarySectionsImpl: getPlexLibrarySections,
    getPlexItemMetadataImpl: getPlexItemMetadata,
    callHAServiceWebSocketImpl: callHAServiceWebSocket,
    recordServiceCallImpl: () => {
      throw new Error("recordServiceCallImpl must be provided via dependencies");
    }
  };
}

/**
 * Ensure TV is powered on
 */
async function ensureTvOn(
  haEntityId: string | null,
  haRestConfig: HARestConfig | undefined,
  _adbAddress: string | null,
  actions: string[],
  deviceName: string,
  deps: PlayMediaTvDependencies
): Promise<void> {
  if (!haEntityId || !haRestConfig) {
    console.warn(`No Home Assistant entity configured for ${deviceName} power control`);
    return;
  }

  try {
    const state = await getEntityState(haRestConfig.baseUrl, haRestConfig.accessToken || '', haEntityId);
    if (state?.state === 'on') {
      console.warn(`${deviceName} is already on`);
      return;
    }

    await deps.callHAServiceWebSocketImpl(
      haRestConfig.baseUrl,
      haRestConfig.accessToken || '',
      'media_player',
      'turn_on',
      { entity_id: haEntityId }
    );

    actions.push(`Powered on ${deviceName}`);

    await new Promise(resolve => setTimeout(resolve, 9000));

  } catch (error) {
    console.warn(`Failed to power on ${deviceName} via Home Assistant:`, error);
    actions.push(`Failed to power on ${deviceName} (continuing anyway)`);
  }
}

/**
 * Ensure Plex app is active
 */
async function ensurePlexActive(
  haEntityId: string | null,
  haRestConfig: HARestConfig | undefined,
  adbAddress: string | null,
  actions: string[],
  deviceName: string,
  deps: PlayMediaTvDependencies
): Promise<void> {
  if (!adbAddress) {
    if (haEntityId && haRestConfig) {
      try {
        await deps.callHAServiceWebSocketImpl(
          haRestConfig.baseUrl,
          haRestConfig.accessToken || '',
          'media_player',
          'select_source',
          {
            entity_id: haEntityId,
            source: 'Plex'
          }
        );
        actions.push(`Selected Plex source on ${deviceName}`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        console.warn(`Failed to select Plex source via HA:`, error);
      }
    }
    return;
  }

  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.info({
        msg: 'Attempting to launch Plex',
        device: deviceName,
        attempt,
        maxAttempts
      });

      await execAsync(`adb connect ${adbAddress}`);
      await execAsync(`adb -s ${adbAddress} shell monkey -p com.plexapp.android -c android.intent.category.LAUNCHER 1`);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const { stdout: plexActivity } = await execAsync(`adb -s ${adbAddress} shell dumpsys activity activities | grep -i plex`);
      const isPlexActive = plexActivity.includes('com.plexapp.android');

      if (isPlexActive) {
        actions.push(`Launched Plex app on ${deviceName}`);
        return;
      }

      if (attempt === 5 && haEntityId && haRestConfig) {
        try {
          await deps.callHAServiceWebSocketImpl(
            haRestConfig.baseUrl,
            haRestConfig.accessToken || '',
            'media_player',
            'select_source',
            {
              entity_id: haEntityId,
              source: 'Plex'
            }
          );
        } catch (error) {
          console.warn(`Failed to launch Plex via HA fallback:`, error);
        }
      }
    } catch (error) {
      logger.error({
        msg: 'Plex launch attempt failed',
        device: deviceName,
        attempt,
        maxAttempts,
        error: error instanceof Error ? error.message : String(error)
      });
      if (attempt === maxAttempts) {
        throw new Error(`Failed to launch Plex on ${deviceName} after ${maxAttempts} attempts`);
      }
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error(`Failed to launch Plex on ${deviceName} - all methods exhausted`);
}

/**
 * Play media on Plex
 */
async function playMediaOnPlex(
  haPlexEntityId: string | null,
  haRestConfig: HARestConfig | undefined,
  deps: PlayMediaTvDependencies,
  plexConfig: PlexConfig,
  mediaType: 'movie' | 'show',
  bestMatch: PlexMediaItem,
  deviceName: string,
  actions: string[],
  location_id: string,
  playback_mode: "resume" | "restart" = "resume"
): Promise<void> {
  if (haPlexEntityId && haRestConfig && haRestConfig.accessToken) {
    const mediaContentId: {
      library_name: string;
      title?: string;
      show_name?: string;
      offset?: number;
      inProgress?: boolean;
    } = {
      library_name: mediaType === 'movie' ? 'Movies' : 'TV Shows'
    };

    if (mediaType === 'movie') {
      mediaContentId.title = bestMatch.title;
    } else {
      mediaContentId.show_name = bestMatch.title;
    }

    if (playback_mode === 'resume') {
      try {
        const itemMetadata = await deps.getPlexItemMetadataImpl(plexConfig, bestMatch.ratingKey);

        if (itemMetadata?.viewOffset && itemMetadata.viewOffset > 0) {
          mediaContentId.offset = Math.floor(itemMetadata.viewOffset / 1000);
        }
      } catch (error) {
        console.warn(`Failed to get viewOffset for ${bestMatch.title}:`, error);
      }

      if (mediaType === 'show') {
        mediaContentId.inProgress = true;
      }
    }

    const serviceData: Record<string, unknown> = {
      media_content_type: mediaType === 'movie' ? 'MOVIE' : 'EPISODE',
      media_content_id: `plex://${JSON.stringify(mediaContentId)}`
    };

    for (let i = 0; i < 3; i++) {
      try {
        await deps.callHAServiceWebSocketImpl(
          haRestConfig.baseUrl,
          haRestConfig.accessToken,
          'media_player',
          'play_media',
          {
            entity_id: haPlexEntityId,
            ...serviceData
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

    const playbackDescription = playback_mode === 'resume'
      ? ' (resuming if available)'
      : ' (starting from beginning)';

    actions.push(`Started "${bestMatch.title}" playback on ${deviceName} via Home Assistant Plex${playbackDescription}`);
  } else {
    actions.push(`No Home Assistant Plex entity configured for ${location_id}`);
  }
}

/**
 * Create the play media TV tool
 */
export function createPlayMediaTvTool(
  haRestConfig?: HARestConfig,
  plexConfig?: PlexConfig,
  overrides: Partial<PlayMediaTvDependencies> = {}
) {
  const deps: PlayMediaTvDependencies = {
    ...createPlayMediaTvDependencies(haRestConfig),
    ...overrides,
  };

  const supportedLocations = getSupportedLocations();

  return tool(
    async (
      {
        location_id,
        media_query,
        playback_mode = "resume"
      }: {
        location_id: string;
        media_query: string;
        playback_mode?: "resume" | "restart";
      },
      config: LangGraphRunnableConfig
    ) => {
      const progress = createProgressReporter(config, TOOL_NAME);

      if (!location_id || typeof location_id !== 'string') {
        return "Error: location_id parameter is required and must be a string";
      }

      if (!media_query || media_query.trim().length === 0) {
        return "Error: media_query parameter is required and cannot be empty";
      }

      if (!plexConfig) {
        return "Error: Plex configuration is required to search media libraries";
      }

      const deviceConfig = resolveDeviceConfig(location_id);
      if (!deviceConfig) {
        return `Error: Location "${location_id}" is not supported. Supported locations: ${supportedLocations.join(', ')}`;
      }

      const deviceName = getDeviceName(location_id);
      const haEntityId = resolveHAEntityId(location_id);
      const haPlexEntityId = resolveHAPlexEntityId(location_id);
      const adbAddress = resolveAdbAddress(location_id);

      const actions: string[] = [];

      try {

        // Search Plex with multi-factor ranking (similarity, watch time, recency)
        const rankedResults = await searchPlexMediaWithRanking(plexConfig, media_query, {
          limit: 1,
          modifyScore: (mediaInfo) => {
            let scoreMod = 0;
            if ((mediaInfo.viewOffset || 0) / (mediaInfo.duration || 1) > 0.05) {
              scoreMod += 0.15
            }
            if (mediaInfo.recency > 0) {
              scoreMod += 0.05 * mediaInfo.recency;
            }
            return scoreMod;
          }
        });

        if (rankedResults.length === 0) {
          throw new Error(`No media found matching "${media_query}" in Plex libraries`);
        }

        const bestMatch = rankedResults[0]!.item;
        const mediaType = bestMatch.type === 'movie' ? 'movie' : 'show';

        progress.report(getUpdate([
          "Powering tv...",
          "Starting generator...",
          "Grabbing remote..."
        ]));

        await ensureTvOn(haEntityId, haRestConfig, adbAddress, actions, deviceName, deps);

        progress.report(getUpdate([
          "Launching plex...",
          "Starting Plex...",
          "Loading Plex...",
          "Opening Plex...",
          "Plexercising...",
          "Plexing...",
          "Loading..."
        ]));

        await ensurePlexActive(haEntityId, haRestConfig, adbAddress, actions, deviceName, deps);

        progress.report(getUpdate([
          "Starting trailers...",
          "Starting previews...",
          "Spoiling the ending...",
          "Starting the show...",
        ]));

        await playMediaOnPlex(haPlexEntityId, haRestConfig, deps, plexConfig, mediaType, bestMatch, deviceName, actions, location_id, playback_mode);

        progress.reset();

        if (actions.length === 0) {
          throw new Error(`Found "${bestMatch.title}" (${mediaType}) but no actions are available for location "${location_id}". Please check device configuration.`);
        }

        return `Successfully started playback:\n${actions.join('\n')}`;

      } catch (error) {
        progress.reset();
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('play_media_tv failed: %s', errorMessage);
        return `Error playing media: ${errorMessage}`;
      }
    },
    {
      name: TOOL_NAME,
      description: `Search for media in Plex libraries and control playback on supported TV locations. Supported locations: ${supportedLocations.join(', ')}. The tool automatically powers on the TV if needed, launches Plex via Home Assistant media_player.select_source, and uses Home Assistant's Plex integration to play media directly. It searches both Movies and TV Shows libraries and selects the best match. Actions performed depend on device capabilities: powers on device, launches apps via Home Assistant, and uses Home Assistant Plex entities for media playback.`,
      schema: z.object({
        location_id: z.enum(supportedLocations as [string, ...string[]]).describe(`TV location identifier. Supported: ${supportedLocations.join(', ')}`),
        media_query: z.string().describe("Media title to search for in Plex (e.g., 'Inception', 'The Matrix')"),
        playback_mode: z.enum(["resume", "restart"]).optional().default("resume").describe("Playback mode: 'resume' to continue from last position, 'restart' to start from beginning")
      })
    }
  );
}

/**
 * The play media TV tool instance factory
 */
export const playMediaTvToolFactory: ToolFactory = async () => {
  const settings = await getSettings();
  const haConfig = settings.services?.homeAssistant;
  const plexConfig = settings.services?.plex;

  if (!plexConfig?.baseUrl || !plexConfig?.token) {
    return { ok: false, name: TOOL_NAME, reason: "Plex service is not configured" };
  }

  // Cast to HARestConfig after checking baseUrl exists
  const haRestConfig: HARestConfig | undefined = haConfig?.baseUrl ? {
    baseUrl: haConfig.baseUrl,
    accessToken: haConfig.accessToken
  } : undefined;

  const tool = createPlayMediaTvTool(haRestConfig, {
    baseUrl: plexConfig.baseUrl,
    token: plexConfig.token
  });

  return { ok: true, tool: tool, name: tool.name };
};
