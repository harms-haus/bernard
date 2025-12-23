import type { SearchResult } from "../../../lib/conversation/search";

/**
 * Calculate cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += (a[i] || 0) * (b[i] || 0);
    normA += (a[i] || 0) * (a[i] || 0);
    normB += (b[i] || 0) * (b[i] || 0);
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0; // Handle zero vectors
  }

  return dotProduct / (normA * normB);
}

/**
 * Calculate similarity between all pairs of embeddings.
 */
export function calculateSimilarityMatrix(
  embeddings: Map<string, number[]>
): Map<string, Map<string, number>> {
  const similarityMatrix = new Map<string, Map<string, number>>();
  const keys = Array.from(embeddings.keys());

  for (let i = 0; i < keys.length; i++) {
    const keyA = keys[i]!;
    const embeddingA = embeddings.get(keyA);
    if (!embeddingA) continue;

    const similarityRow = new Map<string, number>();
    similarityMatrix.set(keyA, similarityRow);

    for (let j = 0; j < keys.length; j++) {
      const keyB = keys[j]!;
      const embeddingB = embeddings.get(keyB);
      if (!embeddingB) continue;

      const similarity = cosineSimilarity(embeddingA, embeddingB);
      similarityRow.set(keyB, similarity);
    }
  }

  return similarityMatrix;
}

/**
 * Rerank search results using Maximal Marginal Relevance (MMR) algorithm.
 *
 * MMR balances relevance and diversity:
 * - Relevance: How similar each result is to the query
 * - Diversity: How different each result is from already-selected results
 * - Formula: score = λ * sim(query, doc) - (1-λ) * max(sim(doc, selected))
 *
 * @param queryEmbedding - The embedding of the user's query
 * @param resultEmbeddings - Map of document keys to their embeddings
 * @param results - Original search results with scores
 * @param lambda - Balance between relevance (high) and diversity (low), default 0.7
 * @returns Reranked results sorted by MMR score
 */
export function rerankByUniqueness(
  queryEmbedding: number[],
  resultEmbeddings: Map<string, number[]>,
  results: SearchResult[],
  lambda: number = 0.7
): SearchResult[] {
  if (results.length === 0) {
    return [];
  }

  if (resultEmbeddings.size === 0) {
    console.warn('[rerankByUniqueness] No embeddings provided, returning original order');
    return results;
  }

  try {
    // Create document key to result mapping
    const keyToResult = new Map<string, SearchResult>();
    for (const result of results) {
      const conversationId = result.conversationId || 'unknown';
      const chunkIndex = result.chunkIndex || 0;
      const key = `${conversationId}:chunk:${chunkIndex}`;
      keyToResult.set(key, result);
    }

    // Calculate query similarities for relevance scores
    const querySimilarities = new Map<string, number>();
    for (const [key, embedding] of resultEmbeddings) {
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      querySimilarities.set(key, similarity);
    }

    // Calculate similarity matrix for diversity calculation
    const similarityMatrix = calculateSimilarityMatrix(resultEmbeddings);

    // MMR reranking
    const selected = new Set<string>();
    const reranked: SearchResult[] = [];
    const remaining = new Set(keyToResult.keys());

    while (remaining.size > 0) {
      let bestKey: string | null = null;
      let bestScore = -Infinity;

      for (const candidateKey of remaining) {
        // Relevance score: similarity to query
        const relevanceScore = querySimilarities.get(candidateKey) || 0;

        // Diversity score: maximum similarity to already selected documents
        let diversityScore = 0;
        if (selected.size > 0) {
          for (const selectedKey of selected) {
            const similarity = similarityMatrix.get(candidateKey)?.get(selectedKey) || 0;
            diversityScore = Math.max(diversityScore, similarity);
          }
        }

        // MMR score: balance relevance vs diversity
        const mmrScore = lambda * relevanceScore - (1 - lambda) * diversityScore;

        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestKey = candidateKey;
        }
      }

      if (bestKey === null) {
        // Fallback: just take the first remaining
        bestKey = remaining.values().next().value!;
      }

      selected.add(bestKey);
      remaining.delete(bestKey);

      const result = keyToResult.get(bestKey);
      if (result) {
        reranked.push(result);
      }
    }

    console.log(`[rerankByUniqueness] Reranked ${reranked.length} results using MMR (λ=${lambda})`);
    return reranked;

  } catch (err) {
    console.error('[rerankByUniqueness] Failed to rerank results:', err);
    console.log('[rerankByUniqueness] Returning original results');
    return results;
  }
}

/**
 * Rerank search results by relevance to the query.
 * Sorts results by cosine similarity to the query embedding (highest similarity first).
 *
 * @param queryEmbedding - The embedding of the user's query
 * @param resultEmbeddings - Map of document keys to their embeddings
 * @param results - Search results to rerank
 * @returns Results sorted by relevance to query (highest similarity first)
 */
export function rerankByRelevance(
  queryEmbedding: number[],
  resultEmbeddings: Map<string, number[]>,
  results: SearchResult[]
): SearchResult[] {
  if (results.length === 0) {
    return [];
  }

  if (resultEmbeddings.size === 0) {
    console.warn('[rerankByRelevance] No embeddings provided, returning original order');
    return results;
  }

  try {
    // Create document key to result mapping
    const keyToResult = new Map<string, SearchResult>();
    for (const result of results) {
      const conversationId = result.conversationId || 'unknown';
      const chunkIndex = result.chunkIndex || 0;
      const key = `${conversationId}:chunk:${chunkIndex}`;
      keyToResult.set(key, result);
    }

    // Calculate relevance scores (cosine similarity to query)
    const relevanceScores = new Map<string, number>();
    for (const [key, embedding] of resultEmbeddings) {
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      relevanceScores.set(key, similarity);
    }

    // Sort results by relevance score (highest first)
    const sortedResults = results
      .map(result => {
        const conversationId = result.conversationId || 'unknown';
        const chunkIndex = result.chunkIndex || 0;
        const key = `${conversationId}:chunk:${chunkIndex}`;
        const relevanceScore = relevanceScores.get(key) || 0;
        return { result, relevanceScore };
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore) // Higher similarity first
      .map(item => item.result);

    console.log(`[rerankByRelevance] Reranked ${sortedResults.length} results by relevance to query`);
    return sortedResults;

  } catch (err) {
    console.error('[rerankByRelevance] Failed to rerank results by relevance:', err);
    console.log('[rerankByRelevance] Returning original results');
    return results;
  }
}

/**
 * Rerank search results by uniqueness score only (simpler approach).
 * Uses similarity to already selected results as the ranking criterion.
 */
export function rerankBySimilarityDiversity(
  resultEmbeddings: Map<string, number[]>,
  results: SearchResult[]
): SearchResult[] {
  if (results.length === 0) {
    return [];
  }

  if (resultEmbeddings.size === 0) {
    console.warn('[rerankBySimilarityDiversity] No embeddings provided, returning original order');
    return results;
  }

  try {
    // Create document key to result mapping
    const keyToResult = new Map<string, SearchResult>();
    for (const result of results) {
      const key = `${result.conversationId}:chunk:${result.chunkIndex}`;
      keyToResult.set(key, result);
    }

    // Calculate similarity matrix
    const similarityMatrix = calculateSimilarityMatrix(resultEmbeddings);

    // Simple diversity-based reranking
    const selected = new Set<string>();
    const reranked: SearchResult[] = [];
    const remaining = new Set(keyToResult.keys());

    while (remaining.size > 0) {
      let bestKey: string | null = null;
      let bestScore = -Infinity; // Lower similarity = more diverse = better

      for (const candidateKey of remaining) {
        // Calculate average similarity to already selected documents
        let avgSimilarity = 0;
        if (selected.size > 0) {
          let totalSimilarity = 0;
          for (const selectedKey of selected) {
            const similarity = similarityMatrix.get(candidateKey)?.get(selectedKey) || 0;
            totalSimilarity += similarity;
          }
          avgSimilarity = totalSimilarity / selected.size;
        }

        // Lower similarity score is better (more diverse)
        const diversityScore = -avgSimilarity;

        if (diversityScore > bestScore) {
          bestScore = diversityScore;
          bestKey = candidateKey;
        }
      }

      if (bestKey === null) {
        // Fallback: just take the first remaining
        bestKey = remaining.values().next().value!;
      }

      selected.add(bestKey);
      remaining.delete(bestKey);

      const result = keyToResult.get(bestKey);
      if (result) {
        reranked.push(result);
      }
    }

    console.log(`[rerankBySimilarityDiversity] Reranked ${reranked.length} results by diversity`);
    return reranked;

  } catch (err) {
    console.error('[rerankBySimilarityDiversity] Failed to rerank results:', err);
    console.log('[rerankBySimilarityDiversity] Returning original results');
    return results;
  }
}
