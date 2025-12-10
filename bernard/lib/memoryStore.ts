import crypto from "node:crypto";

import { RedisVectorStore } from "@langchain/community/vectorstores/redis";
import { Document } from "@langchain/core/documents";
import { getEmbeddingModel, type EmbeddingConfig, verifyEmbeddingConfig } from "./embeddings";
import { getRedis } from "./redis";
import type Redis from "ioredis";
import { createClient, type RedisClientType } from "redis";

export type MemoryRecord = {
  id: string;
  label: string;
  content: string;
  conversationId: string;
  createdAt: string;
  refreshedAt: string;
  freshnessMaxDays: number;
  successorId?: string;
};

export type MemorySearchHit = {
  record: MemoryRecord;
  score: number;
  originId: string;
  redirected?: boolean;
};

type VectorStoreLike = {
  addDocuments(documents: Document[], options?: { ids?: string[] }): Promise<void>;
  similaritySearchWithScore(
    query: string,
    k?: number,
    filter?: Record<string, unknown>
  ): Promise<Array<[Document, number]>>;
  delete(options: { ids: string[] }): Promise<void>;
};

const DEFAULT_INDEX_NAME = process.env["MEMORY_INDEX_NAME"] ?? "bernard_memories";
const DEFAULT_KEY_PREFIX = process.env["MEMORY_KEY_PREFIX"] ?? "bernard:memories";
const DEFAULT_NAMESPACE = process.env["MEMORY_NAMESPACE"] ?? "bernard:memories";
const DEFAULT_FRESHNESS_DAYS = 7;
const MAX_FRESHNESS_DAYS = 90;
const MAX_INCREMENT_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

export function bumpFreshness(currentDays: number): number {
  const increment = Math.min(currentDays * 0.1, MAX_INCREMENT_DAYS);
  return Math.min(MAX_FRESHNESS_DAYS, currentDays + increment);
}

export function computeExpiryMs(record: MemoryRecord): number {
  const refreshed = new Date(record.refreshedAt).getTime();
  return refreshed + record.freshnessMaxDays * DAY_MS;
}

export function isExpired(record: MemoryRecord, nowMs = Date.now()): boolean {
  return computeExpiryMs(record) <= nowMs;
}

export function ttlSeconds(record: MemoryRecord, nowMs = Date.now()): number {
  const expiresAt = computeExpiryMs(record);
  if (expiresAt <= nowMs) return 0;
  return Math.ceil((expiresAt - nowMs) / 1000);
}

let cachedVectorClient: RedisClientType | null = null;
let cachedVectorStore: VectorStoreLike | null = null;

async function getVectorClient(): Promise<RedisClientType> {
  if (cachedVectorClient) return cachedVectorClient;
  const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  const client = createClient({ url });
  await client.connect();
  cachedVectorClient = client;
  return client;
}

async function getVectorStore(config: EmbeddingConfig = {}): Promise<VectorStoreLike> {
  if (cachedVectorStore) return cachedVectorStore;
  const embeddings = getEmbeddingModel(config);
  const redisClient = await getVectorClient();
  const store = new RedisVectorStore(embeddings, {
    redisClient,
    indexName: DEFAULT_INDEX_NAME,
    keyPrefix: DEFAULT_KEY_PREFIX
  });
  cachedVectorStore = store;
  return store;
}

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
    await this.upsertVectorDoc(record);
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
      await this.upsertVectorDoc(next);
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
    const results = await store.similaritySearchWithScore(content, limit);
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

export async function getMemoryStore(config: EmbeddingConfig = {}): Promise<MemoryStore> {
  const vectorStore = getVectorStore(config);
  return new MemoryStore(getRedis(), vectorStore);
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

export async function verifyMemoryConfiguration(
  config: EmbeddingConfig = {}
): Promise<{ ok: boolean; reason?: string }> {
  const embeddingCheck = verifyEmbeddingConfig(config);
  if (!embeddingCheck.ok) return embeddingCheck;

  try {
    const client = await getVectorClient();
    const searchCheck = await verifyRedisSearch(client);
    if (!searchCheck.ok) return searchCheck;
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message };
  }
}

