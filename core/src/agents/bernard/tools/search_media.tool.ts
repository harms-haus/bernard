/**
 * Enhanced Media Search Tool
 * Uses Overseerr to find media and enriches with Plex library status
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";

import type { HARestConfig } from "./home-assistant-list-entities.tool";
import {
  type PlexConfig,
  searchPlexMediaWithRanking,
  getPlexLibrarySections,
  getPlexItemMetadata,
  calculatePlexMediaProgress,
  getLastPlexPlayTime,
} from "@/lib/plex";
import { ToolFactory } from "./types";
import { getSettings } from "@/lib/config/settingsCache";
import { createProgressReporter } from "../utils";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { getUpdate } from "../updates";
import { logger } from "@/lib/logging";
import { getOverseerrClient } from "@/lib/overseerr/validation";
import type { OverseerrMediaItem as OverseerrApiMediaItem } from "@/lib/overseerr/client";

const TOOL_NAME = "search_media";

/**
 * Library status filter options
 */
export type LibraryStatusFilter = "library" | "missing" | "either";

/**
 * Enhanced search result interface with Plex enrichment
 */
export interface MediaSearchResult {
  name: string;
  lastPlay: number | null;
  progress: number;
  library: string;
  score: number;
  recency: number;
  /** Overseerr media ID */
  mediaId: number;
  /** Media type (movie or tv) */
  mediaType: "movie" | "tv";
  /** Plex availability status: 1=UNKNOWN, 2=PENDING, 3=PROCESSING, 4=PARTIALLY_AVAILABLE, 5=AVAILABLE, 6=DELETED */
  status: number;
  /** Human-readable status string */
  statusText: string;
  /** Plex ratingKey (only present if media is in library) */
  plexRatingKey?: string;
  /** Release year */
  year?: string;
  /** Media overview */
  overview?: string;
}

/**
 * Dependencies for the search media tool
 */
export type SearchMediaDependencies = {
  searchOverseerr: (query: string, page: number) => Promise<{ results: OverseerrApiMediaItem[] }>;
  getMovieOverseerr: (id: number) => Promise<{ movie: Record<string, unknown> }>;
  getTvShowOverseerr: (id: number) => Promise<{ tvShow: Record<string, unknown> }>;
  searchPlexMediaImpl: typeof searchPlexMediaWithRanking;
  getPlexLibrarySectionsImpl: typeof getPlexLibrarySections;
  getPlexItemMetadataImpl: typeof getPlexItemMetadata;
};

/**
 * Create default dependencies for search media operations
 */
async function createSearchMediaDependencies(
  _haRestConfig?: HARestConfig
): Promise<SearchMediaDependencies> {
  const settings = await getSettings();
  const overseerrResult = getOverseerrClient(settings.services?.overseerr);

  return {
    searchOverseerr: async (query: string, page: number) => {
      if (!overseerrResult.ok) throw new Error(overseerrResult.reason);
      return overseerrResult.client.search(query, page);
    },
    getMovieOverseerr: async (id: number) => {
      if (!overseerrResult.ok) throw new Error(overseerrResult.reason);
      return overseerrResult.client.getMovie(id);
    },
    getTvShowOverseerr: async (id: number) => {
      if (!overseerrResult.ok) throw new Error(overseerrResult.reason);
      return overseerrResult.client.getTvShow(id);
    },
    searchPlexMediaImpl: searchPlexMediaWithRanking,
    getPlexLibrarySectionsImpl: getPlexLibrarySections,
    getPlexItemMetadataImpl: getPlexItemMetadata,
  };
}

/**
 * Get human-readable status text from status code
 */
function getStatusText(status: number | string): string {
  const statusNum = typeof status === "string" ? parseInt(status, 10) : status;
  const statusMap: Record<number, string> = {
    1: "UNKNOWN",
    2: "PENDING",
    3: "PROCESSING",
    4: "PARTIALLY_AVAILABLE",
    5: "AVAILABLE",
    6: "DELETED",
  };
  return statusMap[statusNum] || "UNKNOWN";
}

/**
 * Check if media is available in Plex library based on status
 */
function isInLibrary(status: number | string): boolean {
  const statusNum = typeof status === "string" ? parseInt(status, 10) : status;
  return statusNum === 4 || statusNum === 5; // PARTIALLY_AVAILABLE or AVAILABLE
}

/**
 * Filter media by library status
 */
function filterByLibraryStatus(
  items: OverseerrApiMediaItem[],
  filter: LibraryStatusFilter
): OverseerrApiMediaItem[] {
  if (filter === "either") return items;

  return items.filter((item) => {
    const status = item.status ?? 1; // Default to UNKNOWN if not set
    const inLibrary = isInLibrary(status);

    if (filter === "library") {
      return inLibrary;
    } else if (filter === "missing") {
      return !inLibrary;
    }
    return true;
  });
}

/**
 * Create the search media tool with Overseerr integration and Plex enrichment
 */
export function createSearchMediaTool(
  plexConfig?: PlexConfig,
  overrides: Partial<SearchMediaDependencies> = {}
) {
  return tool(
    async (
      {
        name,
        results = 5,
        offset = 0,
        type = "either",
      }: {
        name: string;
        results?: number;
        offset?: number;
        type?: LibraryStatusFilter;
      },
      config: LangGraphRunnableConfig
    ) => {
      const progress = createProgressReporter(config, TOOL_NAME);

      // Validate inputs
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return "Error: name parameter is required and must be a non-empty string";
      }

      const validResults = Math.max(1, Math.min(20, results || 5)); // Limit to 1-20
      const validOffset = Math.max(0, offset || 0);
      const validType = (type as LibraryStatusFilter) || "either";

      try {
        progress.report(
          getUpdate([
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
          ])
        );

        // Create dependencies
        const deps = await createSearchMediaDependencies();
        const finalDeps = { ...deps, ...overrides };

        // Search Overseerr for media
        const overseerrResult = await finalDeps.searchOverseerr(name, 1);

        if (!overseerrResult.results || overseerrResult.results.length === 0) {
          progress.reset();
          return `No media found matching "${name}".`;
        }

        // Filter by library status if requested
        let filteredResults = filterByLibraryStatus(
          overseerrResult.results,
          validType
        );

        if (filteredResults.length === 0) {
          const filterDesc =
            validType === "library"
              ? "in library"
              : validType === "missing"
                ? "not in library"
                : "matching criteria";
          progress.reset();
          return `No media found ${filterDesc} matching "${name}".`;
        }

        // Get detailed info for each result (to get ratingKey if available)
        const searchResults: MediaSearchResult[] = [];

        for (const item of filteredResults) {
          try {
            // Get detailed media info to check for Plex ratingKey
            let ratingKey: string | undefined;

            if (item.mediaType === "movie") {
              const movieDetail = await finalDeps.getMovieOverseerr(item.id);
              ratingKey = movieDetail.movie.ratingKey as string | undefined;
            } else {
              const tvDetail = await finalDeps.getTvShowOverseerr(item.id);
              ratingKey = tvDetail.tvShow.ratingKey as string | undefined;
            }

            // If we have a ratingKey, try to get Plex progress info
            let lastPlay: number | null = null;
            let progressPercent = 0;

            if (ratingKey && plexConfig?.baseUrl && plexConfig?.token) {
              try {
                const metadata = await finalDeps.getPlexItemMetadataImpl(
                  plexConfig,
                  ratingKey
                );
                if (metadata) {
                  lastPlay = getLastPlexPlayTime(metadata);
                  progressPercent = calculatePlexMediaProgress(
                    metadata.viewOffset,
                    metadata.duration || 0
                  );
                }
              } catch {
                // Failed to get Plex metadata, continue without it
              }
            }

            // Calculate recency from release date (simplified)
            let recency = 0;
            if (item.releaseDate) {
              const releaseYear = parseInt(
                item.releaseDate.split("-")[0],
                10
              );
              const currentYear = new Date().getFullYear();
              recency = Math.max(0, releaseYear - currentYear);
            }

            searchResults.push({
              name: item.title,
              lastPlay,
              progress: progressPercent,
              library: item.mediaType === "movie" ? "movie" : "show",
              score: 0, // Will be set based on match quality
              recency,
              mediaId: item.id,
              mediaType: item.mediaType,
              status: typeof item.status === "string" ? parseInt(item.status, 10) : (item.status ?? 1),
              statusText: getStatusText(item.status ?? 1),
              plexRatingKey: ratingKey,
              year: item.releaseDate?.split("-")[0],
              overview: item.overview,
            });
          } catch (error) {
            logger.error(
              `Failed to get details for media ${item.id}: ${error}`
            );
            // Add result without Plex enrichment
            searchResults.push({
              name: item.title,
              lastPlay: null,
              progress: 0,
              library: item.mediaType === "movie" ? "movie" : "show",
              score: 0,
              recency: 0,
              mediaId: item.id,
              mediaType: item.mediaType,
              status: typeof item.status === "string" ? parseInt(item.status, 10) : (item.status ?? 1),
              statusText: getStatusText(item.status ?? 1),
              year: item.releaseDate?.split("-")[0],
              overview: item.overview,
            });
          }
        }

        // Sort by relevance (title match) and limit results
        const searchLower = name.toLowerCase();
        const sortedResults = searchResults
          .map((result) => {
            // Simple similarity score based on title match
            const titleLower = result.name.toLowerCase();
            let score = 0;
            if (titleLower === searchLower) {
              score = 1.0;
            } else if (titleLower.startsWith(searchLower)) {
              score = 0.9;
            } else if (titleLower.includes(searchLower)) {
              score = 0.7;
            }
            return { ...result, score };
          })
          .sort((a, b) => b.score - a.score)
          .slice(validOffset, validOffset + validResults);

        if (sortedResults.length === 0) {
          progress.reset();
          return `No media found matching your search.`;
        }

        // Format output - PRESERVING original format while adding enhanced info
        const output = sortedResults
          .map((result, index) => {
            const lines: string[] = [];

            // Original fields (preserved)
            const name = `Name: ${result.name}`;
            lines.push(name);

            // Enhanced fields
            const statusInfo = `Status: ${result.statusText}`;
            lines.push(statusInfo);

            if (result.plexRatingKey) {
              lines.push(`Plex: Yes`);
            } else {
              lines.push(`Plex: No`);
            }

            const year = result.year ? `Year: ${result.year}` : null;
            if (year) lines.push(year);

            if (result.lastPlay) {
              const lastPlayStr = new Date(result.lastPlay).toLocaleString();
              lines.push(`Last played: ${lastPlayStr}`);
            } else {
              lines.push(`Last played: Never`);
            }

            if (result.progress > 0.05) {
              lines.push(`Progress: ${Math.round(result.progress)}%`);
            }

            lines.push(`Library: ${result.library}`);
            lines.push(`Score: ${result.score.toFixed(2)}`);

            return `${index + 1}. ${lines.filter(Boolean).join(" - ")}`;
          })
          .join("\n\n");

        progress.reset();
        return `Search results for "${name}" (${validType}):\n\n${output}`;
      } catch (error) {
        progress.report(
          `Error: ${error instanceof Error ? error.message : String(error)}`
        );
        progress.reset();
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error("search_media failed: %s", errorMessage);

        // Provide more helpful error messages for common issues
        let userFriendlyMessage = `Error searching media: ${errorMessage}`;

        if (
          errorMessage.includes("401") ||
          errorMessage.includes("unauthorized") ||
          errorMessage.includes("Invalid token")
        ) {
          userFriendlyMessage =
            "Error: Overseerr or Plex authentication failed. Please check your configuration.";
        } else if (
          errorMessage.includes("ECONNREFUSED") ||
          errorMessage.includes("Cannot connect")
        ) {
          userFriendlyMessage =
            "Error: Cannot connect to Overseerr server. Please check that your Overseerr server is running and the URL is correct.";
        } else if (
          errorMessage.includes("404") ||
          errorMessage.includes("Not Found")
        ) {
          userFriendlyMessage =
            "Error: Server returned 'Not Found'. Please check your server URL.";
        }

        return userFriendlyMessage;
      }
    },
    {
      name: TOOL_NAME,
      description: `Search for movies and TV shows using Overseerr with Plex library enrichment. Returns results with Plex availability status, library information, and watch progress. Supports filtering by library status: 'library' (in Plex), 'missing' (not in Plex), or 'either' (default).`,
      schema: z.object({
        name: z
          .string()
          .describe(
            "Media name or title to search for (e.g., 'Inception', 'Breaking Bad')"
          ),
        results: z
          .number()
          .optional()
          .default(5)
          .describe("Number of results to return (1-20, default: 5)"),
        offset: z
          .number()
          .optional()
          .default(0)
          .describe("Number of results to skip (for pagination, default: 0)"),
        type: z
          .enum(["library", "missing", "either"])
          .optional()
          .default("either")
          .describe(
            "Filter by library status: 'library' = in Plex library, 'missing' = not in library, 'either' = both (default: either)"
          ),
      }),
    }
  );
}

/**
 * The search media tool instance factory
 */
export const searchMediaToolFactory: ToolFactory = async () => {
  const settings = await getSettings();
  const plexConfig = settings.services?.plex;

  // Check if Overseerr is configured
  const overseerrResult = getOverseerrClient(settings.services?.overseerr);
  if (!overseerrResult.ok) {
    return { ok: false, name: TOOL_NAME, reason: overseerrResult.reason };
  }

  // Cast to PlexConfig after checking required fields exist
  const tool = createSearchMediaTool(
    plexConfig?.baseUrl && plexConfig?.token
      ? {
          baseUrl: plexConfig.baseUrl,
          token: plexConfig.token,
        }
      : undefined
  );

  return { ok: true, tool: tool, name: tool.name };
};
