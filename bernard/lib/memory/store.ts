import crypto from "node:crypto";

import { RedisVectorStore } from "@langchain/community/vectorstores/redis";
import { Document } from "@langchain/core/documents";
import { getEmbeddingModel, type EmbeddingConfig, verifyEmbeddingConfig } from "../config/embeddings";
import { getRedis } from "../infra/redis";
import { withTimeout } from "../infra/timeouts";
import type Redis from "ioredis";
import { createClient, type RedisClientType } from "redis";
import { getSettings } from "../config/settingsCache";

export type MemoryRecord = {
  id: string;
  label: string;
  content: string;
  conversationId: string;
  createdAt: string;
  refreshedAt: string;
  freshnessMaxDays: number;
  successorId?: string | undefined;
};

export type MemorySearchHit = {
  record: MemoryRecord;
  score: number;
  originId: string;
  redirected?: boolean;
};

type VectorStoreLike = {
  addDocuments(documents: Document[], options?: unknown): Promise<void>;
  similaritySearchWithScore(query: string, k?: number, filter?: unknown): Promise<Array<[Document, number]>>;
  delete(options: unknown): Promise<void>;
};

const DEFAULT_INDEX_NAME = process.env["MEMORY_INDEX_NAME"] ?? "bernard_memories";
const DEFAULT_KEY_PREFIX = process.env["MEMORY_KEY_PREFIX"] ?? "bernard:memories";
const DEFAULT_NAMESPACE = process.env["MEMORY_NAMESPACE"] ?? "bernard:memories";
const DEFAULT_FRESHNESS_DAYS = 7;
const MAX_FRESHNESS_DAYS = 90;
const MAX_INCREMENT_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const MEMORY_VECTOR_TIMEOUT_MS = parseInt(process.env["MEMORY_VECTOR_TIMEOUT_MS"] ?? "8000", 10) || 8_000;

type VectorStoreFactory = (options: {
  config: EmbeddingConfig & { indexName?: string; keyPrefix?: string };
  embeddings: Awaited<ReturnType<typeof getEmbeddingModel>>;
  redisClient: RedisClientType;
  indexName: string;
  keyPrefix: string;
}) => Promise<VectorStoreLike>;

type VectorClientFactory = () => Promise<RedisClientType>;
type EmbeddingFactory = (config: EmbeddingConfig) => ReturnType<typeof getEmbeddingModel>;
type RedisClientCreator = (options: { url: string }) => RedisClientType;
type RedisVectorStoreBuilder = (options: {
  embeddings: Awaited<ReturnType<typeof getEmbeddingModel>>;
  redisClient: RedisClientType;
  indexName: string;
  keyPrefix: string;
}) => Promise<VectorStoreLike> | VectorStoreLike;

function nowIso() {
  return new Date().toISOString();
}

/**
 * Increase freshness by 10% up to a maximum increment and ceiling.
 */
export function bumpFreshness(currentDays: number): number {
  const increment = Math.min(currentDays * 0.1, MAX_INCREMENT_DAYS);
  return Math.min(MAX_FRESHNESS_DAYS, currentDays + increment);
}

/**
 * Compute the absolute expiry timestamp for a memory record in milliseconds.
 */
export function computeExpiryMs(record: MemoryRecord): number {
  const refreshed = new Date(record.refreshedAt).getTime();
  return refreshed + record.freshnessMaxDays * DAY_MS;
}

/**
 * Determine whether a record is already expired at a given moment.
 */
export function isExpired(record: MemoryRecord, nowMs = Date.now()): boolean {
  return computeExpiryMs(record) <= nowMs;
}

/**
 * Compute remaining TTL in seconds, clamped to zero when expired.
 */
export function ttlSeconds(record: MemoryRecord, nowMs = Date.now()): number {
  const expiresAt = computeExpiryMs(record);
  if (expiresAt <= nowMs) return 0;
  return Math.ceil((expiresAt - nowMs) / 1000);
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

let cachedVectorClient: RedisClientType | null = null;
let cachedVectorStore: VectorStoreLike | null = null;
let cachedVectorStoreConfig: { indexName: string; keyPrefix: string } | null = null;

let redisClientCreator: RedisClientCreator = createClient;
let redisVectorStoreBuilder: RedisVectorStoreBuilder = async ({ embeddings, redisClient, indexName, keyPrefix }) =>
  new RedisVectorStore(embeddings, {
    redisClient,
    indexName,
    keyPrefix
  });

const defaultVectorClientFactory: VectorClientFactory = async () => {
  if (cachedVectorClient) return cachedVectorClient;
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  const client = redisClientCreator({ url });
  await client.connect();
  cachedVectorClient = client;
  return client;
};

const defaultVectorStoreFactory: VectorStoreFactory = async ({ embeddings, redisClient, indexName, keyPrefix }) =>
  redisVectorStoreBuilder({ embeddings, redisClient, indexName, keyPrefix });

let vectorClientFactory: VectorClientFactory = defaultVectorClientFactory;
let vectorStoreFactory: VectorStoreFactory = defaultVectorStoreFactory;
let embeddingFactory: EmbeddingFactory = getEmbeddingModel;

async function getVectorClient(): Promise<RedisClientType> {
  if (cachedVectorClient) return cachedVectorClient;
  const client = await vectorClientFactory();
  cachedVectorClient = client;
  return client;
}

async function getVectorStore(
  config: EmbeddingConfig & { indexName?: string; keyPrefix?: string } = {}
): Promise<VectorStoreLike> {
  const indexName = config.indexName ?? DEFAULT_INDEX_NAME;
  const keyPrefix = config.keyPrefix ?? DEFAULT_KEY_PREFIX;
  if (cachedVectorStore && cachedVectorStoreConfig?.indexName === indexName && cachedVectorStoreConfig?.keyPrefix === keyPrefix) {
    return cachedVectorStore;
  }

  const embeddings = await embeddingFactory(config);
  const redisClient = await getVectorClient();
  const store = await vectorStoreFactory({ config, embeddings, redisClient, indexName, keyPrefix });
  cachedVectorStore = store;
  cachedVectorStoreConfig = { indexName, keyPrefix };
  return store;
}

/**
 * Redis-backed memory store with vector search for semantic similarity.
 */
export class MemoryStore {
  constructor(
    private readonly redis: Redis = getRedis(),
    private readonly vectorStorePromise: Promise<VectorStoreLike> = getVectorStore(),
    private readonly namespace = DEFAULT_NAMESPACE,
    private readonly keyPrefix = DEFAULT_KEY_PREFIX
  ) {}

  private idsKey() {
    return `${this.namespace}:ids`;
  }

  private metaKey(id: string) {
    return `${this.namespace}:meta:${id}`;
  }

  private docKey(id: string) {
    return `${this.keyPrefix}:doc:${id}`;
  }

  private async vectorStore(): Promise<VectorStoreLike> {
    return this.vectorStorePromise;
  }

  private async storeMetadata(record: MemoryRecord): Promise<void> {
    await this.redis
      .multi()
      .set(this.metaKey(record.id), JSON.stringify(record))
      .sadd(this.idsKey(), record.id)
      .exec();
    await this.applyExpiry(record);
  }

  private async applyExpiry(record: MemoryRecord) {
    const ttl = ttlSeconds(record);
    if (ttl <= 0) return;
    const maybeExpire = (this.redis as unknown as { expire?: (key: string, seconds: number) => Promise<number> }).expire;
    if (maybeExpire) {
      await maybeExpire.call(this.redis, this.metaKey(record.id), ttl).catch(() => {});
      await maybeExpire.call(this.redis, this.docKey(record.id), ttl).catch(() => {});
    }
  }

  private async upsertVectorDoc(record: MemoryRecord) {
    const store = await this.vectorStore();
    const doc = new Document({
      pageContent: record.content,
      metadata: {
        id: record.id,
        label: record.label,
        conversationId: record.conversationId,
        refreshedAt: record.refreshedAt,
        freshnessMaxDays: record.freshnessMaxDays,
        successorId: record.successorId
      }
    });
    await store.addDocuments([doc], { ids: [record.id] });
    await this.applyExpiry(record);
  }

  private async safeUpsertVectorDoc(record: MemoryRecord) {
    try {
      await withTimeout(this.upsertVectorDoc(record), MEMORY_VECTOR_TIMEOUT_MS, "memory vector upsert");
    } catch (err) {
      console.warn(`[memory] vector upsert failed; continuing without embedding: ${formatError(err)}`);
    }
  }

  async createMemory(input: { label: string; content: string; conversationId: string }): Promise<MemoryRecord> {
    const id = crypto.randomUUID();
    const timestamp = nowIso();
    const record: MemoryRecord = {
      id,
      label: input.label.trim(),
      content: input.content.trim(),
      conversationId: input.conversationId,
      createdAt: timestamp,
      refreshedAt: timestamp,
      freshnessMaxDays: DEFAULT_FRESHNESS_DAYS
    };
    await this.storeMetadata(record);
    await this.safeUpsertVectorDoc(record);
    return record;
  }

  async getMemory(id: string): Promise<MemoryRecord | null> {
    const raw = await this.redis.get(this.metaKey(id));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as MemoryRecord;
      if (isExpired(parsed)) {
        await this.deleteMemory(id);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async list(): Promise<MemoryRecord[]> {
    const ids = await this.redis.smembers(this.idsKey());
    const records: MemoryRecord[] = [];
    for (const id of ids) {
      const record = await this.getMemory(id);
      if (!record) {
        await this.redis.srem(this.idsKey(), id);
        continue;
      }
      records.push(record);
    }
    records.sort((a, b) => new Date(b.refreshedAt).getTime() - new Date(a.refreshedAt).getTime());
    return records;
  }

  async refreshMemory(id: string): Promise<MemoryRecord | null> {
    const record = await this.getMemory(id);
    if (!record) return null;
    if (record.successorId) return record;
    const updated: MemoryRecord = {
      ...record,
      refreshedAt: nowIso(),
      freshnessMaxDays: bumpFreshness(record.freshnessMaxDays)
    };
    await this.storeMetadata(updated);
    return updated;
  }

  async updateMemory(
    id: string,
    updates: Partial<Pick<MemoryRecord, "label" | "content" | "conversationId" | "successorId">>
  ): Promise<MemoryRecord | null> {
    const record = await this.getMemory(id);
    if (!record) return null;
    const next: MemoryRecord = {
      ...record,
      ...("label" in updates && updates.label ? { label: updates.label.trim() } : {}),
      ...("content" in updates && updates.content ? { content: updates.content.trim() } : {}),
      ...("conversationId" in updates && updates.conversationId ? { conversationId: updates.conversationId } : {}),
      ...("successorId" in updates ? { successorId: updates.successorId } : {})
    };
    await this.storeMetadata(next);
    if (updates.content || updates.label) {
      await this.safeUpsertVectorDoc(next);
    }
    return next;
  }

  async markSuccessor(id: string, successorId: string): Promise<MemoryRecord | null> {
    return this.updateMemory(id, { successorId });
  }

  async deleteMemory(id: string): Promise<boolean> {
    await this.redis
      .multi()
      .del(this.metaKey(id))
      .srem(this.idsKey(), id)
      .exec();
    const store = await this.vectorStore();
    try {
      await store.delete({ ids: [id] });
    } catch {
      // ignore missing vector entries
    }
    return true;
  }

  async searchSimilar(content: string, limit = 5): Promise<MemorySearchHit[]> {
    const store = await this.vectorStore();
    let results: Array<[Document, number]> = [];
    try {
      results = await withTimeout(
        store.similaritySearchWithScore(content, limit),
        MEMORY_VECTOR_TIMEOUT_MS,
        "memory similarity search"
      );
    } catch (err) {
      console.warn(`[memory] similarity search failed; returning no neighbors: ${formatError(err)}`);
      return [];
    }
    const hits: MemorySearchHit[] = [];
    for (const [doc, score] of results) {
      const originId =
        (doc.metadata as { id?: string })?.id ?? (doc.metadata as { docId?: string })?.docId ?? doc.id ?? "";
      if (!originId) continue;
      const record = await this.getMemory(originId);
      if (!record) continue;
      hits.push({ record, score, originId, redirected: Boolean(record.successorId) });
    }
    return hits;
  }

  static verifyConfiguration(config: EmbeddingConfig = {}): Promise<{ ok: boolean; reason?: string }> {
    return verifyMemoryConfiguration(config);
  }
}

type MemoryStoreDeps = {
  redis?: Redis;
  vectorStoreFactory?: typeof getVectorStore;
  settingsFetcher?: typeof getSettings;
};

/**
 * Construct a MemoryStore using configuration and optionally injected dependencies.
 */
export async function getMemoryStore(config: EmbeddingConfig = {}, deps: MemoryStoreDeps = {}): Promise<MemoryStore> {
  const fetchSettings = deps.settingsFetcher ?? getSettings;
  const settings = await fetchSettings().catch(() => null);
  const memory = settings?.services.memory;
  const indexName = memory?.indexName ?? DEFAULT_INDEX_NAME;
  const keyPrefix = memory?.keyPrefix ?? DEFAULT_KEY_PREFIX;
  const namespace = memory?.namespace ?? DEFAULT_NAMESPACE;
  const apiKey = config.apiKey ?? memory?.embeddingApiKey;
  const baseUrl = config.baseUrl ?? memory?.embeddingBaseUrl;
  const model = config.model ?? memory?.embeddingModel;
  const vectorStoreConfig: EmbeddingConfig & { indexName?: string; keyPrefix?: string } = {
    indexName,
    keyPrefix,
    ...(apiKey ? { apiKey } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(model ? { model } : {})
  };
  const vectorStore = (deps.vectorStoreFactory ?? getVectorStore)(vectorStoreConfig);
  return new MemoryStore(deps.redis ?? getRedis(), vectorStore, namespace, keyPrefix);
}

async function verifyRedisSearch(client: RedisClientType): Promise<{ ok: boolean; reason?: string }> {
  try {
    await client.sendCommand(["FT._LIST"]);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const reason = message.toLowerCase().includes("unknown command")
      ? "Redis search module missing (RediSearch/redis-stack required)."
      : `Redis search check failed: ${message}`;
    return { ok: false, reason };
  }
}

type VerifyMemoryDeps = {
  verifyEmbeddings?: typeof verifyEmbeddingConfig;
  redisClientFactory?: () => Promise<RedisClientType>;
  redisSearchCheck?: (client: RedisClientType) => Promise<{ ok: boolean; reason?: string }>;
};

/**
 * Validate embedding configuration and Redis search capabilities.
 */
export async function verifyMemoryConfiguration(
  config: EmbeddingConfig = {},
  deps: VerifyMemoryDeps = {}
): Promise<{ ok: boolean; reason?: string }> {
  const embeddingCheck = await (deps.verifyEmbeddings ?? verifyEmbeddingConfig)(config);
  if (!embeddingCheck.ok) return embeddingCheck;

  try {
    const client = await (deps.redisClientFactory ?? getVectorClient)();
    const searchCheck = await (deps.redisSearchCheck ?? verifyRedisSearch)(client);
    if (!searchCheck.ok) return searchCheck;
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message };
  }
}

/**
 * Override the vector client factory for testing.
 */
export function setVectorClientFactory(factory: VectorClientFactory) {
  cachedVectorClient = null;
  vectorClientFactory = factory;
}

/**
 * Override the vector store factory for testing.
 */
export function setVectorStoreFactory(factory: VectorStoreFactory) {
  cachedVectorStore = null;
  cachedVectorStoreConfig = null;
  vectorStoreFactory = factory;
}

/**
 * Override the underlying Redis client creator used by the default client factory.
 */
export function setRedisClientCreator(creator: RedisClientCreator) {
  cachedVectorClient = null;
  redisClientCreator = creator;
}

/**
 * Override the Redis vector store builder used by the default store factory.
 */
export function setRedisVectorStoreBuilder(builder: RedisVectorStoreBuilder) {
  cachedVectorStore = null;
  cachedVectorStoreConfig = null;
  redisVectorStoreBuilder = builder;
}

/**
 * Override the embedding model factory for testing.
 */
export function setEmbeddingModelFactory(factory: EmbeddingFactory) {
  cachedVectorStore = null;
  cachedVectorStoreConfig = null;
  embeddingFactory = factory;
}

/**
 * Reset cached clients and factories to defaults. Intended for tests.
 */
export function resetMemoryStoreState() {
  if (cachedVectorClient) {
    const maybeQuit = (cachedVectorClient as { quit?: () => Promise<unknown> }).quit;
    if (typeof maybeQuit === "function") {
      // Intentionally fire and forget to avoid blocking callers; tests can await closeVectorClient for determinism.
      maybeQuit.call(cachedVectorClient).catch(() => {});
    }
  }
  cachedVectorClient = null;
  cachedVectorStore = null;
  cachedVectorStoreConfig = null;
  vectorClientFactory = defaultVectorClientFactory;
  vectorStoreFactory = defaultVectorStoreFactory;
  redisClientCreator = createClient;
  redisVectorStoreBuilder = async ({ embeddings, redisClient, indexName, keyPrefix }) =>
    new RedisVectorStore(embeddings, {
      redisClient,
      indexName,
      keyPrefix
    });
  embeddingFactory = getEmbeddingModel;
}

/**
 * Explicitly close the cached vector client when present. Useful for tests.
 */
export async function closeVectorClient(): Promise<void> {
  if (cachedVectorClient) {
    const maybeQuit = (cachedVectorClient as { quit?: () => Promise<unknown> }).quit;
    if (typeof maybeQuit === "function") {
      await maybeQuit.call(cachedVectorClient).catch(() => {});
    }
  }
  cachedVectorClient = null;
}

