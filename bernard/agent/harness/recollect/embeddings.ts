import type { RedisClientType } from "redis";
import { getEmbeddingModel } from "../../../lib/config/embeddings";
import type { SearchResult } from "../../../lib/conversation/search";

/**
 * Compute embeddings for search results in batches.
 * This is the primary method since RedisVectorStore embeddings are not directly accessible.
 */
export async function computeEmbeddingsForResults(
  results: SearchResult[]
): Promise<Map<string, number[]>> {
  const embeddings = new Map<string, number[]>();

  try {
    const embedder = await getEmbeddingModel({});

    // Process in batches to avoid overwhelming the embedding service
    const batchSize = 10;
    for (let i = 0; i < results.length; i += batchSize) {
      const batch = results.slice(i, i + batchSize);
      const texts = batch.map(result => result.content);

      try {
        const vectors = await embedder.embedDocuments(texts);

        batch.forEach((result, idx) => {
          const documentKey = `${result.conversationId}:chunk:${result.chunkIndex}`;
          const vector = vectors[idx];
          if (vector) {
            embeddings.set(documentKey, vector);
          }
        });
      } catch (err) {
        console.warn(`[computeEmbeddingsForResults] Failed to compute embeddings for batch ${Math.floor(i/batchSize) + 1}:`, err);
        // Continue with next batch
      }
    }

    console.log(`[computeEmbeddingsForResults] Computed ${embeddings.size}/${results.length} embeddings`);

  } catch (err) {
    console.error('[computeEmbeddingsForResults] Failed to compute embeddings:', err);
  }

  return embeddings;
}

/**
 * Legacy function - RedisVectorStore embeddings are not directly accessible.
 * This function now just calls computeEmbeddingsForResults.
 */
export async function getStoredEmbeddings(
  redisClient: RedisClientType,
  results: SearchResult[],
  indexPrefix: string
): Promise<Map<string, number[]>> {
  console.log(`[getStoredEmbeddings] RedisVectorStore embeddings are not directly accessible, computing embeddings instead`);
  return computeEmbeddingsForResults(results);
}

/**
 * Get embeddings for search results via batch computation.
 * Note: RedisVectorStore does not expose stored embeddings directly.
 */
export async function getEmbeddingsForResults(
  redisClient: RedisClientType,
  results: SearchResult[],
  indexPrefix: string
): Promise<Map<string, number[]>> {
  return computeEmbeddingsForResults(results);
}
