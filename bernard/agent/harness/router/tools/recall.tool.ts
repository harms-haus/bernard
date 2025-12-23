import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { getRedis } from "@/lib/infra/redis";
import { RecordKeeper } from "@/lib/conversation/recordKeeper";
import { ConversationSearchService, type SearchResults } from "@/lib/conversation/search";
import { withTimeout } from "@/lib/infra/timeouts";

const SEARCH_TIMEOUT_MS = Number(process.env["RECALL_SEARCH_TIMEOUT_MS"]) || 10_000;

export type RecallDependencies = {
  redis: typeof getRedis;
  withTimeoutImpl: typeof withTimeout;
  logger: Pick<typeof console, "warn" | "error">;
};

const defaultDeps: RecallDependencies = {
  redis: getRedis,
  withTimeoutImpl: withTimeout,
  logger: console
};

/**
 * Format unknown errors into human-readable strings.
 */
export function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Build the user-facing search response.
 */
export function buildSearchResponse(results: SearchResults) {
  return {
    results: results.results.map((r) => ({
      conversationId: r.conversationId,
      chunkIndex: r.chunkIndex,
      content: r.content,
      score: r.score,
      conversation: r.conversation
    })),
    total: results.total,
    offset: results.offset,
    limit: results.limit
  };
}

/**
 * Create the recall tool handler with injectable dependencies for testing.
 */
export function createRecallHandler(deps: RecallDependencies) {
  return async (
    { query, n_results, results_offset }: { query: string; n_results?: number; results_offset?: number },
    _runOpts?: unknown
  ) => {
    try {
      // Validate query
      if (!query || query.trim().length === 0) {
        return {
          error: "Query is required and cannot be empty",
          results: [],
          total: 0,
          offset: results_offset ?? 0,
          limit: n_results ?? 5
        };
      }

      // Initialize dependencies
      const redis = deps.redis();
      const recordKeeper = new RecordKeeper(redis);
      const searchService = new ConversationSearchService(redis, recordKeeper);

      // Perform search with timeout protection
      const searchResults = await deps.withTimeoutImpl(
        searchService.searchSimilar(
          query,
          n_results ?? 5,
          results_offset ?? 0
        ),
        SEARCH_TIMEOUT_MS,
        "recall search"
      );

      return buildSearchResponse(searchResults);
    } catch (err) {
      const errorMessage = formatError(err);
      deps.logger.error(`[recall] search failed: ${errorMessage}`);
      return {
        error: errorMessage,
        results: [],
        total: 0,
        offset: results_offset ?? 0,
        limit: n_results ?? 5
      };
    }
  };
}

/**
 * Build the recall LangChain tool with optional dependency overrides.
 */
export function createRecallTool(overrides: Partial<RecallDependencies> = {}) {
  const deps: RecallDependencies = { ...defaultDeps, ...overrides };
  const handler = createRecallHandler(deps);

  return tool(
    handler,
    {
      name: "recall",
      description: `Search for semantically similar historical conversation chunks using vector similarity search.
Use this tool when you need to find information from past conversations that might be relevant to the current context.
Returns conversation chunks with similarity scores (lower is better) and optional conversation metadata like summaries and tags.`,
      schema: z.object({
        query: z.string().min(1, "query is required").describe("Search query for semantic similarity"),
        n_results: z.number().min(1).max(50).optional().default(5).describe("Number of results to return (default: 5, max: 50)"),
        results_offset: z.number().min(0).optional().default(0).describe("Offset for pagination (default: 0)")
      })
    }
  );
}

export const recallTool = createRecallTool();