import { tool } from "@langchain/core/tools";
import { z } from "zod";

import type { HARestConfig } from "./home-assistant-list-entities.tool";
import {
  resolveDeviceConfig,
  getSupportedLocations
} from "@/lib/plex";

/**
 * Create the play plex media tool
 */
function createPlayPlexMediaTool(
  haRestConfig?: HARestConfig,
  plexConfig?: { baseUrl: string; token: string },
  taskContext?: {
    conversationId: string;
    userId: string;
    createTask: (toolName: string, args: Record<string, unknown>, settings: Record<string, unknown>) => Promise<{ taskId: string; taskName: string }>;
  }
) {
  const supportedLocations = getSupportedLocations();

  return tool(
    async ({
      location_id,
      media_query,
      playback_mode = "resume"
    }: {
      location_id: string;
      media_query: string;
      playback_mode?: "resume" | "restart";
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

      // Create a background task
      if (!taskContext) {
        return "Error: Task context not available - cannot create background tasks";
      }

      try {
        const args = { location_id, media_query, playback_mode };
        const settings = {
          services: {
            homeAssistant: haRestConfig ? {
              baseUrl: haRestConfig.baseUrl,
              accessToken: haRestConfig.accessToken
            } : undefined,
            plex: plexConfig ? {
              baseUrl: plexConfig.baseUrl,
              token: plexConfig.token
            } : undefined
          }
        };

        const { taskId, taskName } = await taskContext.createTask("play_media_tv", args, settings);
        return `Task started: ${taskName} (ID: ${taskId})`;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Error creating task: ${errorMessage}`;
      }
    },
    {
      name: "play_media_tv",
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
 * The play plex media tool instance factory
 */
export function createPlayPlexMediaToolInstance(
  haRestConfig?: HARestConfig,
  plexConfig?: { baseUrl: string; token: string },
  taskContext?: {
    conversationId: string;
    userId: string;
    createTask: (toolName: string, args: Record<string, unknown>, settings: Record<string, unknown>) => Promise<{ taskId: string; taskName: string }>;
  }
) {
  return createPlayPlexMediaTool(haRestConfig, plexConfig, taskContext);
}
