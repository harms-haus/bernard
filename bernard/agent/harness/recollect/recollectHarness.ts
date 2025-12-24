import { SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { AgentOutputItem } from "../../streaming/types";
import type { RouterContext } from "../../../lib/conversation/context";
import { getEmbeddingModel } from "../../../lib/config/embeddings";
import { ConversationSearchService } from "../../../lib/conversation/search";
import type { RecordKeeper } from "../../recordKeeper/conversation.keeper";
import { getEmbeddingsForResults } from "./embeddings";
import { rerankByUniqueness, rerankByRelevance } from "./rerank";
import { getChunkMessagePositions } from "./positions";
import crypto from "node:crypto";

function uniqueId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

/**
 * Context passed to the recollection harness
 */
export type RecollectionHarnessContext = {
  conversationId: string;
  routerContext: RouterContext;
  messages: BaseMessage[];
  recordKeeper: RecordKeeper;
};

/**
 * Recollection harness that searches for similar conversation content and reranks by uniqueness.
 * Yields recollection events and optionally adds results to router context.
 */
export async function* runRecollectionHarness(context: RecollectionHarnessContext): AsyncGenerator<AgentOutputItem> {
  const { conversationId, routerContext, messages, recordKeeper } = context;

  try {
    // 1. Extract query text from user messages
    const queryText = extractQueryFromMessages(messages);
    if (!queryText || queryText.trim().length === 0) {
      console.log('[runRecollectionHarness] No query text found, skipping recollection');
      return;
    }

    console.log(`[runRecollectionHarness] Starting recollection for query: "${queryText.slice(0, 100)}${queryText.length > 100 ? '...' : ''}"`);

    // 2. Compute query embedding
    const embedder = await getEmbeddingModel({});
    const queryEmbedding = await embedder.embedQuery(queryText);
    console.log(`[runRecollectionHarness] Computed query embedding (${queryEmbedding.length} dimensions)`);

    // 3. Search for similar conversations
    const redis = recordKeeper.getRedisClient() as any; // Type compatibility for RedisClientType
    const searchService = new ConversationSearchService(redis, recordKeeper);

    const searchResults = await searchService.searchSimilar(queryText, 50); // Get up to 50 results
    console.log(`[runRecollectionHarness] Found ${searchResults.results.length} similar conversation chunks`);

    if (searchResults.results.length === 0) {
      console.log('[runRecollectionHarness] No similar content found, skipping recollection');
      return;
    }

    // 4. Get embeddings for search results
    const indexPrefix = "bernard:conv:index"; // From search.ts
    const resultEmbeddings = await getEmbeddingsForResults(redis, searchResults.results, indexPrefix);

    if (resultEmbeddings.size === 0) {
      console.warn('[runRecollectionHarness] Failed to get embeddings for results, skipping reranking');
      return;
    }

    // 5. Rerank by uniqueness using MMR
    const rerankedResults = rerankByUniqueness(queryEmbedding, resultEmbeddings, searchResults.results, 0.7);

    // 6. Take top 10 most unique results
    const topResults = rerankedResults.slice(0, 10);
    console.log(`[runRecollectionHarness] Selected top ${topResults.length} most unique results`);

    // 7. Resort the top results by relevance to the user's message
    const relevanceRerankedResults = rerankByRelevance(queryEmbedding, resultEmbeddings, topResults);
    console.log(`[runRecollectionHarness] Reranked top ${relevanceRerankedResults.length} results by relevance to query`);

    // 8. Process each result and yield recollection events
    for (const result of relevanceRerankedResults) {
      try {
        // Check if the conversation still exists - skip if it was deleted
        const conversationExists = await recordKeeper.getConversation(result.conversationId);
        if (!conversationExists) {
          console.log(`[runRecollectionHarness] Skipping recollection for deleted conversation ${result.conversationId}`);
          continue;
        }

        // Get message position mapping
        const positions = await getChunkMessagePositions(recordKeeper.asArchivist(), result.conversationId, result.chunkIndex);

        // Get conversation metadata including message count
        let conversationMetadata: { summary?: string; tags?: string[]; startedAt?: string; messageCount?: number } | undefined;
        if (result.conversation) {
          conversationMetadata = {
            ...(result.conversation.summary ? { summary: result.conversation.summary } : {}),
            ...(result.conversation.tags ? { tags: result.conversation.tags } : {}),
            ...(result.conversation.startedAt ? { startedAt: result.conversation.startedAt } : {}),
            messageCount: 0
          } as { summary?: string; tags?: string[]; startedAt?: string; messageCount?: number };
        }

        // Try to get actual message count from conversation
        try {
          const fullConversation = await recordKeeper.asArchivist().getConversation(result.conversationId);
          if (fullConversation?.messageCount) {
            conversationMetadata = {
              ...conversationMetadata,
              messageCount: fullConversation.messageCount
            };
          }
        } catch (err) {
          // Ignore metadata fetch errors
        }

        // Create recollection event
        const recollectionId = uniqueId("recollection");
        const recollectionEvent: AgentOutputItem = {
          type: "recollection",
          recollectionId,
          conversationId: result.conversationId,
          chunkIndex: result.chunkIndex,
          content: result.content,
          score: result.score,
          conversationMetadata,
          messageStartIndex: positions.startIndex,
          messageEndIndex: positions.endIndex
        } as AgentOutputItem;

        // Yield the recollection event
        yield recollectionEvent;

        console.log(`[runRecollectionHarness] Yielded recollection for conversation ${result.conversationId} chunk ${result.chunkIndex} (messages ${positions.startIndex}-${positions.endIndex})`);

      } catch (err) {
        console.warn(`[runRecollectionHarness] Failed to process result for ${result.conversationId}:${result.chunkIndex}:`, err);
        // Continue with next result
      }
    }

    console.log(`[runRecollectionHarness] Completed recollection harness with ${relevanceRerankedResults.length} results`);

  } catch (err) {
    console.error('[runRecollectionHarness] Failed to run recollection harness:', err);
    yield {
      type: "error",
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

/**
 * Extract query text from incoming messages.
 * Focuses on the most recent user message.
 */
function extractQueryFromMessages(messages: BaseMessage[]): string {
  // Find the last user message
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue;
    const messageType = (message as any).type || (message as any)._type || (message as any)._getType?.() || 'unknown';

    if (messageType === 'human' || messageType === 'user') {
      return typeof message.content === 'string' ? message.content : '';
    }
  }

  // Fallback: concatenate all user messages
  const userMessages = messages.filter(msg => {
    const messageType = (msg as any).type || (msg as any)._type || (msg as any)._getType?.() || 'unknown';
    return messageType === 'human' || messageType === 'user';
  });

  return userMessages
    .map(msg => typeof msg.content === 'string' ? msg.content : '')
    .join(' ')
    .trim();
}
