import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ToolFactory } from './types';
import { getSettings } from '@/lib/config/settingsCache';
import { getOverseerrClient } from '@/lib/overseerr/validation';
import { REQUEST_STATUS } from '@/lib/overseerr/types';

const TOOL_NAME = 'list_media_requests';

export function createListMediaRequestsTool() {
  return tool(
    async (
      { limit = 20, offset = 0, filter }: { 
        limit?: number; 
        offset?: number; 
        filter?: string;
      },
      _config
    ) => {
      const settings = await getSettings();
      const overseerrResult = getOverseerrClient(settings.services?.overseerr);

      if (!overseerrResult.ok) {
        return `Error: ${overseerrResult.reason}`;
      }

      const client = overseerrResult.client;

      const validFilters = Object.values(REQUEST_STATUS);
      let statusFilter: string | undefined;
      
      if (filter) {
        const normalizedFilter = filter.toLowerCase();
        const matchedFilter = validFilters.find(f => f === normalizedFilter);
        if (matchedFilter) {
          statusFilter = matchedFilter;
        }
      }

      try {
        const response = await client.listRequests({
          take: Math.max(1, Math.min(50, limit || 20)),
          skip: Math.max(0, offset || 0),
          filter: statusFilter,
        });

        const requests = response.results;
        
        if (requests.length === 0) {
          return `No media requests found${filter ? ` with status "${filter}"` : ''}.`;
        }

        const output = requests.map((req, index) => {
          const lines = [
            `${(response.pageInfo.totalResults - (offset || 0) - index)}. ${req.mediaType === 'movie' ? 'Movie' : 'Show'} (ID: ${req.mediaId})`,
            `   Request ID: ${req.id} | Status: ${req.status}`,
            `   Requested: ${new Date(req.createdAt).toLocaleString()}`,
            `   By: ${req.requestedBy.username}`,
          ];
          if (req.updatedAt && req.updatedAt !== req.createdAt) {
            lines.push(`   Updated: ${new Date(req.updatedAt).toLocaleString()}`);
          }
          return lines.join('\n');
        }).join('\n\n');

        const statusText = filter ? ` with status "${filter}"` : '';
        const rangeText = offset > 0 
          ? ` (showing ${offset + 1}-${offset + requests.length} of ${response.pageInfo.totalResults})`
          : ` (showing 1-${requests.length} of ${response.pageInfo.totalResults})`;

        return `Media Requests${statusText}${statusText ? '' : ' (all)'}:${rangeText}\n\n${output}`;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Error listing requests: ${errorMessage}`;
      }
    },
    {
      name: TOOL_NAME,
      description: `List media requests from Overseerr with pagination.
        - limit: Number of results to return (1-50, default: 20)
        - offset: Number of results to skip (for pagination)
        - filter: Filter by status (all, pending, approved, declined, available, failed)
        - Returns request ID, status, timestamp, and requester information`,
      schema: z.object({
        limit: z.number().optional().default(20).describe('Number of results to return (1-50)'),
        offset: z.number().optional().default(0).describe('Number of results to skip for pagination'),
        filter: z.string().optional().describe('Filter by status: all, pending, approved, declined, available, failed')
      })
    }
  );
}

export const listMediaRequestsToolFactory: ToolFactory = async () => {
  const settings = await getSettings();
  const overseerrResult = getOverseerrClient(settings.services?.overseerr);

  if (!overseerrResult.ok) {
    return { ok: false, name: TOOL_NAME, reason: overseerrResult.reason };
  }

  const tool = createListMediaRequestsTool();
  return { ok: true, tool, name: tool.name };
};
