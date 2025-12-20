import { RedisVectorStore } from "@langchain/redis";
import { Document } from "@langchain/core/documents";
import type { Job } from "bullmq";
import type Redis from "ioredis";
import { createClient, type RedisClientType } from "redis";

import { getEmbeddingModel } from "../config/embeddings";
import { RecordKeeper } from "../conversation/recordKeeper";
import { ConversationSummaryService } from "../conversation/summary";
import type { MessageRecord } from "../conversation/types";
import type { SummaryFlags } from "../conversation/summary";
import { getRedis } from "../infra/redis";
import {
  CONVERSATION_TASKS,
  type ConversationTaskName,
  type ConversationTaskPayload,
  buildConversationJobId,
  isConversationPayload
} from "./types";

type TaskLogger = (message: string, meta?: Record<string, unknown>) => void;

export type ConversationTaskDeps = {
  redis?: Redis;
  recordKeeper?: RecordKeeper;
  summarizer?: ConversationSummaryService;
  indexer?: ConversationIndexer;
  logger?: TaskLogger;
};

export type ConversationTaskResult = {
  ok: boolean;
  reason?: string;
  meta?: Record<string, unknown>;
};

const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
const indexName = process.env["CONVERSATION_INDEX_NAME"] ?? "bernard_conversations";
const indexPrefix = process.env["CONVERSATION_INDEX_PREFIX"] ?? "bernard:conv:index";
const chunkChars = parseInt(process.env["CONVERSATION_INDEX_CHARS"] ?? "1800", 10) || 1800;
const maxChunks = parseInt(process.env["CONVERSATION_INDEX_MAX_CHUNKS"] ?? "12", 10) || 12;
const messageLimit = parseInt(process.env["CONVERSATION_INDEX_MESSAGE_LIMIT"] ?? "240", 10) || 240;

/**
 * Minimal vector indexer for conversations with deterministic chunk IDs.
 */
export class ConversationIndexer {
  private cachedStore: Promise<RedisVectorStore> | null = null;
  private cachedClient: any = null;

  constructor(private readonly redis: Redis = getRedis()) { }

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
      const client = await this.vectorClient();
      return new RedisVectorStore(embeddings, {
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
        await store.addDocuments(docs, { keys: chunkIds });
        debugLog(undefined, "Documents added successfully", { conversationId });
      }

      const stale = previousIds.filter((id) => !chunkIds.includes(id));
      debugLog(undefined, "Identified stale chunks", { conversationId, staleCount: stale.length });

      if (stale.length) {
        debugLog(undefined, "Removing stale chunks", { conversationId, staleCount: stale.length });
        await store.delete({ ids: stale });
        debugLog(undefined, "Stale chunks removed", { conversationId });
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

  private idsKey(conversationId: string) {
    return `${indexPrefix}:ids:${conversationId}`;
  }
}

function log(logger: TaskLogger | undefined, message: string, meta?: Record<string, unknown>) {
  if (logger) logger(message, meta);
}

function debugLog(logger: TaskLogger | undefined, message: string, meta?: Record<string, unknown>) {
  if (logger) logger(`DEBUG: ${message}`, meta);
}

function errorLog(logger: TaskLogger | undefined, message: string, meta?: Record<string, unknown>) {
  if (logger) logger(`ERROR: ${message}`, meta);
}

function filterMessages(messages: MessageRecord[]): MessageRecord[] {
  const filtered = messages.filter(
    (message) => (message.metadata as { traceType?: string } | undefined)?.traceType !== "llm_call"
  );
  debugLog(undefined, "Message filtering", {
    originalCount: messages.length,
    filteredCount: filtered.length,
    removedCount: messages.length - filtered.length
  });
  return filtered;
}

function toEntry(message: MessageRecord): string {
  const content =
    typeof message.content === "string" ? message.content : JSON.stringify(message.content, null, 2).slice(0, chunkChars);
  const entry = `[${message.role}] ${content}`;
  debugLog(undefined, "Message entry created", {
    messageId: message.id,
    role: message.role,
    entryLength: entry.length,
    contentLength: content.length
  });
  return entry;
}

function chunkMessages(entries: string[]): string[] {
  debugLog(undefined, "Starting message chunking", {
    entryCount: entries.length,
    chunkChars,
    maxChunks
  });

  const chunks: string[] = [];
  let current = "";
  let chunkIndex = 0;

  for (const entry of entries) {
    const trimmedEntry = entry.length > chunkChars ? entry.slice(0, chunkChars) : entry;
    debugLog(undefined, "Processing entry for chunking", {
      entryLength: entry.length,
      trimmedLength: trimmedEntry.length,
      currentLength: current.length
    });

    if ((current + "\n" + trimmedEntry).length > chunkChars && current.length) {
      const chunk = current.trim();
      chunks.push(chunk);
      debugLog(undefined, "Completed chunk", {
        chunkIndex: chunkIndex++,
        chunkLength: chunk.length,
        totalChunks: chunks.length
      });
      current = trimmedEntry;
      continue;
    }
    current = current ? `${current}\n${trimmedEntry}` : trimmedEntry;
    if (current.length >= chunkChars) {
      const chunk = current.slice(0, chunkChars);
      chunks.push(chunk);
      debugLog(undefined, "Completed chunk (size limit)", {
        chunkIndex: chunkIndex++,
        chunkLength: chunk.length,
        totalChunks: chunks.length
      });
      current = "";
    }
  }
  if (current.trim()) {
    const chunk = current.trim();
    chunks.push(chunk);
    debugLog(undefined, "Completed final chunk", {
      chunkIndex: chunkIndex,
      chunkLength: chunk.length,
      totalChunks: chunks.length
    });
  }

  const finalChunks = chunks.slice(-maxChunks);
  debugLog(undefined, "Chunking completed", {
    originalChunks: chunks.length,
    finalChunks: finalChunks.length,
    maxChunks,
    chunkSizes: finalChunks.map(c => c.length)
  });

  return finalChunks;
}

function detectFlags(messages: MessageRecord[]): SummaryFlags {
  const text = messages
    .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
    .join(" ")
    .toLowerCase();
  const has = (words: string[]) => words.some((word) => text.includes(word));
  return {
    explicit: has(["nsfw", "porn", "sex", "nude", "explicit"]),
    forbidden: has(["bomb", "weapon", "attack", "terror", "kill", "drugs", "hack"])
  };
}

async function runIndexTask(
  conversationId: string,
  messages: MessageRecord[],
  deps: { indexer: ConversationIndexer; logger?: TaskLogger; recordKeeper?: RecordKeeper }
): Promise<ConversationTaskResult> {
  try {
    debugLog(deps.logger, "Starting index task", { conversationId, messageCount: messages.length });

    const filtered = filterMessages(messages).slice(-messageLimit);
    debugLog(deps.logger, "Filtered messages", {
      conversationId,
      originalCount: messages.length,
      filteredCount: filtered.length
    });

    const entries = filtered.map(toEntry);
    debugLog(deps.logger, "Converted to entries", {
      conversationId,
      entryCount: entries.length,
      totalChars: entries.reduce((sum, entry) => sum + entry.length, 0)
    });

    const chunks = chunkMessages(entries);
    debugLog(deps.logger, "Created chunks", {
      conversationId,
      chunkCount: chunks.length,
      chunkSizes: chunks.map(c => c.length)
    });

    if (!chunks.length) {
      debugLog(deps.logger, "No chunks to index", { conversationId });
      return { ok: true, meta: { chunks: 0 } };
    }

    debugLog(deps.logger, "Indexing chunks", { conversationId, chunks: chunks.length });
    const result = await deps.indexer.indexConversation(conversationId, chunks);
    log(deps.logger, "conversation.indexed", { conversationId, ...result });
    return { ok: true, meta: { ...result } };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    errorLog(deps.logger, "Index task failed", { conversationId, error: errorMessage });
    if (deps.recordKeeper) {
      try {
        await deps.recordKeeper.updateIndexingStatus(conversationId, "failed", errorMessage);
      } catch (statusErr) {
        errorLog(deps.logger, "Failed to update indexing status", { conversationId, error: String(statusErr) });
      }
    }
    return { ok: false, reason: "indexing_failed", meta: { error: errorMessage } };
  }
}

async function runSummaryTask(
  conversationId: string,
  messages: MessageRecord[],
  deps: {
    summarizer: ConversationSummaryService;
    recordKeeper: RecordKeeper;
    logger?: TaskLogger;
  }
): Promise<ConversationTaskResult> {
  try {
    debugLog(deps.logger, "Starting summary task", { conversationId, messageCount: messages.length });

    const result = await deps.summarizer.summarize(conversationId, messages);
    debugLog(deps.logger, "Summary generated", {
      conversationId,
      hasSummary: Boolean(result.summary),
      summaryLength: result.summary?.length ?? 0,
      tags: result.tags?.length ?? 0,
      keywords: result.keywords?.length ?? 0,
      places: result.places?.length ?? 0
    });

    await deps.recordKeeper.updateConversationSummary(conversationId, result);
    log(deps.logger, "conversation.summarized", {
      conversationId,
      hasSummary: Boolean(result.summary),
      tags: result.tags?.length ?? 0
    });
    return { ok: true, meta: { hasSummary: Boolean(result.summary), tags: result.tags?.length ?? 0 } };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    errorLog(deps.logger, "Summary task failed", { conversationId, error: errorMessage });
    return { ok: false, reason: "summary_failed", meta: { error: errorMessage } };
  }
}

async function runFlagTask(
  conversationId: string,
  messages: MessageRecord[],
  deps: { recordKeeper: RecordKeeper; logger?: TaskLogger }
): Promise<ConversationTaskResult> {
  try {
    debugLog(deps.logger, "Starting flag task", { conversationId, messageCount: messages.length });

    const flags = detectFlags(messages);
    debugLog(deps.logger, "Flags detected", { conversationId, ...flags });

    await deps.recordKeeper.updateConversationFlags(conversationId, flags);
    log(deps.logger, "conversation.flagged", { conversationId, ...flags });
    return { ok: true, meta: { ...flags } };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    errorLog(deps.logger, "Flag task failed", { conversationId, error: errorMessage });
    return { ok: false, reason: "flag_failed", meta: { error: errorMessage } };
  }
}

export function buildConversationTaskProcessor(deps: ConversationTaskDeps = {}) {
  const redis = deps.redis ?? getRedis();
  const recordKeeper = deps.recordKeeper ?? new RecordKeeper(redis);
  const indexer = deps.indexer ?? new ConversationIndexer(redis);
  let summarizerPromise: Promise<ConversationSummaryService> | null = deps.summarizer
    ? Promise.resolve(deps.summarizer)
    : null;

  async function summarizer(): Promise<ConversationSummaryService> {
    if (summarizerPromise) return summarizerPromise;
    summarizerPromise = ConversationSummaryService.create();
    return summarizerPromise;
  }

  return async function processor(
    job: Job<ConversationTaskPayload, unknown, ConversationTaskName>
  ): Promise<ConversationTaskResult> {
    const conversationId = job.data.conversationId;

    debugLog(deps.logger, "Processing conversation task", {
      conversationId,
      task: job.name,
      jobId: job.id
    });

    if (!isConversationPayload(job.data)) {
      errorLog(deps.logger, "Invalid conversation payload", { conversationId, jobId: job.id });
      throw new Error("invalid conversation payload");
    }

    const conversationWithMessages = await recordKeeper.getConversationWithMessages(conversationId);
    if (!conversationWithMessages) {
      debugLog(deps.logger, "Conversation not found", { conversationId, jobId: job.id });
      return { ok: false, reason: "conversation_missing" };
    }

    const messages = conversationWithMessages.messages;
    debugLog(deps.logger, "Retrieved messages for task", {
      conversationId,
      task: job.name,
      messageCount: messages.length
    });

    switch (job.name) {
      case CONVERSATION_TASKS.index:
        return runIndexTask(conversationId, messages, { indexer, logger: deps.logger as any, recordKeeper });
      case CONVERSATION_TASKS.summary:
        return runSummaryTask(conversationId, messages, {
          summarizer: await summarizer(),
          recordKeeper,
          logger: deps.logger as any
        });
      case CONVERSATION_TASKS.flag:
        return runFlagTask(conversationId, messages, { recordKeeper, logger: deps.logger as any });
      default:
        errorLog(deps.logger, "Unknown conversation task", { conversationId, task: job.name, jobId: job.id });
        throw new Error(`unknown conversation task: ${job.name}`);
    }
  };
}

export function buildConversationJobIds(conversationId: string) {
  return {
    index: buildConversationJobId(CONVERSATION_TASKS.index, conversationId),
    summary: buildConversationJobId(CONVERSATION_TASKS.summary, conversationId),
    flag: buildConversationJobId(CONVERSATION_TASKS.flag, conversationId)
  };
}

