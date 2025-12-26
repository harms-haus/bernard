import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import type { AgentOutputItem } from "../../streaming/types";
import { getEmbeddingModel } from "../../../lib/config/embeddings";
import { ConversationSearchService } from "../../../lib/conversation/search";
import type { RecordKeeper } from "../../recordKeeper/conversation.keeper";
import { getEmbeddingsForResults } from "./embeddings";
import { rerankByUniqueness, rerankByRelevance } from "./rerank";
import { getChunkMessagePositions } from "./positions";
import crypto from "node:crypto";
import type { RouterContext } from "@/lib/conversation/context";
import type { RedisClientType } from "redis";

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
  const { messages, recordKeeper } = context;

  try {
    // 1. Extract query text from user messages
    const queryText = extractQueryFromMessages(messages);
    if (!queryText || queryText.trim().length === 0) {
      return;
    }

    // 2. Compute query embedding
    const embedder = await getEmbeddingModel({});
    const queryEmbedding = await embedder.embedQuery(queryText);

    // 3. Search for similar conversations
    const redis = recordKeeper.getRedisClient();
    const searchService = new ConversationSearchService(redis, recordKeeper);

    const searchResults = await searchService.searchSimilar(queryText, 50); // Get up to 50 results

    if (searchResults.results.length === 0) {
      return;
    }

    // 4. Get embeddings for search results
    const indexPrefix = "bernard:conv:index"; // From search.ts
    const resultEmbeddings = await getEmbeddingsForResults(redis as unknown as RedisClientType, searchResults.results, indexPrefix);

    if (resultEmbeddings.size === 0) {
      return;
    }

    // 5. Rerank by uniqueness using MMR
    const rerankedResults = rerankByUniqueness(queryEmbedding, resultEmbeddings, searchResults.results, 0.7);

    // 6. Take top 10 most unique results
    const topResults = rerankedResults.slice(0, 10);

    // 7. Resort the top results by relevance to the user's message
    const relevanceRerankedResults = rerankByRelevance(queryEmbedding, resultEmbeddings, topResults);

    // 8. Process each result and yield recollection events
    for (const result of relevanceRerankedResults) {
      try {
        // Check if the conversation still exists - skip if it was deleted
        const conversationExists = await recordKeeper.getConversation(result.conversationId);
        if (!conversationExists) {
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
        } catch {
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

      } catch (err) {
        console.warn(`[runRecollectionHarness] Failed to process result for ${result.conversationId}:${result.chunkIndex}:`, err);
        // Continue with next result
      }
    }

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

    if (message instanceof HumanMessage) {
      return typeof message.content === 'string' ? message.content : '';
    }
  }

  // Fallback: concatenate all user messages
  const userMessages = messages.filter(msg => msg instanceof HumanMessage);

  return userMessages
    .map(msg => typeof msg.content === 'string' ? msg.content : '')
    .join(' ')
    .trim();
}
