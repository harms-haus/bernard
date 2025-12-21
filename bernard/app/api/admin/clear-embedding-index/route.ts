import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { RecordKeeper } from "@/lib/conversation/recordKeeper";
import { ConversationIndexer } from "@/lib/queue/conversationTasks";
import { createConversationQueue } from "@/lib/queue/client";
import { CONVERSATION_TASKS } from "@/lib/queue/types";
import { getRedis } from "@/lib/infra/redis";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/admin/clear-embedding-index" });
  if ("error" in auth) return auth.error;

  try {
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

    return Response.json({
      success: true,
      deletedChunks: clearResult.deleted,
      conversationsQueued: queuedCount,
      conversationsSkipped: skippedCount
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    auth.reqLog.failure(500, err, { event: "admin.clear_embedding_index.failed", error: errorMessage });
    return new Response(JSON.stringify({
      error: "Failed to clear embedding index and requeue conversations",
      details: errorMessage
    }), { status: 500 });
  }
}
