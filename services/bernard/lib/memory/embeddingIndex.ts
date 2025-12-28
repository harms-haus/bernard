import { RecordKeeper } from "@/agent/recordKeeper/conversation.keeper";
import { raiseEvent } from "@/lib/automation/hookService";
import { getRedis } from "@/lib/infra/redis";
import { logger } from "@/lib/logging";

export interface ClearEntireIndexResult {
  success: boolean;
  conversationsQueued: number;
  keysDeleted: number;
}

export async function clearEntireIndex(): Promise<ClearEntireIndexResult> {
  const redis = getRedis();
  const indexName = process.env["CONVERSATION_INDEX_NAME"] ?? "bernard_conversations";
  const indexPrefix = process.env["CONVERSATION_INDEX_PREFIX"] ?? "bernard:conv:index";

  let conversationsQueued = 0;

  try {
    logger.info({ event: 'index.clear.start', indexName, indexPrefix }, 'Starting clear entire index operation');

    // 1. Drop the Redis search index completely
    try {
      await redis.call('FT.DROPINDEX', indexName);
      logger.info({ event: 'index.drop.success', indexName }, 'Dropped Redis search index');
    } catch (error) {
      // Index might not exist, that's okay
      logger.warn({ event: 'index.drop.skip', indexName, error: error instanceof Error ? error.message : String(error) }, 'Failed to drop index (may not exist)');
    }

    // 2. Delete all conversation chunks and metadata from Redis
    // Get all keys that match the index prefix patterns
    const metadataPattern = `${indexPrefix}:*`;
    const chunkPattern = `${indexPrefix}[0-9]*`; // For keys like bernard:conv:index0, index1, etc.

    const [metadataKeys, chunkKeys] = await Promise.all([
      redis.keys(metadataPattern),
      redis.keys(chunkPattern)
    ]);

    const allKeys = [...metadataKeys, ...chunkKeys];
    logger.info({
      event: 'index.keys.found',
      metadataKeys: metadataKeys.length,
      chunkKeys: chunkKeys.length,
      total: allKeys.length
    }, 'Found keys to delete');

    if (allKeys.length > 0) {
      // Delete all keys in batches to avoid blocking Redis
      const batchSize = 1000;
      for (let i = 0; i < allKeys.length; i += batchSize) {
        const batch = allKeys.slice(i, i + batchSize);
        await redis.del(batch);
      }
      logger.info({ event: 'index.delete.success', deletedKeys: allKeys.length }, 'Deleted conversation chunks from Redis');
    }

    // 3. Trigger index automation for all existing conversations
    const recordKeeper = new RecordKeeper(redis);

    // Get all conversations
    const conversations = await recordKeeper.listConversations({
      includeOpen: true,
      includeClosed: true,
      limit: 10000 // Get a large number to cover all conversations
    });

    logger.info({ event: 'index.reindex.start', count: conversations.length }, 'Found conversations to re-index');

    // Trigger conversation_archived event for each conversation to run index automation
    for (const conversation of conversations) {
      try {
        await raiseEvent("conversation_archived", {
          conversationId: conversation.id,
          userId: conversation.tokenSet?.[0] ?? "",
          conversationContent: conversation
        });
        conversationsQueued++;
      } catch (error) {
        logger.error({
          event: 'index.reindex.error',
          conversationId: conversation.id,
          error: error instanceof Error ? error.message : String(error)
        }, 'Failed to trigger index automation for conversation');
      }
    }

    logger.info({
      event: 'index.clear.complete',
      conversationsQueued,
      deletedKeys: allKeys.length
    }, 'Clear entire index operation completed successfully');

    return {
      success: true,
      conversationsQueued,
      keysDeleted: allKeys.length
    };

  } catch (error) {
    logger.error({
      event: 'index.clear.error',
      error: error instanceof Error ? error.message : String(error),
      conversationsQueued
    }, 'Failed to clear entire index');

    return {
      success: false,
      conversationsQueued,
      keysDeleted: 0
    };
  }
}
