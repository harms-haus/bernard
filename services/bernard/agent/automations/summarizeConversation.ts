import { ConversationSummaryService } from "@/lib/conversation/summary";
import { RecordKeeper } from "../recordKeeper/conversation.keeper";
import { getRedis } from "@/lib/infra/redis";
import type { Automation, AutomationEvent, AutomationContext, AutomationResult } from "@/lib/automation/types";
import { isConversationArchivedEvent } from "@/lib/automation/types";

// Cache for the summarizer service
let summarizerPromise: Promise<ConversationSummaryService> | null = null;

async function getSummarizer(): Promise<ConversationSummaryService> {
  if (summarizerPromise) return summarizerPromise;
  summarizerPromise = ConversationSummaryService.create();
  return summarizerPromise;
}

const automation: Automation = {
  id: 'summarize-conversation',
  name: 'Summarize Conversation',
  description: 'Generate summary, tags, and keywords when conversation is archived',
  hooks: ['conversation_archived'],
  enabled: true,

  async execute(event: AutomationEvent, context: AutomationContext): Promise<AutomationResult> {
    if (!isConversationArchivedEvent(event.data)) {
      return { ok: false, reason: "invalid_event_data" };
    }

    const { conversationId, conversationContent } = event.data;

    try {
      context.logger?.("Starting conversation summarization", {
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

      // Generate summary
      const summaryResult = await summarizer.summarize(conversationId, messages);

      context.logger?.("Summary generated", {
        conversationId,
        hasSummary: Boolean(summaryResult.summary),
        summaryLength: summaryResult.summary?.length ?? 0,
        tags: summaryResult.tags?.length ?? 0,
        keywords: summaryResult.keywords?.length ?? 0,
        places: summaryResult.places?.length ?? 0
      });

      // Update conversation with summary
      await recordKeeper.updateConversationSummary(conversationId, summaryResult);

      context.logger?.("Conversation summary updated", {
        conversationId,
        hasSummary: Boolean(summaryResult.summary),
        tags: summaryResult.tags?.length ?? 0
      });

      return {
        ok: true,
        meta: {
          hasSummary: Boolean(summaryResult.summary),
          tags: summaryResult.tags?.length ?? 0,
          keywords: summaryResult.keywords?.length ?? 0,
          places: summaryResult.places?.length ?? 0
        }
      };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      context.logger?.("Conversation summarization failed", {
        conversationId,
        error: errorMessage
      });

      return {
        ok: false,
        reason: "summarization_failed",
        meta: { error: errorMessage }
      };
    }
  }
};

export { automation };
