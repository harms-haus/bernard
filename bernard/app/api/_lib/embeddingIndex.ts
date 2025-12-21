import { RecordKeeper } from "@/lib/conversation/recordKeeper";
import { ConversationIndexer } from "@/lib/queue/conversationTasks";
import { createConversationQueue } from "@/lib/queue/client";
import { CONVERSATION_TASKS } from "@/lib/queue/types";
import { getRedis } from "@/lib/infra/redis";

export interface ClearEmbeddingIndexResult {
  success: boolean;
  deletedChunks: number;
  conversationsQueued: number;
  conversationsSkipped: number;
}

export interface AuthContext {
  reqLog: {
    log: {
      info: (data: any) => void;
      warn: (data: any) => void;
      error: (data: any) => void;
      debug: (data: any) => void;
    };
    success: (status: number, data: any) => void;
    failure: (status: number, error: any, data: any) => void;
  };
  admin: {
    user: {
      id: string;
    };
  };
}

export async function clearEmbeddingIndex(auth: AuthContext): Promise<ClearEmbeddingIndexResult> {
  const redis = getRedis();
  const recordKeeper = new RecordKeeper(redis);
  const indexer = new ConversationIndexer(redis);
  const queue = createConversationQueue();

  auth.reqLog.log.info({ event: "admin.clear_embedding_index.start", adminId: auth.admin.user.id });

  // Clear the entire embedding index
  auth.reqLog.log.info({ event: "admin.clear_embedding_index.clearing" });
  const clearResult = await indexer.clearIndex();
  auth.reqLog.log.info({ event: "admin.clear_embedding_index.cleared", deletedChunks: clearResult.deleted });

  // Get all conversations that need re-indexing
  const conversations = await recordKeeper.listConversations({ includeClosed: true });
  auth.reqLog.log.info({ event: "admin.clear_embedding_index.retrieved_conversations", conversationCount: conversations.length });

  let queuedCount = 0;
  let skippedCount = 0;

  // Requeue each conversation for indexing
  for (const conversation of conversations) {
    try {
      // Reset indexing status to "none" so it can be re-indexed
      await recordKeeper.updateIndexingStatus(conversation.id, "none");

      // Add indexing job to queue
      await queue.add(CONVERSATION_TASKS.index, { conversationId: conversation.id });

      queuedCount++;
      auth.reqLog.log.debug({ event: "admin.clear_embedding_index.queued", conversationId: conversation.id });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      auth.reqLog.log.warn({ event: "admin.clear_embedding_index.queue_failed", conversationId: conversation.id, error: errorMessage });
      skippedCount++;
    }
  }

  auth.reqLog.success(200, {
    event: "admin.clear_embedding_index.completed",
    deletedChunks: clearResult.deleted,
    conversationsQueued: queuedCount,
    conversationsSkipped: skippedCount
  });

  return {
    success: true,
    deletedChunks: clearResult.deleted,
    conversationsQueued: queuedCount,
    conversationsSkipped: skippedCount
  };
}
