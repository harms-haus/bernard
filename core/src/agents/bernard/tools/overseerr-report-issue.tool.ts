import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ToolFactory } from './types';
import { getSettings } from '@/lib/config/settingsCache';
import { getOverseerrClient } from '@/lib/overseerr/validation';

const TOOL_NAME = 'report_media_issue';

export function createReportMediaIssueTool() {
  return tool(
    async (
      { media, comment }: { media: string; comment: string },
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

      if (!comment || comment.trim().length === 0) {
        return `Error: Issue comment is required.`;
      }

      const lowerComment = comment.toLowerCase();
      
      let issueType: number;
      if (lowerComment.includes('missing') || lowerComment.includes('not found')) {
        issueType = 1;
      } else if (lowerComment.includes('broken') || lowerComment.includes('not playing') || lowerComment.includes('corrupt')) {
        issueType = 2;
      } else if (lowerComment.includes('wrong') || lowerComment.includes('incorrect')) {
        issueType = 3;
      } else {
        issueType = 4;
      }

      try {
        const issue = await client.createIssue({
          mediaId,
          issueType,
          message: comment,
        });

        return `Successfully reported issue for media ID: ${mediaId}\n` +
          `Issue ID: ${issue.id}\n` +
          `Type: ${getIssueTypeName(issue.issueType)}\n` +
          `Status: ${issue.status}\n` +
          `Created: ${new Date(issue.createdAt).toLocaleString()}`;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Error reporting issue: ${errorMessage}`;
      }
    },
    {
      name: TOOL_NAME,
      description: `Report an issue with media in Overseerr (missing, broken, wrong metadata, etc.).
        - Issue type is automatically determined from comment keywords
        - Common issue types: missing, broken, wrong, other
        - Requires media ID (get from find_media_status or list_media_requests)`,
      schema: z.object({
        media: z.string().describe('Media ID to report issue for'),
        comment: z.string().describe('Description of the issue (keywords like "missing", "broken" auto-detect type)')
      })
    }
  );
}

function getIssueTypeName(type: number): string {
  switch (type) {
    case 1: return 'Missing';
    case 2: return 'Broken';
    case 3: return 'Wrong';
    default: return 'Other';
  }
}

export const reportMediaIssueToolFactory: ToolFactory = async () => {
  const settings = await getSettings();
  const overseerrResult = getOverseerrClient(settings.services?.overseerr);

  if (!overseerrResult.ok) {
    return { ok: false, name: TOOL_NAME, reason: overseerrResult.reason };
  }

  const tool = createReportMediaIssueTool();
  return { ok: true, tool, name: tool.name };
};
