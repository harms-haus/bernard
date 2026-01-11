import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ToolFactory } from './types';
import { getSettings } from '@/lib/config/settingsCache';
import { getOverseerrClient } from '@/lib/overseerr/validation';

const TOOL_NAME = 'request_media';

export function createRequestMediaTool() {
  return tool(
    async (
      { type, media, is4k, seasons }: { 
        type: 'movie' | 'tv'; 
        media: string; 
        is4k?: boolean;
        seasons?: number[];
      },
      _config
    ) => {
      const settings = await getSettings();
      const overseerrResult = getOverseerrClient(settings.services?.overseerr);

      if (!overseerrResult.ok) {
        return `Error: ${overseerrResult.reason}`;
      }

      const client = overseerrResult.client;

      const mediaId = parseInt(media, 10);
      if (isNaN(mediaId)) {
        return `Error: Invalid media ID "${media}". Must be a number.`;
      }

      if (type === 'tv' && seasons && seasons.length > 0) {
        const invalidSeasons = seasons.filter(s => !Number.isInteger(s) || s < 1);
        if (invalidSeasons.length > 0) {
          return `Error: Invalid season numbers: ${invalidSeasons.join(', ')}. Seasons must be positive integers.`;
        }
      }

      try {
        const request = await client.createRequest({
          mediaId,
          mediaType: type,
          is4k,
          seasons: type === 'tv' ? seasons : undefined,
        });

        let message = `Successfully requested ${type} (ID: ${mediaId})\n`;
        message += `Request ID: ${request.id}\n`;
        message += `Status: ${request.status}\n`;
        message += `Requested by: ${request.requestedBy.username}`;
        
        if (is4k) {
          message += '\n4K version requested';
        }
        
        if (seasons && seasons.length > 0) {
          message += `\nSeasons requested: ${seasons.join(', ')}`;
        }

        return message;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Error requesting media: ${errorMessage}`;
      }
    },
    {
      name: TOOL_NAME,
      description: `Request a movie or TV show through Overseerr.
        - Requires the numeric media ID (search first with find_media_status)
        - Optionally request 4K version or specific seasons for TV shows
        - Request will go through approval workflow if configured`,
      schema: z.object({
        type: z.enum(['movie', 'tv']).describe('Type of media to request'),
        media: z.string().describe('Numeric media ID (get this from find_media_status)'),
        is4k: z.boolean().optional().describe('Request 4K version if available'),
        seasons: z.array(z.number()).optional().describe('For TV shows: specific seasons to request')
      })
    }
  );
}

export const requestMediaToolFactory: ToolFactory = async () => {
  const settings = await getSettings();
  const overseerrResult = getOverseerrClient(settings.services?.overseerr);

  if (!overseerrResult.ok) {
    return { ok: false, name: TOOL_NAME, reason: overseerrResult.reason };
  }

  const tool = createRequestMediaTool();
  return { ok: true, tool, name: tool.name };
};
