import { ConversationIndexer } from "@/lib/indexing/indexer";
import { isFollowUpSuggestionMessage } from "@/lib/conversation/followUpDetection";

function filterMessages(messages: MessageRecord[]): MessageRecord[] {
  const filtered = messages.filter((message) => {
    // Exclude follow-up suggestion messages
    if (isFollowUpSuggestionMessage(message)) {
      return false;
    }

    const traceType = (message.metadata as { traceType?: string } | undefined)?.traceType;
    const name = message.name;

    // Exclude recollection events
    if (name === "recollection" || traceType === "recollection") {
      return false;
    }

    // Exclude tool calls and results
    if (message.role === "tool") {
      return false;
    }

    // Exclude LLM calls and results
    if (traceType === "llm_call") {
      return false;
    }

    // Only include user and assistant messages
    return message.role === "user" || message.role === "assistant";
  });

  return filtered;
}

function toEntry(message: MessageRecord): string {
  const content =
    typeof message.content === "string" ? message.content : JSON.stringify(message.content, null, 2).slice(0, 1800);
  const entry = `[${message.role}] ${content}`;
  return entry;
}

function chunkMessages(entries: string[]): string[] {
  const chunkChars = 1800;
  const maxChunks = 12;

  const chunks: string[] = [];
  let current = "";

  for (const entry of entries) {
    const trimmedEntry = entry.length > chunkChars ? entry.slice(0, chunkChars) : entry;

    if ((current + "\n" + trimmedEntry).length > chunkChars && current.length) {
      const chunk = current.trim();
      chunks.push(chunk);
      current = trimmedEntry;
      continue;
    }
    current = current ? `${current}\n${trimmedEntry}` : trimmedEntry;
    if (current.length >= chunkChars) {
      const chunk = current.slice(0, chunkChars);
      chunks.push(chunk);
      current = "";
    }
  }
  if (current.trim()) {
    const chunk = current.trim();
    chunks.push(chunk);
  }

  const finalChunks = chunks.slice(-maxChunks);

  return finalChunks;
}
import { RecordKeeper } from "../recordKeeper/conversation.keeper";
import { getRedis } from "@/lib/infra/redis";
import type { Automation, AutomationEvent, AutomationContext, AutomationResult, MessageRecord } from "@/lib/automation/types";
import { isConversationArchivedEvent } from "@/lib/automation/types";

// Configuration constants
const messageLimit = parseInt(process.env["CONVERSATION_INDEX_MESSAGE_LIMIT"] ?? "240", 10) || 240;

// Cache for the indexer
let indexer: ConversationIndexer | null = null;

function getIndexer(): ConversationIndexer {
  if (!indexer) {
    indexer = new ConversationIndexer(getRedis());
  }
  return indexer;
}

const automation: Automation = {
  id: 'index-conversation',
  name: 'Index Conversation',
  description: 'Index conversation messages for semantic search when archived',
  hooks: ['conversation_archived'],
  enabled: true,

  async execute(event: AutomationEvent, context: AutomationContext): Promise<AutomationResult> {
    if (!isConversationArchivedEvent(event.data)) {
      return { ok: false, reason: "invalid_event_data" };
    }

    const { conversationId, conversationContent } = event.data;

    try {
      context.logger?.("Starting conversation indexing", {
        conversationId,
        messageCount: conversationContent.messageCount
      });

      // Get dependencies
      const redis = getRedis();
      const recordKeeper = new RecordKeeper(redis);
      const conversationIndexer = getIndexer();

      // Check if conversation is ghost - skip indexing
      const conversation = await recordKeeper.getConversation(conversationId);
      if (conversation?.ghost === true) {
        context.logger?.("Skipping index task for ghost conversation", { conversationId });
        return { ok: true, meta: { chunks: 0, skipped: true, reason: "ghost_conversation" } };
      }

      // Get messages for the conversation
      const messages = await recordKeeper.getMessages(conversationId);

      if (!messages || messages.length === 0) {
        context.logger?.("No messages found for conversation", { conversationId });
        return { ok: false, reason: "no_messages" };
      }

      // DELETE OLD INDEX FIRST (as required by the plan)
      context.logger?.("Deleting old index chunks", { conversationId });
      const deleteResult = await conversationIndexer.deleteConversationChunks(conversationId);
      context.logger?.("Old chunks deleted", {
        conversationId,
        chunksDeleted: deleteResult.deleted
      });

      // Filter and process messages for indexing
      const filtered = filterMessages(messages).slice(-messageLimit);
      context.logger?.("Filtered messages", {
        conversationId,
        originalCount: messages.length,
        filteredCount: filtered.length
      });

      const entries = filtered.map(toEntry);
      context.logger?.("Converted to entries", {
        conversationId,
        entryCount: entries.length,
        totalChars: entries.reduce((sum: number, entry: string) => sum + entry.length, 0)
      });

      const chunks = chunkMessages(entries);
      context.logger?.("Created chunks", {
        conversationId,
        chunkCount: chunks.length,
        chunkSizes: chunks.map((c: string) => c.length)
      });

      if (!chunks.length) {
        context.logger?.("No chunks to index", { conversationId });
        await recordKeeper.updateIndexingStatus(conversationId, "indexed");
        return { ok: true, meta: { chunks: 0 } };
      }

      // Now index the conversation
      context.logger?.("Indexing chunks", { conversationId, chunks: chunks.length });
      const indexResult = await conversationIndexer.indexConversation(conversationId, chunks);

      context.logger?.("Conversation indexed successfully", {
        conversationId,
        ...indexResult
      });

      // Update indexing status
      await recordKeeper.updateIndexingStatus(conversationId, "indexed");

      return {
        ok: true,
        meta: {
          ...indexResult,
          chunksDeleted: deleteResult.deleted
        }
      };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      context.logger?.("Conversation indexing failed", {
        conversationId,
        error: errorMessage
      });

      // Update indexing status on failure
      try {
        const recordKeeper = new RecordKeeper(getRedis());
        await recordKeeper.updateIndexingStatus(conversationId, "failed", errorMessage);
      } catch (statusErr) {
        context.logger?.("Failed to update indexing status", {
          conversationId,
          error: String(statusErr)
        });
      }

      return {
        ok: false,
        reason: "indexing_failed",
        meta: { error: errorMessage }
      };
    }
  }
};

export { automation };
