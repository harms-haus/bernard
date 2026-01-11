import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ToolFactory } from './types';
import { getSettings } from '@/lib/config/settingsCache';
import { getOverseerrClient } from '@/lib/overseerr/validation';

const TOOL_NAME = 'cancel_media_request';

export function createCancelMediaRequestTool() {
  return tool(
    async ({ request }: { request: string }, _config) => {
      const settings = await getSettings();
      const overseerrResult = getOverseerrClient(settings.services?.overseerr);

      if (!overseerrResult.ok) {
        return `Error: ${overseerrResult.reason}`;
      }

      const client = overseerrResult.client;

      const requestId = parseInt(request, 10);
      if (isNaN(requestId)) {
        return `Error: Invalid request ID "${request}". Must be a number.`;
      }

      try {
        await client.deleteRequest(requestId);
        return `Successfully cancelled request ID: ${requestId}`;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
          return `Error: Request ID ${requestId} not found or has already been processed.`;
        }
        if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
          return `Error: You don't have permission to cancel this request. Only pending requests can be cancelled by the requester.`;
        }
        
        return `Error cancelling request: ${errorMessage}`;
      }
    },
    {
      name: TOOL_NAME,
      description: `Cancel a media request in Overseerr by request ID.
        - Only pending requests can be cancelled by the requester
        - Admins with MANAGE_REQUESTS permission can cancel any request
        - Use list_media_requests to get the request ID first`,
      schema: z.object({
        request: z.string().describe('Request ID to cancel (get this from list_media_requests)')
      })
    }
  );
}

export const cancelMediaRequestToolFactory: ToolFactory = async () => {
  const settings = await getSettings();
  const overseerrResult = getOverseerrClient(settings.services?.overseerr);

  if (!overseerrResult.ok) {
    return { ok: false, name: TOOL_NAME, reason: overseerrResult.reason };
  }

  const tool = createCancelMediaRequestTool();
  return { ok: true, tool, name: tool.name };
};
