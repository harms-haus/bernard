import { RedisVectorStore } from "@langchain/redis";
import type { Document } from "@langchain/core/documents";
import type Redis from "ioredis";
import { createClient } from "redis";
import type { RedisClientType } from "redis";

import { getEmbeddingModel } from "../config/embeddings";
import type { RecordKeeper } from "./recordKeeper";
import type { Conversation } from "./types";

const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
const indexName = process.env["CONVERSATION_INDEX_NAME"] ?? "bernard_conversations";
const indexPrefix = process.env["CONVERSATION_INDEX_PREFIX"] ?? "bernard:conv:index";
const SEARCH_TIMEOUT_MS = Number(process.env["RECALL_SEARCH_TIMEOUT_MS"]) || 10_000;

// Module-level singleton for vector Redis client to prevent connection leaks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let globalVectorClient: any = null;

export type SearchResult = {
  conversationId: string;
  chunkIndex: number;
  content: string;
  score: number;
  conversation?: {
    summary?: string;
    tags?: string[];
    startedAt?: string;
  };
};

export type SearchResults = {
  results: SearchResult[];
  total: number;
  offset: number;
  limit: number;
};

/**
 * Service for searching indexed conversation chunks using semantic similarity.
 */
export class ConversationSearchService {
  private cachedStore: Promise<RedisVectorStore> | null = null;

  constructor(
    private readonly redis: Redis,
    private readonly recordKeeper: RecordKeeper
  ) {}

  private async vectorClient(): Promise<RedisClientType> {
    if (globalVectorClient) return globalVectorClient as RedisClientType;
    const client = createClient({ url: redisUrl });
    await client.connect();
    // @ts-ignore: Redis client type complexity
    globalVectorClient = client;
    return client as RedisClientType;
  }

  private async vectorStore(): Promise<RedisVectorStore> {
    if (this.cachedStore) return this.cachedStore;
    this.cachedStore = (async () => {
      try {
        const embeddings = await getEmbeddingModel({});
        const client = await this.vectorClient();
        return new RedisVectorStore(embeddings, {
          redisClient: client,
          indexName,
          keyPrefix: indexPrefix
        });
      } catch (err) {
        // Clear cache on error to allow retry
        this.cachedStore = null;
        throw err;
      }
    })();
    return this.cachedStore;
  }

  /**
   * Search for semantically similar conversation chunks.
   * 
   * @param query - Search query for semantic similarity
   * @param nResults - Number of results to return (default: 5)
   * @param resultsOffset - Offset for pagination (default: 0)
   * @returns Search results with conversation metadata
   */
  async searchSimilar(
    query: string,
    nResults: number = 5,
    resultsOffset: number = 0
  ): Promise<SearchResults> {
    try {
      // Validate and clamp parameters
      const limit = Math.max(1, Math.min(nResults, 50)); // Max 50 results
      const offset = Math.max(0, resultsOffset);

      // Fetch more results than needed to support pagination
      const fetchCount = offset + limit;
      const store = await this.vectorStore();

      // Perform similarity search with scores
      const docsWithScores = await Promise.race([
        store.similaritySearchWithScore(query, fetchCount),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Search timeout")), SEARCH_TIMEOUT_MS)
        )
      ]) as [Document, number][];

      // Separate docs and scores using destructuring
      const docs = docsWithScores.map(([doc]) => doc);
      const scores = docsWithScores.map(([, score]) => score);

      // Slice results for pagination
      const paginatedDocs = docs.slice(offset, offset + limit);
      const paginatedScores = scores.slice(offset, offset + limit);

      // Build search results
      const results: SearchResult[] = [];
      const conversationIds = new Set<string>();

      for (let i = 0; i < paginatedDocs.length; i++) {
        const doc = paginatedDocs[i];
        const score = paginatedScores[i];

        if (!doc || typeof score !== "number") {
          continue;
        }

        const metadata = doc.metadata as { conversationId?: string; chunk?: number };

        if (!metadata.conversationId || typeof metadata.chunk !== "number") {
          continue;
        }

        conversationIds.add(metadata.conversationId);
        results.push({
          conversationId: metadata.conversationId,
          chunkIndex: metadata.chunk,
          content: doc.pageContent,
          score
        });
      }

      // Enrich with conversation metadata
      if (conversationIds.size > 0) {
        await this.enrichWithConversationMetadata(results, Array.from(conversationIds));
      }

      return {
        results,
        total: docs.length, // Approximate total
        offset,
        limit
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[ConversationSearchService] Search failed: ${errorMessage}`);
      // Return empty results on error
      return {
        results: [],
        total: 0,
        offset: resultsOffset,
        limit: nResults
      };
    }
  }

  /**
   * Enrich search results with conversation metadata from RecordKeeper.
   */
  private async enrichWithConversationMetadata(
    results: SearchResult[],
    conversationIds: string[]
  ): Promise<void> {
    try {
      const conversations = await Promise.all(
        conversationIds.map((id) => this.recordKeeper.getConversation(id))
      );

      const conversationMap = new Map<string, Conversation>();
      for (const conv of conversations) {
        if (conv) {
          conversationMap.set(conv.id, conv);
        }
      }

      for (const result of results) {
        const conv = conversationMap.get(result.conversationId);
        if (conv) {
          result.conversation = {
            ...(conv.summary && { summary: conv.summary }),
            ...(conv.tags && { tags: conv.tags }),
            startedAt: conv.startedAt
          };
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[ConversationSearchService] Failed to enrich metadata: ${errorMessage}`);
      // Continue without enrichment
    }
  }

  /**
   * Cleanup resources and close connections.
   * This method is idempotent and safe to call multiple times.
   */
  async dispose(): Promise<void> {
    try {
      if (globalVectorClient) {
        await globalVectorClient.disconnect();
        globalVectorClient = null;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn(`[ConversationSearchService] Error during cleanup: ${errorMessage}`);
      // Continue cleanup even if disconnect fails
      globalVectorClient = null;
    }
  }
}

/**
 * Module-level cleanup function for vector Redis client.
 * Call this during application shutdown to prevent connection leaks.
 * This function is idempotent and safe to call multiple times.
 */
export async function cleanupVectorClient(): Promise<void> {
  try {
    if (globalVectorClient) {
      await globalVectorClient.disconnect();
      globalVectorClient = null;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.warn(`[ConversationSearchService] Error during module cleanup: ${errorMessage}`);
    // Continue cleanup even if disconnect fails
    globalVectorClient = null;
  }
}