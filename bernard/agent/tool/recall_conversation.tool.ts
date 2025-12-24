import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { getRedis } from "@/lib/infra/redis";
import { RecordKeeper } from "@/agent/recordKeeper/conversation.keeper";
import { countTokens, countTokensInText } from "@/lib/conversation/tokenCounter";
import { mapRecordsToMessages } from "@/lib/conversation/messages";
import { withTimeout } from "@/lib/infra/timeouts";
import type { Conversation, MessageRecord } from "@/lib/conversation/types";

const SEARCH_TIMEOUT_MS = Number(process.env["RECALL_SEARCH_TIMEOUT_MS"]) || 10_000;

export type RecallConversationDependencies = {
  redis: typeof getRedis;
  withTimeoutImpl: typeof withTimeout;
  logger: Pick<typeof console, "warn" | "error">;
};

const defaultDeps: RecallConversationDependencies = {
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
 * Slice messages by token count, returning the sliced MessageRecord array and metadata.
 */
function sliceMessagesByTokens(
  records: MessageRecord[],
  offsetTokens: number = 0,
  lengthTokens?: number
): { slicedRecords: MessageRecord[]; actualOffset: number; actualLength: number; totalTokens: number } {
  if (offsetTokens === 0 && !lengthTokens) {
    // No slicing needed
    const totalTokens = countTokens(mapRecordsToMessages(records, { includeTraces: false }));
    return {
      slicedRecords: records,
      actualOffset: 0,
      actualLength: totalTokens,
      totalTokens
    };
  }

  const messages = mapRecordsToMessages(records, { includeTraces: false });
  const cumulativeTokens: number[] = [];
  let totalTokens = 0;

  // Build cumulative token counts
  for (const message of messages) {
    const messageTokens = countTokens([message]);
    cumulativeTokens.push(totalTokens);
    totalTokens += messageTokens;
  }

  // Find start index (first message where cumulative tokens >= offset)
  let startIndex = 0;
  for (let i = 0; i < cumulativeTokens.length && i < records.length; i++) {
    if (cumulativeTokens[i]! >= offsetTokens) {
      startIndex = i;
      break;
    }
  }

  // Find end index
  let endIndex = records.length;
  if (lengthTokens !== undefined) {
    const targetEndTokens = offsetTokens + lengthTokens;
    for (let i = startIndex; i < cumulativeTokens.length && i < records.length; i++) {
      if (cumulativeTokens[i]! >= targetEndTokens) {
        endIndex = i;
        break;
      }
    }
  }

  const slicedRecords = records.slice(startIndex, endIndex);

  // Calculate actual offset and length in the sliced records
  const actualOffset = cumulativeTokens[startIndex] || 0;
  const slicedMessages = mapRecordsToMessages(slicedRecords, { includeTraces: false });
  const actualLength = countTokens(slicedMessages);

  return {
    slicedRecords,
    actualOffset,
    actualLength,
    totalTokens
  };
}

/**
 * Create the recall conversation handler with injectable dependencies for testing.
 */
export function createRecallConversationHandler(deps: RecallConversationDependencies) {
  return async (
    { id, offset, length }: { id: string; offset?: number; length?: number },
    _runOpts?: unknown
  ): Promise<{
    conversation: Conversation | null;
    messages: MessageRecord[];
    totalTokens?: number;
    offset?: number;
    length?: number;
    error?: string;
  }> => {
    try {
      // Validate id
      if (!id || id.trim().length === 0) {
        return {
          conversation: null,
          messages: [],
          error: "Conversation ID is required and cannot be empty"
        };
      }

      // Validate offset and length
      if (offset !== undefined && offset < 0) {
        return {
          conversation: null,
          messages: [],
          error: "Offset must be non-negative"
        };
      }

      if (length !== undefined && length < 1) {
        return {
          conversation: null,
          messages: [],
          error: "Length must be positive"
        };
      }

      // Initialize dependencies
      const redis = deps.redis();
      const recordKeeper = new RecordKeeper(redis);

      // Get conversation metadata
      const conversation = await recordKeeper.getConversation(id);
      if (!conversation) {
        return {
          conversation: null,
          messages: [],
          error: "Conversation not found"
        };
      }

      // Get all messages with timeout protection
      const messages = await deps.withTimeoutImpl(
        recordKeeper.getMessages(id),
        SEARCH_TIMEOUT_MS,
        "recall conversation messages"
      );

      if (!messages.length) {
        return {
          conversation,
          messages: [],
          totalTokens: 0,
          offset: offset || 0,
          length: length || 0
        };
      }

      // Apply token-based slicing if needed
      const { slicedRecords, actualOffset, actualLength, totalTokens } = sliceMessagesByTokens(
        messages,
        offset,
        length
      );

      return {
        conversation,
        messages: slicedRecords,
        totalTokens,
        offset: actualOffset,
        length: actualLength
      };
    } catch (err) {
      const errorMessage = formatError(err);
      deps.logger.error(`[recall_conversation] failed: ${errorMessage}`);
      return {
        conversation: null,
        messages: [],
        error: errorMessage
      };
    }
  };
}

/**
 * Build the recall conversation LangChain tool with optional dependency overrides.
 */
export function createRecallConversationTool(overrides: Partial<RecallConversationDependencies> = {}) {
  const deps: RecallConversationDependencies = { ...defaultDeps, ...overrides };
  const handler = createRecallConversationHandler(deps);

  return tool(
    handler,
    {
      name: "recall_conversation",
      description: `Recall a conversation by its ID. Optionally specify token-based offset and length to retrieve a specific portion of the conversation. Returns conversation metadata and messages.`,
      schema: z.object({
        id: z.string().min(1, "id is required").describe("Conversation ID to recall"),
        offset: z.number().min(0).optional().describe("Token offset to start from (default: 0)"),
        length: z.number().min(1).optional().describe("Number of tokens to include (default: all remaining)")
      })
    }
  );
}

export const recallConversationTool = createRecallConversationTool();
