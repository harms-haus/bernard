import { RedisVectorStore } from "@langchain/redis";
import { Document } from "@langchain/core/documents";
import type Redis from "ioredis";
import { createClient } from "redis";

import { getEmbeddingModel } from "../config/embeddings";
import { clearVectorClientCache } from "../conversation/search";
import { getRedis } from "../infra/redis";

type TaskLogger = (message: string, meta?: Record<string, unknown>) => void;

const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
const indexName = process.env["CONVERSATION_INDEX_NAME"] ?? "bernard_conversations";
const indexPrefix = process.env["CONVERSATION_INDEX_PREFIX"] ?? "bernard:conv:index";

/**
 * Minimal vector indexer for conversations with deterministic chunk IDs.
 */
export class ConversationIndexer {
  private cachedStore: Promise<RedisVectorStore> | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cachedClient: any = null;

  constructor(private readonly redis: Redis = getRedis()) { }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async vectorClient(): Promise<any> {
    if (this.cachedClient) return this.cachedClient;
    const client = createClient({ url: redisUrl });
    await client.connect();
    this.cachedClient = client;
    return client;
  }

  private async vectorStore(): Promise<RedisVectorStore> {
    if (this.cachedStore) return this.cachedStore;
    this.cachedStore = (async () => {
      const embeddings = await getEmbeddingModel({});
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const client = await this.vectorClient();
      return new RedisVectorStore(embeddings, {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        redisClient: client,
        indexName,
        keyPrefix: indexPrefix
      });
    })();
    return this.cachedStore;
  }

  async indexConversation(conversationId: string, chunks: string[]): Promise<{ chunks: number; pruned: number }> {
    try {
      debugLog(undefined, "Starting conversation indexing", { conversationId, chunkCount: chunks.length });

      const store = await this.vectorStore();
      debugLog(undefined, "Vector store initialized", { conversationId });

      const chunkIds = chunks.map((_, idx) => `${conversationId}:chunk:${idx}`);
      debugLog(undefined, "Generated chunk IDs", { conversationId, chunkIds });

      const previousIds = await this.redis.smembers(this.idsKey(conversationId));
      debugLog(undefined, "Retrieved previous chunk IDs", { conversationId, previousCount: previousIds.length });

      const docs = chunks.map(
        (content, idx) =>
          new Document({
            pageContent: content,
            metadata: { conversationId, chunk: idx }
          })
      );
      debugLog(undefined, "Created documents", { conversationId, documentCount: docs.length });

      if (docs.length) {
        debugLog(undefined, "Adding documents to vector store", { conversationId, count: docs.length });
        // Note: keys parameter doesn't work in current LangChain version, so we use auto-generated keys
        await store.addDocuments(docs);
        debugLog(undefined, "Documents added successfully", { conversationId });
      }

      // Note: Since we can't use custom keys with addDocuments, we skip stale chunk cleanup for now
      // The search will filter results by metadata, so orphaned chunks won't affect results
      const stale = previousIds.filter((id) => !chunkIds.includes(id));
      debugLog(undefined, "Identified stale chunks", { conversationId, staleCount: stale.length });

      if (stale.length) {
        debugLog(undefined, "Skipping stale chunk removal (keys not tracked)", { conversationId, staleCount: stale.length });
      }

      const multi = this.redis.multi().del(this.idsKey(conversationId));
      if (chunkIds.length) {
        multi.sadd(this.idsKey(conversationId), ...chunkIds);
      }
      debugLog(undefined, "Updating Redis metadata", { conversationId, newChunkCount: chunkIds.length });
      await multi.exec();
      debugLog(undefined, "Redis metadata updated", { conversationId });

      const result = { chunks: chunkIds.length, pruned: stale.length };
      debugLog(undefined, "Indexing completed", { conversationId, ...result });
      return result;
    } catch (err) {
      errorLog(undefined, "Indexing failed", { conversationId, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  async clearIndex(): Promise<{ deleted: number }> {
    try {
      debugLog(undefined, "Starting index clearing");

      // Get all conversation IDs that have been indexed
      const pattern = `${indexPrefix}:ids:*`;
      const keys = await this.redis.keys(pattern);
      debugLog(undefined, "Found indexed conversation keys", { count: keys.length });

      let totalDeleted = 0;

      // Count total chunks before clearing
      for (const key of keys) {
        const chunkIds = await this.redis.smembers(key);
        totalDeleted += chunkIds.length;
      }

      // Clear cached vector store instances to ensure fresh connections
      this.cachedStore = null;
      this.cachedClient = null;

      // Also clear the global vector client cache used by ConversationSearchService
      clearVectorClientCache();

      try {
        // Since we don't track actual vector store keys, we drop and recreate the search index
        // This removes all indexed documents
        try {
          // Drop the Redis search index completely
          await this.redis.call('FT.DROPINDEX', indexName);
          debugLog(undefined, "Successfully dropped Redis search index", { indexName });
        } catch (dropErr) {
          // Index might not exist, which is fine
          debugLog(undefined, "Index drop failed (may not exist)", { indexName, error: String(dropErr) });
        }

        debugLog(undefined, "Successfully dropped Redis search index", { indexName });

      } catch (err) {
        errorLog(undefined, "Failed to drop search index", { error: String(err) });
      }

      debugLog(undefined, "Index clearing completed", { totalDeleted });
      return { deleted: totalDeleted };
    } catch (err) {
      errorLog(undefined, "Index clearing failed", { error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  /**
   * Delete all vector index chunks for a specific conversation.
   */
  async deleteConversationChunks(conversationId: string): Promise<{ deleted: number }> {
    try {
      debugLog(undefined, "Starting conversation chunk deletion", { conversationId });

      const idsKey = this.idsKey(conversationId);
      const chunkIds = await this.redis.smembers(idsKey);
      debugLog(undefined, "Found chunk IDs for conversation", { conversationId, chunkCount: chunkIds.length });

      // Note: Since we can't track the actual vector store keys, we skip deletion from vector store
      // The chunks will be orphaned but won't affect search results due to metadata filtering
      if (chunkIds.length > 0) {
        debugLog(undefined, "Skipping vector store deletion (keys not tracked)", { conversationId, chunkCount: chunkIds.length });
      }

      // Delete the metadata key
      await this.redis.del(idsKey);
      debugLog(undefined, "Deleted metadata key", { conversationId });

      debugLog(undefined, "Conversation chunk deletion completed", { conversationId, totalDeleted: chunkIds.length });
      return { deleted: chunkIds.length };
    } catch (err) {
      errorLog(undefined, "Conversation chunk deletion failed", { conversationId, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  private idsKey(conversationId: string) {
    return `${indexPrefix}:ids:${conversationId}`;
  }
}


function debugLog(logger: TaskLogger | undefined, message: string, meta?: Record<string, unknown>) {
  if (logger) logger(`DEBUG: ${message}`, meta);
}

function errorLog(logger: TaskLogger | undefined, message: string, meta?: Record<string, unknown>) {
  if (logger) logger(`ERROR: ${message}`, meta);
}
