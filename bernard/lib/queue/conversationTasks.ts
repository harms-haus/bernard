import { RedisVectorStore } from "@langchain/community/vectorstores/redis";
import { Document } from "@langchain/core/documents";
import type { Job } from "bullmq";
import type Redis from "ioredis";
import { createClient, type RedisClientType } from "redis";

import { getEmbeddingModel } from "../config/embeddings";
import { RecordKeeper } from "../conversation/recordKeeper";
import { ConversationSummaryService } from "../conversation/summary";
import type { MessageRecord, SummaryFlags } from "../conversation/types";
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
  private cachedClient: RedisClientType | null = null;

  constructor(private readonly redis: Redis = getRedis()) {}

  private async vectorClient(): Promise<RedisClientType> {
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
    const store = await this.vectorStore();
    const chunkIds = chunks.map((_, idx) => `${conversationId}:chunk:${idx}`);
    const previousIds = await this.redis.smembers(this.idsKey(conversationId));

    const docs = chunks.map(
      (content, idx) =>
        new Document({
          pageContent: content,
          metadata: { conversationId, chunk: idx }
        })
    );

    if (docs.length) {
      await store.addDocuments(docs, { ids: chunkIds });
    }

    const stale = previousIds.filter((id) => !chunkIds.includes(id));
    if (stale.length) {
      await store.delete({ ids: stale });
    }

    const multi = this.redis.multi().del(this.idsKey(conversationId));
    if (chunkIds.length) {
      multi.sadd(this.idsKey(conversationId), ...chunkIds);
    }
    await multi.exec();

    return { chunks: chunkIds.length, pruned: stale.length };
  }

  private idsKey(conversationId: string) {
    return `${indexPrefix}:ids:${conversationId}`;
  }
}

function log(logger: TaskLogger | undefined, message: string, meta?: Record<string, unknown>) {
  if (logger) logger(message, meta);
}

function filterMessages(messages: MessageRecord[]): MessageRecord[] {
  return messages.filter(
    (message) => (message.metadata as { traceType?: string } | undefined)?.traceType !== "llm_call"
  );
}

function toEntry(message: MessageRecord): string {
  const content =
    typeof message.content === "string" ? message.content : JSON.stringify(message.content, null, 2).slice(0, chunkChars);
  return `[${message.role}] ${content}`;
}

function chunkMessages(entries: string[]): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const entry of entries) {
    const trimmedEntry = entry.length > chunkChars ? entry.slice(0, chunkChars) : entry;
    if ((current + "\n" + trimmedEntry).length > chunkChars && current.length) {
      chunks.push(current.trim());
      current = trimmedEntry;
      continue;
    }
    current = current ? `${current}\n${trimmedEntry}` : trimmedEntry;
    if (current.length >= chunkChars) {
      chunks.push(current.slice(0, chunkChars));
      current = "";
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.slice(-maxChunks);
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
    const filtered = filterMessages(messages).slice(-messageLimit);
    const entries = filtered.map(toEntry);
    const chunks = chunkMessages(entries);
    if (!chunks.length) return { ok: true, meta: { chunks: 0 } };
    const result = await deps.indexer.indexConversation(conversationId, chunks);
    log(deps.logger, "conversation.indexed", { conversationId, ...result });
    return { ok: true, meta: { ...result } };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(deps.logger, "conversation.indexing.failed", { conversationId, error: errorMessage });
    if (deps.recordKeeper) {
      try {
        await deps.recordKeeper.updateIndexingStatus(conversationId, "failed", errorMessage);
      } catch (statusErr) {
        log(deps.logger, "conversation.indexing.status_update_failed", { conversationId, error: String(statusErr) });
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
  const result = await deps.summarizer.summarize(conversationId, messages);
  await deps.recordKeeper.updateConversationSummary(conversationId, result);
  log(deps.logger, "conversation.summarized", {
    conversationId,
    hasSummary: Boolean(result.summary),
    tags: result.tags?.length ?? 0
  });
  return { ok: true, meta: { hasSummary: Boolean(result.summary), tags: result.tags?.length ?? 0 } };
}

async function runFlagTask(
  conversationId: string,
  messages: MessageRecord[],
  deps: { recordKeeper: RecordKeeper; logger?: TaskLogger }
): Promise<ConversationTaskResult> {
  const flags = detectFlags(messages);
  await deps.recordKeeper.updateConversationFlags(conversationId, flags);
  log(deps.logger, "conversation.flagged", { conversationId, ...flags });
  return { ok: true, meta: { ...flags } };
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
    if (!isConversationPayload(job.data)) {
      throw new Error("invalid conversation payload");
    }
    const conversationId = job.data.conversationId;
    const conversationWithMessages = await recordKeeper.getConversationWithMessages(conversationId);
    if (!conversationWithMessages) {
      return { ok: false, reason: "conversation_missing" };
    }
    const messages = conversationWithMessages.messages;

    switch (job.name) {
      case CONVERSATION_TASKS.index:
        return runIndexTask(conversationId, messages, { indexer, logger: deps.logger, recordKeeper });
      case CONVERSATION_TASKS.summary:
        return runSummaryTask(conversationId, messages, {
          summarizer: await summarizer(),
          recordKeeper,
          logger: deps.logger
        });
      case CONVERSATION_TASKS.flag:
        return runFlagTask(conversationId, messages, { recordKeeper, logger: deps.logger });
      default:
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
