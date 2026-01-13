import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ToolFactory } from './types';
import { getSettings } from '@/lib/config/settingsCache';
import { getOverseerrClient } from '@/lib/overseerr/validation';
import type { OverseerrClient } from '@/lib/overseerr/client';
import type { BernardSettings } from '@/lib/config/settingsStore';
import { logger } from '@/lib/logging';

const TOOL_NAME = 'find_media_status';

/**
 * Dependencies for the Overseerr media tools.
 */
export interface OverseerrDependencies {
  fetchSettings: () => Promise<BernardSettings>;
  getOverseerrClient: typeof getOverseerrClient;
  logger: typeof logger;
}

interface SearchResult {
  id: number;
  title: string;
  overview?: string;
  releaseDate?: string;
  mediaType: 'movie' | 'tv';
  status?: string;
}

function createFindMediaStatusToolImpl(
  client: OverseerrClient,
) {
  return tool(
    async (
      { type, filter }: { type: 'movie' | 'tv'; filter?: string },
      _config
    ): Promise<string> => {
      try {
        if (/^\d+$/.test(filter || '')) {
          const id = parseInt(filter!, 10);

          interface MovieResponse {
            movie: {
              id: number;
              title: string;
              status?: string;
              overview?: string;
            };
          }

          interface TvShowResponse {
            tvShow: {
              id: number;
              title: string;
              status?: string;
              overview?: string;
            };
          }

          let response: MovieResponse | TvShowResponse;
          let media: { id: number; title: string; status?: string; overview?: string };

          if (type === 'movie') {
            response = await client.getMovie(id);
            if (!response.movie) {
              return `Error: Movie with ID ${id} not found or invalid response format`;
            }
            media = response.movie;
          } else {
            response = await client.getTvShow(id);
            if (!response.tvShow) {
              return `Error: TV show with ID ${id} not found or invalid response format`;
            }
            media = response.tvShow;
          }

          const title = media.title || 'Unknown Title';
          const mediaId = media.id ?? id;
          const status = media.status || 'unknown';
          const overview = media.overview || 'N/A';

          return `Media Details (${type}):\n\n` +
            `Title: ${title}\n` +
            `ID: ${mediaId}\n` +
            `Status: ${status}\n` +
            `Overview: ${overview}`;
        }

        const searchResults = await client.search(filter || '', 1);
        
        const filteredResults = searchResults.results.filter(
          (item) => item.mediaType === type
        );

        const finalResults = filter
          ? filteredResults.filter(item => item.title.toLowerCase().includes(filter.toLowerCase()))
          : filteredResults;

        if (finalResults.length === 0) {
          return `No ${type}s found matching "${filter || '(all)'}"`;
        }

        const output = finalResults.slice(0, 10).map((item: SearchResult, index: number) => {
          const lines = [
            `${index + 1}. ${item.title} (${item.releaseDate?.split('-')[0] || 'N/A'})`,
            `   ID: ${item.id} | Type: ${item.mediaType}`,
            `   Status: ${item.status || 'unknown'}`,
          ];
          if (item.overview) {
            lines.push(`   Overview: ${item.overview.slice(0, 100)}...`);
          }
          return lines.join('\n');
        }).join('\n\n');

        return `${type === 'movie' ? 'Movies' : 'TV Shows'} matching "${filter || '(all)'}":\n\n${output}`;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('find_media_status failed: %s', errorMessage);
        return `Error searching media: ${errorMessage}`;
      }
    },
    {
      name: TOOL_NAME,
      description: `Search for movies or TV shows in Overseerr to check availability and status. 
        - Use filter parameter to search by title OR provide a numeric ID to get specific media details
        - Type parameter specifies whether to search movies or TV shows
        - Returns availability status, overview, and metadata`,
      schema: z.object({
        type: z.enum(['movie', 'tv']).describe('Type of media to search for'),
        filter: z.string().optional().describe('Search query (title) or media ID number')
      })
    }
  );
}

/**
 * Create the Overseerr find media status tool with injected dependencies.
 */
export async function createFindMediaStatusTool(
  deps: OverseerrDependencies
) {
  const settings = await deps.fetchSettings();
  const clientResult = deps.getOverseerrClient(settings.services?.overseerr);
  if (!clientResult.ok) {
    throw new Error(clientResult.reason);
  }
  return createFindMediaStatusToolImpl(clientResult.client);
}

/**
 * Create the Overseerr find media status tool factory with optional dependency overrides.
 */
export function createFindMediaStatusToolFactory(
  overrides?: Partial<OverseerrDependencies>
): ToolFactory {
  const defaultDependencies: OverseerrDependencies = {
    fetchSettings: () => getSettings(),
    getOverseerrClient,
    logger,
  };

  const deps = { ...defaultDependencies, ...overrides };

  return async () => {
    const settings = await deps.fetchSettings();
    const overseerrResult = deps.getOverseerrClient(settings.services?.overseerr);

    if (!overseerrResult.ok) {
      return { ok: false, name: TOOL_NAME, reason: overseerrResult.reason };
    }

    const tool = createFindMediaStatusToolImpl(overseerrResult.client);
    return { ok: true, tool, name: tool.name };
  };
}

/**
 * Default factory for backward compatibility.
 */
export const findMediaStatusToolFactory = createFindMediaStatusToolFactory();
