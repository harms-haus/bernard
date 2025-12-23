import { ConversationSummaryService } from "../../conversation/summary";
import { RecordKeeper } from "../../conversation/recordKeeper";
import { getRedis } from "../../infra/redis";
import type { Automation, AutomationEvent, AutomationContext, AutomationResult } from "../types";
import { isConversationArchivedEvent } from "../types";

// Cache for the summarizer service (used for tagging)
let summarizerPromise: Promise<ConversationSummaryService> | null = null;

async function getSummarizer(): Promise<ConversationSummaryService> {
  if (summarizerPromise) return summarizerPromise;
  summarizerPromise = ConversationSummaryService.create();
  return summarizerPromise;
}

const automation: Automation = {
  id: 'tag-conversation',
  name: 'Tag Conversation',
  description: 'Generate tags for conversations when archived',
  hooks: ['conversation_archived'],
  enabled: true,

  async execute(event: AutomationEvent, context: AutomationContext): Promise<AutomationResult> {
    if (!isConversationArchivedEvent(event.data)) {
      return { ok: false, reason: "invalid_event_data" };
    }

    const { conversationId, conversationContent } = event.data;

    try {
      context.logger?.("Starting conversation tagging", {
        conversationId,
        messageCount: conversationContent.messageCount
      });

      // Get dependencies
      const redis = getRedis();
      const recordKeeper = new RecordKeeper(redis);
      const summarizer = await getSummarizer();

      // Get messages for the conversation
      const messages = await recordKeeper.getMessages(conversationId);

      if (!messages || messages.length === 0) {
        context.logger?.("No messages found for conversation", { conversationId });
        return { ok: false, reason: "no_messages" };
      }

      // Generate tags using the summarizer (which also generates summary, but we focus on tags)
      const summaryResult = await summarizer.summarize(conversationId, messages);

      context.logger?.("Tags generated", {
        conversationId,
        tags: summaryResult.tags?.length ?? 0,
        keywords: summaryResult.keywords?.length ?? 0,
        places: summaryResult.places?.length ?? 0
      });

      // Update conversation with tags (summary is handled by separate automation)
      // For now, we update the summary result which includes tags
      // In the future, this could be a dedicated tagging service
      await recordKeeper.updateConversationSummary(conversationId, summaryResult);

      context.logger?.("Conversation tags updated", {
        conversationId,
        tags: summaryResult.tags?.length ?? 0
      });

      return {
        ok: true,
        meta: {
          tags: summaryResult.tags?.length ?? 0,
          keywords: summaryResult.keywords?.length ?? 0,
          places: summaryResult.places?.length ?? 0
        }
      };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      context.logger?.("Conversation tagging failed", {
        conversationId,
        error: errorMessage
      });

      return {
        ok: false,
        reason: "tagging_failed",
        meta: { error: errorMessage }
      };
    }
  }
};

export { automation };
