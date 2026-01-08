import { tool } from "@langchain/core/tools";
import { z } from "zod";

import type { HARestConfig } from "./home-assistant-list-entities.tool";
import {
  type PlexConfig,
  searchPlexMedia,
  getPlexLibrarySections,
  getPlexItemMetadata,
  calculatePlexMediaProgress,
  getLastPlexPlayTime,
  searchPlexMediaWithRanking
} from "../../../lib/plex";
import { ToolFactory } from "./types";
import { getSettings } from "../../../lib/config/settingsCache";
import { createProgressReporter } from "../utils";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { getUpdate } from "../updates";
import { logger } from "../../../lib/logging";

const TOOL_NAME = "search_media";

/**
 * Search result interface for media items
 */
export interface MediaSearchResult {
  name: string;
  lastPlay: number | null;
  progress: number;
  library: string;
  score: number;
  recency: number;
}

/**
 * Dependencies for the search media tool
 */
export type SearchMediaDependencies = {
  searchPlexMediaImpl: typeof searchPlexMedia;
  getPlexLibrarySectionsImpl: typeof getPlexLibrarySections;
  getPlexItemMetadataImpl: typeof getPlexItemMetadata;
};

/**
 * Create default dependencies for search media operations
 */
function createSearchMediaDependencies(
  _haRestConfig?: HARestConfig
): SearchMediaDependencies {
  return {
    searchPlexMediaImpl: searchPlexMedia,
    getPlexLibrarySectionsImpl: getPlexLibrarySections,
    getPlexItemMetadataImpl: getPlexItemMetadata
  };
}

/**
 * Create the search media tool
 */
export function createSearchMediaTool(
  plexConfig?: PlexConfig,
  overrides: Partial<SearchMediaDependencies> = {}
) {
  const deps: SearchMediaDependencies = {
    ...createSearchMediaDependencies(),
    ...overrides,
  };

  return tool(
    async (
      {
        name,
        results = 5,
        offset = 0
      }: {
        name: string;
        results?: number;
        offset?: number;
      },
      config: LangGraphRunnableConfig
    ) => {
      const progress = createProgressReporter(config, TOOL_NAME);

      // Validate inputs
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return "Error: name parameter is required and must be a non-empty string";
      }

      const validResults = Math.max(1, Math.min(20, results || 5)); // Limit to 1-20
      const validOffset = Math.max(0, offset || 0);

      if (!plexConfig?.baseUrl || !plexConfig?.token) {
        return "Error: Plex configuration is required to search media libraries";
      }

      try {
        progress.report(getUpdate([
          "Searching for media...",
          "Perusing library...",
          "Browsing collections...",
          "Scrolling through shelves...",
          "Browsing shelves...",
          "Browsing media...",
          "Digging for gold...",
          "Finding content...",
          "Scanning Plex...",
          "Searching...",
        ]));

        // Search Plex with multi-factor ranking
        const rankedResults = await searchPlexMediaWithRanking(plexConfig, name, {
          limit: validResults,
          offset: validOffset,
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
          progress.reset();
          return "No media found matching your search.";
        }

        // Get detailed metadata and calculate progress for each result
        const searchResultsWithProgress: MediaSearchResult[] = [];

        for (const ranked of rankedResults) {
          const item = ranked.item;
          // Get detailed metadata including viewOffset
          const metadata = await deps.getPlexItemMetadataImpl(plexConfig, item.ratingKey);
          
          const lastPlay = getLastPlexPlayTime(metadata);
          const progressPercent = calculatePlexMediaProgress(metadata?.viewOffset, metadata?.duration || item.duration);

          searchResultsWithProgress.push({
            name: item.title,
            lastPlay,
            progress: progressPercent,
            library: item.type,
            score: ranked.similarity,
            recency: ranked.recency
          });
        }

        // Format output
        const output = searchResultsWithProgress.map((result, index) => {
          const lastPlayStr = result.lastPlay 
            ? new Date(result.lastPlay).toLocaleString() 
            : "Never";
          
          const name = `Name: ${result.name}`;
          const lastPlay = result.recency > 0 ? `Last played: ${lastPlayStr}` : null;
          const progress = result.progress > 0.05 ? `Progress: ${Math.round(result.progress)}%` : null;
          const library = `Library: ${result.library}`;
          const score = `Score: ${result.score.toFixed(2)}`;

          return `${index + 1}. ${[name, lastPlay, progress, library, score].filter(Boolean).join(" - ")}`;
        }).join("\n\n");

        progress.reset();
        return `Search results for "${name}":\n\n${output}`;

      } catch (error) {
        progress.report(`Error: ${error instanceof Error ? error.message : String(error)}`);
        progress.reset();
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('search_media failed: %s', errorMessage);
        
        // Provide more helpful error messages for common issues
        let userFriendlyMessage = `Error searching media: ${errorMessage}`;
        
        if (errorMessage.includes('401') || errorMessage.includes('unauthorized') || errorMessage.includes('Invalid token')) {
          userFriendlyMessage = 'Error: Plex authentication failed. Please check your Plex token configuration.';
        } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Cannot connect')) {
          userFriendlyMessage = 'Error: Cannot connect to Plex server. Please check that your Plex server is running and the URL is correct.';
        } else if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
          userFriendlyMessage = 'Error: Plex server returned "Not Found". Please check your Plex server URL.';
        } else if (errorMessage.includes('Failed to parse')) {
          userFriendlyMessage = 'Error: Failed to parse Plex server response. This may indicate a version incompatibility or network issue.';
        }
        
        return userFriendlyMessage;
      }
    },
    {
      name: TOOL_NAME,
      description: `Search for movies and TV shows in Plex libraries using similarity matching. Returns results ranked by similarity to your search query, including watch progress information. Progress is calculated as: 0% for first 5% of content, 100% for last 15% (fully watched).`,
      schema: z.object({
        name: z.string().describe("Media name or title to search for (e.g., 'Inception', 'Breaking Bad')"),
        results: z.number().optional().default(5).describe("Number of results to return (1-20, default: 5)"),
        offset: z.number().optional().default(0).describe("Number of results to skip (for pagination, default: 0)")
      })
    }
  );
}

/**
 * The search media tool instance factory
 */
export const searchMediaToolFactory: ToolFactory = async () => {
  const settings = await getSettings();
  const plexConfig = settings.services?.plex;

  if (!plexConfig) {
    return { ok: false, name: TOOL_NAME, reason: "Plex service is not configured" };
  }

  const tool = createSearchMediaTool({
    baseUrl: plexConfig.baseUrl,
    token: plexConfig.token
  });

  return { ok: true, tool: tool, name: tool.name };
};
