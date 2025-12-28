import type { TaskExecutionContext, TaskResult } from "@/lib/task/types";
import { exec } from "child_process";
import { promisify } from "util";
import { getHAConnection } from "@/lib/home-assistant";
import { getEntityState } from "../tool/home-assistant-get-entity-state.tool";
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
  rankSearchResults,
  searchPlexBestMatch
} from "@/lib/plex";
import { logger } from "@/lib/logging";

const execAsync = promisify(exec);

/**
 * Configuration types
 */
export type HARestConfig = {
  baseUrl: string;
  accessToken?: string;
};

export type HomeAssistantServiceCall = {
  domain: string;
  service: string;
  service_data: Record<string, unknown>;
};

/**
 * Dependencies for the play plex media operations
 */
type PlayPlexMediaDependencies = {
  searchPlexMediaImpl: typeof searchPlexMedia;
  getPlexLibrarySectionsImpl: typeof getPlexLibrarySections;
  getPlexItemMetadataImpl: typeof getPlexItemMetadata;
  callHAServiceWebSocketImpl: typeof callHAServiceWebSocket;
  rankSearchResultsImpl: typeof rankSearchResults;
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
 * Get Plex server identity information
 */

/**
 * Ensure TV is powered on
 */
async function ensureTvOn(
  haEntityId: string | null,
  haRestConfig: HARestConfig | undefined,
  adbAddress: string | null,
  actions: string[],
  deviceName: string,
  deps: PlayPlexMediaDependencies
): Promise<void> {
  if (!haEntityId || !haRestConfig) {
    console.warn(`No Home Assistant entity configured for ${deviceName} power control`);
    return;
  }

  try {
    // Check current power state
    const state = await getEntityState(haRestConfig.baseUrl, haRestConfig.accessToken || '', haEntityId);
    if (state?.state === 'on') {
      console.warn(`${deviceName} is already on`);
      return;
    }

    // Try to turn on via HA
    await deps.callHAServiceWebSocketImpl(
      haRestConfig.baseUrl,
      haRestConfig.accessToken || '',
      'media_player',
      'turn_on',
      { entity_id: haEntityId }
    );

    actions.push(`Powered on ${deviceName}`);

    // Wait for device to be ready
    await new Promise(resolve => setTimeout(resolve, 8000));

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
  deps: PlayPlexMediaDependencies
): Promise<void> {
  if (!adbAddress) {
    // Use Home Assistant to select Plex source
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

  // Use ADB to launch Plex
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.info({
        msg: 'Attempting to launch Plex',
        device: deviceName,
        attempt,
        maxAttempts
      });

      // Try to launch Plex app
      await execAsync(`adb connect ${adbAddress}`);
      await execAsync(`adb -s ${adbAddress} shell monkey -p com.plexapp.android -c android.intent.category.LAUNCHER 1`);

      // Wait for app to start
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if Plex is running
      const { stdout: plexActivity } = await execAsync(`adb -s ${adbAddress} shell dumpsys activity activities | grep -i plex`);
      const isPlexActive = plexActivity.includes('com.plexapp.android');

      if (isPlexActive) {
        actions.push(`Launched Plex app on ${deviceName}`);
        return;
      }

      // Fallback: Try to use HA if ADB fails
      if (attempt === 5 && haEntityId && haRestConfig) {
        try {
          const launchPlexApp = async () => {
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
          };
          await launchPlexApp();
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

    // Wait before next attempt
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
  deps: PlayPlexMediaDependencies,
  plexConfig: PlexConfig,
  mediaType: 'movie' | 'show',
  bestMatch: PlexMediaItem,
  deviceName: string,
  actions: string[],
  location_id: string,
  playback_mode: "resume" | "restart" = "resume"
): Promise<void> {
  if (haPlexEntityId && haRestConfig && haRestConfig.accessToken) {
    // Build media_content_id object dynamically
    const mediaContentId: {
      library_name: string;
      title?: string;
      show_name?: string;
      offset?: number;
      inProgress?: boolean;
    } = {
      library_name: mediaType === 'movie' ? 'Movies' : 'TV Shows'
    };

    // Add title/show_name based on media type
    if (mediaType === 'movie') {
      mediaContentId.title = bestMatch.title;
    } else {
      mediaContentId.show_name = bestMatch.title;
    }

    // Handle resume mode: get viewOffset from Plex API and convert to seconds
    if (playback_mode === 'resume') {
      try {
        const itemMetadata = await deps.getPlexItemMetadataImpl(plexConfig, bestMatch.ratingKey);

        if (itemMetadata?.viewOffset && itemMetadata.viewOffset > 0) {
          // Convert milliseconds to seconds for Home Assistant
          mediaContentId.offset = Math.floor(itemMetadata.viewOffset / 1000);
        }
      } catch (error) {
        console.warn(`Failed to get viewOffset for ${bestMatch.title}:`, error);
        // Continue without offset - will play from beginning
      }

      if (mediaType === 'show') {
        // For shows, add inProgress to find latest in-progress episode
        mediaContentId.inProgress = true;
      }
    }

    // Build service data with appropriate content type
    const serviceData: Record<string, unknown> = {
      media_content_type: mediaType === 'movie' ? 'MOVIE' : 'EPISODE',
      media_content_id: `plex://${JSON.stringify(mediaContentId)}`
    };

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
 * Create default dependencies for play media operations
 */
function createPlayPlexMediaDependencies(haRestConfig?: HARestConfig): PlayPlexMediaDependencies {
  return {
    searchPlexMediaImpl: searchPlexMedia,
    getPlexLibrarySectionsImpl: getPlexLibrarySections,
    getPlexItemMetadataImpl: getPlexItemMetadata,
    callHAServiceWebSocketImpl: callHAServiceWebSocket,
    rankSearchResultsImpl: rankSearchResults,
    recordServiceCallImpl: haRestConfig ? (serviceCall: HomeAssistantServiceCall) => {
      // For now, we'll record the service call but not actually execute it
      // The WebSocket implementation handles the actual execution
      console.warn('Recording service call:', serviceCall);
    } : () => {
      throw new Error("Home Assistant context manager not available for recording service calls");
    }
  };
}

/**
 * Task function for play_media_tv that executes the actual media playback logic
 */
export async function playMediaTvTask(
  args: Record<string, unknown>,
  context: TaskExecutionContext
): Promise<TaskResult> {
  const { location_id, media_query, playback_mode = "resume" } = args as {
    location_id: string;
    media_query: string;
    playback_mode?: "resume" | "restart";
  };

  try {
    // Record the start of execution
    await context.recordEvent({
      type: "message_recorded",
      timestamp: new Date().toISOString(),
      data: {
        role: "system",
        content: `Starting playback of "${media_query}" on ${location_id}`,
        userId: context.userId
      }
    });

    // Extract settings from merged context
    const haRestConfig: HARestConfig | undefined = context.settings.services?.homeAssistant ?
      {
        baseUrl: context.settings.services.homeAssistant.baseUrl,
        accessToken: context.settings.services.homeAssistant.accessToken
      } as HARestConfig : undefined;

    const plexConfig: PlexConfig | undefined = context.settings.services?.plex ?
      {
        baseUrl: context.settings.services.plex.baseUrl,
        token: context.settings.services.plex.token
      } : undefined;

    if (!plexConfig) {
      throw new Error("Plex configuration is required to search media libraries");
    }

    // Create dependencies
    const deps = createPlayPlexMediaDependencies(haRestConfig);

    // Resolve device configuration
    const deviceConfig = resolveDeviceConfig(location_id);
    if (!deviceConfig) {
      const supportedLocations = getSupportedLocations();
      throw new Error(`Location "${location_id}" is not supported. Supported locations: ${supportedLocations.join(', ')}`);
    }

    const deviceName = getDeviceName(location_id);
    const haEntityId = resolveHAEntityId(location_id);
    const haPlexEntityId = resolveHAPlexEntityId(location_id);
    const adbAddress = resolveAdbAddress(location_id);

    const actions: string[] = [];

    // Record search start
    await context.recordEvent({
      type: "tool_call_start",
      timestamp: new Date().toISOString(),
      data: {
        toolName: "plex_search",
        args: { media_query },
        userId: context.userId
      }
    });

    const { bestMatch, mediaType } = await searchPlexBestMatch(plexConfig, media_query, deps);

    // Record search completion
    await context.recordEvent({
      type: "tool_call_complete",
      timestamp: new Date().toISOString(),
      data: {
        toolName: "plex_search",
        result: `Found "${bestMatch.title}" (${mediaType})`,
        userId: context.userId
      }
    });

    await context.recordEvent({
      type: "message_recorded",
      timestamp: new Date().toISOString(),
      data: {
        role: "system",
        content: `Found "${bestMatch.title}" (${mediaType}), preparing playback`,
        userId: context.userId
      }
    });

    // Power on TV if needed
    await ensureTvOn(haEntityId, haRestConfig, adbAddress, actions, deviceName, deps);

    // Launch Plex app
    await ensurePlexActive(haEntityId, haRestConfig, adbAddress, actions, deviceName, deps);

    // Play the media
    await playMediaOnPlex(haPlexEntityId, haRestConfig, deps, plexConfig, mediaType, bestMatch, deviceName, actions, location_id, playback_mode);

    if (actions.length === 0) {
      throw new Error(`Found "${bestMatch.title}" (${mediaType}) but no actions are available for location "${location_id}". Please check device configuration.`);
    }

    // Record final success
    await context.recordEvent({
      type: "message_recorded",
      timestamp: new Date().toISOString(),
      data: {
        role: "system",
        content: `Successfully started playback: ${actions.join(', ')}`,
        userId: context.userId
      }
    });

    return {
      success: true,
      metadata: {
        mediaTitle: bestMatch.title,
        mediaType,
        location: location_id,
        actions: actions.join(', ')
      }
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Record error
    await context.recordEvent({
      type: "message_recorded",
      timestamp: new Date().toISOString(),
      data: {
        role: "system",
        content: `Error during playback: ${errorMessage}`,
        userId: context.userId
      }
    });

    return {
      success: false,
      errorMessage
    };
  }
}
