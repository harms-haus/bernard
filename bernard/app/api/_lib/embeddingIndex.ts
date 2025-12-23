import { RedisVectorStore } from "@langchain/redis";
import { RecordKeeper } from "@/lib/conversation/recordKeeper";
import { ConversationIndexer } from "@/lib/indexing/indexer";
import { raiseEvent } from "@/lib/automation/hookService";
import { getRedis } from "@/lib/infra/redis";
import { getEmbeddingModel } from "@/lib/config/embeddings";
import { createClient } from "redis";

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
    console.log('Starting clear entire index operation', { indexName, indexPrefix });

    // 1. Drop the Redis search index completely
    try {
      await redis.call('FT.DROPINDEX', indexName);
      console.log('Dropped Redis search index', { indexName });
    } catch (error) {
      // Index might not exist, that's okay
      console.warn('Failed to drop index (may not exist)', { indexName, error: error instanceof Error ? error.message : String(error) });
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
    console.log('Found keys to delete', {
      metadataKeys: metadataKeys.length,
      chunkKeys: chunkKeys.length,
      total: allKeys.length
    });

    if (allKeys.length > 0) {
      // Delete all keys in batches to avoid blocking Redis
      const batchSize = 1000;
      for (let i = 0; i < allKeys.length; i += batchSize) {
        const batch = allKeys.slice(i, i + batchSize);
        await redis.del(batch);
      }
      console.log('Deleted conversation chunks from Redis', { deletedKeys: allKeys.length });
    }

    // 3. Trigger index automation for all existing conversations
    const recordKeeper = new RecordKeeper(redis);

    // Get all conversations
    const conversations = await recordKeeper.listConversations({
      includeOpen: true,
      includeClosed: true,
      limit: 10000 // Get a large number to cover all conversations
    });

    console.log('Found conversations to re-index', { count: conversations.length });

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
        console.error('Failed to trigger index automation for conversation', {
          conversationId: conversation.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    console.log('Clear entire index operation completed successfully', {
      conversationsQueued,
      deletedKeys: allKeys.length
    });

    return {
      success: true,
      conversationsQueued,
      keysDeleted: allKeys.length
    };

  } catch (error) {
    console.error('Failed to clear entire index', {
      error: error instanceof Error ? error.message : String(error),
      conversationsQueued
    });

    return {
      success: false,
      conversationsQueued,
      keysDeleted: 0
    };
  }
}
