import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import { Document } from "@langchain/core/documents";

import {
  MemoryStore,
  type MemoryRecord,
  bumpFreshness,
  closeVectorClient,
  computeExpiryMs,
  getMemoryStore,
  isExpired,
  setRedisClientCreator,
  setRedisVectorStoreBuilder,
  setEmbeddingModelFactory,
  setVectorClientFactory,
  setVectorStoreFactory,
  resetMemoryStoreState,
  ttlSeconds,
  verifyMemoryConfiguration
} from "../lib/memory/store";
import type { EmbeddingConfig } from "../lib/config/embeddings";
import { FakeRedis } from "./fakeRedis";

const TEST_TIMEOUT = 3_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const OriginalDate = Date;
const OriginalWarn = console.warn;

class FakeRedisWithExpire extends FakeRedis {
  expirations: Array<{ key: string; seconds: number }> = [];

  async expire(key: string, seconds: number): Promise<number> {
    this.expirations.push({ key, seconds });
    return 1;
  }
}

type VectorStubOptions = {
  addError?: Error | null;
  deleteError?: Error | null;
  searchError?: Error | null;
  searchResults?: Array<[Document, number]>;
};

function createVectorStoreStub(options: VectorStubOptions = {}) {
  const added: Array<{ content: string; metadata: unknown; ids?: string[] }> = [];
  const deleted: string[] = [];
  const searchCalls: Array<{ query: string; k?: number }> = [];
  const opts = { ...options };
  const store = {
    async addDocuments(docs: Document[], { ids }: { ids?: string[] } = {}) {
      if (opts.addError) throw opts.addError;
      docs.forEach((doc) => added.push({ content: doc.pageContent, metadata: doc.metadata, ids }));
    },
    async similaritySearchWithScore(query: string, k?: number) {
      searchCalls.push({ query, k });
      if (opts.searchError) throw opts.searchError;
      return opts.searchResults ?? [];
    },
    async delete({ ids }: { ids: string[] }) {
      deleted.push(...ids);
      if (opts.deleteError) throw opts.deleteError;
    }
  };
  return { store, added, deleted, searchCalls, options: opts };
}

function setNow(iso: string) {
  const nowMs = new OriginalDate(iso).getTime();
  class MockDate extends OriginalDate {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(nowMs);
      } else {
        super(...(args as [any]));
      }
    }

    static now() {
      return nowMs;
    }
  }

  // @ts-expect-error override for deterministic timestamps
  globalThis.Date = MockDate as DateConstructor;
}

beforeEach(() => {
  console.warn = () => {};
  // Force vector store/redis factories to use in-memory stubs to avoid opening real sockets.
  resetMemoryStoreState();
  const fakeClient = {
    async connect() {},
    async quit() {}
  } as any;
  setVectorClientFactory(async () => fakeClient);
  setRedisClientCreator(() => fakeClient);
});

afterEach(async () => {
  globalThis.Date = OriginalDate;
  console.warn = OriginalWarn;
  await closeVectorClient();
  resetMemoryStoreState();
});


test("bumpFreshness grows by 10% up to caps", () => {
  assert.equal(bumpFreshness(10), 11);
  assert.equal(bumpFreshness(40), 43);
  assert.equal(bumpFreshness(89), 90);
});

test("expiry helpers compute TTL and expiry boundaries", () => {
  const refreshedAt = "2025-01-01T00:00:00.000Z";
  const record: MemoryRecord = {
    id: "r1",
    label: "label",
    content: "content",
    conversationId: "c1",
    createdAt: refreshedAt,
    refreshedAt,
    freshnessMaxDays: 1
  };
  const expiry = new Date(refreshedAt).getTime() + DAY_MS;
  assert.equal(computeExpiryMs(record), expiry);
  assert.equal(ttlSeconds(record, expiry - 500), 1);
  assert.equal(ttlSeconds(record, expiry), 0);
  assert.equal(isExpired(record, expiry), true);
  assert.equal(isExpired(record, expiry - 1), false);
});

test("applyExpiry skips when TTL is non-positive or expire is missing", async () => {
  const vector = createVectorStoreStub();
  const redisWithExpire = new FakeRedisWithExpire();
  const store = new MemoryStore(redisWithExpire as any, Promise.resolve(vector.store));
  const expired: MemoryRecord = {
    id: "expired",
    label: "l",
    content: "c",
    conversationId: "c1",
    createdAt: "2020-01-01T00:00:00.000Z",
    refreshedAt: "2020-01-01T00:00:00.000Z",
    freshnessMaxDays: 0
  };

  await (store as any).applyExpiry(expired);
  assert.equal(redisWithExpire.expirations.length, 0);

  const redisNoExpire = new FakeRedis();
  const storeNoExpire = new MemoryStore(redisNoExpire as any, Promise.resolve(vector.store));
  setNow("2025-02-01T00:00:00.000Z");
  const fresh: MemoryRecord = {
    ...expired,
    id: "fresh",
    refreshedAt: "2025-02-01T00:00:00.000Z",
    freshnessMaxDays: 1
  };

  await (storeNoExpire as any).applyExpiry(fresh);
});

test(
  "factory setters inject embedding, redis, and vector store factories",
  { timeout: TEST_TIMEOUT },
  async () => {
    const redis = new FakeRedisWithExpire();
    const vector = createVectorStoreStub();
    const embeddingCalls: EmbeddingConfig[] = [];
    const vectorConfigs: Array<{ indexName: string; keyPrefix: string }> = [];

    setEmbeddingModelFactory(async (cfg) => {
      embeddingCalls.push(cfg);
      return {} as any;
    });
    setVectorClientFactory(async () => ({} as any));
    setVectorStoreFactory(async ({ indexName, keyPrefix }) => {
      vectorConfigs.push({ indexName, keyPrefix });
      return vector.store as any;
    });
    setNow("2025-02-01T00:00:00.000Z");

    const store = new MemoryStore(redis as any);
    const created = await store.createMemory({ label: "x", content: "y", conversationId: "c" });

    assert.ok(created.id);
    assert.ok(embeddingCalls.length >= 1);
    assert.ok(vectorConfigs.length >= 1);
  }
);

test.skip("default factories honor injected redis client and vector builder", { timeout: TEST_TIMEOUT }, async () => {
  resetMemoryStoreState();
  let createCalls = 0;
  let connectCalls = 0;
  setEmbeddingModelFactory(async () => ({} as any));
  setRedisClientCreator(() => {
    createCalls += 1;
    return {
      async connect() {
        connectCalls += 1;
      }
    } as any;
  });
  const vector = createVectorStoreStub();
  let builderCalls = 0;
  setRedisVectorStoreBuilder(async () => {
    builderCalls += 1;
    return vector.store as any;
  });

  const store = await getMemoryStore({}, { redis: new FakeRedisWithExpire() as any });

  setNow("2025-02-01T00:00:00.000Z");
  await store.createMemory({ label: "cached", content: "content", conversationId: "c1" });

  assert.equal(builderCalls, 1);
  assert.ok(createCalls >= 1);
  assert.ok(connectCalls >= 1);
  assert.equal(vector.added.length, 1);
});

test(
  "createMemory trims input, sets defaults, stores metadata, and schedules expiry",
  { timeout: TEST_TIMEOUT },
  async () => {
    const redis = new FakeRedisWithExpire();
    const vector = createVectorStoreStub();
    const store = new MemoryStore(redis as any, Promise.resolve(vector.store));
    const now = "2025-02-01T00:00:00.000Z";
    setNow(now);

    const created = await store.createMemory({ label: "  Label  ", content: "  Body  ", conversationId: "conv-1" });

    assert.equal(created.label, "Label");
    assert.equal(created.content, "Body");
    assert.equal(created.createdAt, now);
    assert.equal(created.refreshedAt, now);
    assert.equal(created.freshnessMaxDays, 7);

    const fetched = await store.getMemory(created.id);
    assert.deepEqual(fetched, created);
    assert.equal(vector.added.length, 1);
    assert.equal(vector.added[0]?.metadata && (vector.added[0]?.metadata as any).id, created.id);

    const metaKey = `bernard:memories:meta:${created.id}`;
    const docKey = `bernard:memories:doc:${created.id}`;
    const keys = redis.expirations.map((e) => e.key);
    assert.ok(keys.includes(metaKey));
    assert.ok(keys.includes(docKey));
    assert.ok(redis.expirations.some((e) => e.seconds > 0));
  }
);

test("getMemory returns null for missing or malformed entries", async () => {
  const redis = new FakeRedisWithExpire();
  const vector = createVectorStoreStub();
  const store = new MemoryStore(redis as any, Promise.resolve(vector.store));

  assert.equal(await store.getMemory("missing"), null);

  await redis.set("bernard:memories:meta:bad", "not-json");
  await redis.sadd("bernard:memories:ids", "bad");
  assert.equal(await store.getMemory("bad"), null);
});

test(
  "getMemory deletes expired records, removes ids, and calls vector delete",
  { timeout: TEST_TIMEOUT },
  async () => {
    const redis = new FakeRedisWithExpire();
    const vector = createVectorStoreStub();
    const store = new MemoryStore(redis as any, Promise.resolve(vector.store));
    const refreshedAt = "2024-01-01T00:00:00.000Z";
    const record: MemoryRecord = {
      id: "old",
      label: "old",
      content: "old content",
      conversationId: "c1",
      createdAt: refreshedAt,
      refreshedAt,
      freshnessMaxDays: 1
    };
    await redis.set("bernard:memories:meta:old", JSON.stringify(record));
    await redis.sadd("bernard:memories:ids", record.id);

    const result = await store.getMemory(record.id);

    assert.equal(result, null);
    const ids = await redis.smembers("bernard:memories:ids");
    assert.ok(!ids.includes(record.id));
    assert.ok(vector.deleted.includes(record.id));
  }
);

test("list sorts by refreshedAt and prunes missing ids", async () => {
  const redis = new FakeRedisWithExpire();
  const vector = createVectorStoreStub();
  const store = new MemoryStore(redis as any, Promise.resolve(vector.store));
  setNow("2025-02-02T12:00:00.000Z");
  const older: MemoryRecord = {
    id: "r-older",
    label: "older",
    content: "older",
    conversationId: "c1",
    createdAt: "2025-02-01T00:00:00.000Z",
    refreshedAt: "2025-02-01T00:00:00.000Z",
    freshnessMaxDays: 7
  };
  const newer: MemoryRecord = {
    ...older,
    id: "r-newer",
    refreshedAt: "2025-02-02T00:00:00.000Z",
    createdAt: "2025-02-02T00:00:00.000Z"
  };
  await redis.set("bernard:memories:meta:r-older", JSON.stringify(older));
  await redis.set("bernard:memories:meta:r-newer", JSON.stringify(newer));
  await redis.sadd("bernard:memories:ids", older.id);
  await redis.sadd("bernard:memories:ids", newer.id);
  await redis.sadd("bernard:memories:ids", "missing");

  const list = await store.list();

  assert.deepEqual(
    list.map((r) => r.id),
    [newer.id, older.id]
  );
  const ids = await redis.smembers("bernard:memories:ids");
  assert.ok(!ids.includes("missing"));
});

test(
  "refreshMemory bumps freshness unless successor already set",
  { timeout: TEST_TIMEOUT },
  async () => {
    const redis = new FakeRedisWithExpire();
    const vector = createVectorStoreStub();
    const store = new MemoryStore(redis as any, Promise.resolve(vector.store));

    setNow("2025-02-01T00:00:00.000Z");
    const created = await store.createMemory({ label: "r1", content: "body", conversationId: "c1" });
    const originalFreshness = created.freshnessMaxDays;
    const originalRefreshed = created.refreshedAt;

    const nextMoment = "2025-02-02T00:00:00.000Z";
    setNow(nextMoment);
    const refreshed = await store.refreshMemory(created.id);
    assert.equal(refreshed?.refreshedAt, nextMoment);
    assert.equal(refreshed?.freshnessMaxDays, bumpFreshness(originalFreshness));

    const successor: MemoryRecord = { ...created, id: "succ", successorId: "new", refreshedAt: originalRefreshed };
    await redis.set(`bernard:memories:meta:${successor.id}`, JSON.stringify(successor));
    await redis.sadd("bernard:memories:ids", successor.id);
    const unchanged = await store.refreshMemory(successor.id);
    assert.equal(unchanged?.refreshedAt, originalRefreshed);
  }
);

test("updateMemory trims fields, embeds on content changes, and handles missing ids", async () => {
  const redis = new FakeRedisWithExpire();
  const vector = createVectorStoreStub();
  const store = new MemoryStore(redis as any, Promise.resolve(vector.store));
  setNow("2025-02-01T00:00:00.000Z");
  const created = await store.createMemory({ label: "old", content: "old", conversationId: "c1" });
  vector.added.length = 0; // reset after initial insert

  const updated = await store.updateMemory(created.id, {
    label: "  new label ",
    content: "  new content ",
    conversationId: "c2"
  });

  assert.equal(updated?.label, "new label");
  assert.equal(updated?.content, "new content");
  assert.equal(updated?.conversationId, "c2");
  assert.equal(vector.added.length, 1);

  await store.updateMemory(created.id, { successorId: "next-one" });
  assert.equal(vector.added.length, 1); // no re-embed when only successor changes

  const missing = await store.updateMemory("missing", { label: "none" });
  assert.equal(missing, null);
});

test(
  "updateMemory swallows vector errors through safeUpsertVectorDoc",
  { timeout: TEST_TIMEOUT },
  async () => {
    const redis = new FakeRedisWithExpire();
    const vector = createVectorStoreStub();
    const store = new MemoryStore(redis as any, Promise.resolve(vector.store));
    setNow("2025-02-01T00:00:00.000Z");
    const created = await store.createMemory({ label: "ok", content: "ok", conversationId: "c1" });
    vector.options.addError = new Error("vector failed");

    const warns: Array<unknown[]> = [];
    console.warn = (...args: unknown[]) => warns.push(args);

    const updated = await store.updateMemory(created.id, { content: "changed" });

    assert.ok(updated);
    assert.ok(warns.length >= 1);
  }
);

test(
  "markSuccessor updates successorId and deleteMemory removes metadata even if vector delete fails",
  { timeout: TEST_TIMEOUT },
  async () => {
    const redis = new FakeRedisWithExpire();
    const vector = createVectorStoreStub({ deleteError: new Error("missing vector doc") });
    const store = new MemoryStore(redis as any, Promise.resolve(vector.store));
    setNow("2025-02-01T00:00:00.000Z");
    const created = await store.createMemory({ label: "to-delete", content: "body", conversationId: "c1" });

    const successor = await store.markSuccessor(created.id, "succ-id");
    assert.equal(successor?.successorId, "succ-id");

    const deleted = await store.deleteMemory(created.id);
    assert.equal(deleted, true);
    const meta = await redis.get(`bernard:memories:meta:${created.id}`);
    const ids = await redis.smembers("bernard:memories:ids");
    assert.equal(meta, null);
    assert.ok(!ids.includes(created.id));
    assert.ok(vector.deleted.includes(created.id));
  }
);

test(
  "searchSimilar hydrates records, skips missing, and marks redirects",
  { timeout: TEST_TIMEOUT },
  async () => {
    const redis = new FakeRedisWithExpire();
    const vector = createVectorStoreStub();
    const store = new MemoryStore(redis as any, Promise.resolve(vector.store));
    setNow("2025-02-01T00:00:00.000Z");
    const first = await store.createMemory({ label: "first", content: "alpha", conversationId: "c1" });
    const second = await store.createMemory({ label: "second", content: "beta", conversationId: "c1" });
    await store.markSuccessor(second.id, "succ-next");

    vector.options.searchResults = [
      [new Document({ pageContent: "doc1", metadata: { id: first.id } }), 0.1],
      [new Document({ pageContent: "doc2", metadata: { docId: second.id } }), 0.2],
      [new Document({ pageContent: "skip", metadata: {} }), 0.3]
    ];

    const hits = await store.searchSimilar("prompt", 3);

    assert.equal(hits.length, 2);
    assert.equal(hits[0]?.record.id, first.id);
    assert.equal(hits[0]?.redirected, false);
    assert.equal(hits[1]?.record.id, second.id);
    assert.equal(hits[1]?.redirected, true);
  }
);

test(
  "searchSimilar returns empty and logs when vector search fails",
  { timeout: TEST_TIMEOUT },
  async () => {
    const redis = new FakeRedisWithExpire();
    const vector = createVectorStoreStub({ searchError: new Error("timeout") });
    const store = new MemoryStore(redis as any, Promise.resolve(vector.store));
    const warns: Array<unknown[]> = [];
    console.warn = (...args: unknown[]) => warns.push(args);

    const hits = await store.searchSimilar("prompt", 2);

    assert.deepEqual(hits, []);
    assert.ok(warns.length >= 1);
  }
);

test(
  "getMemoryStore uses settings overrides and falls back when fetch fails",
  { timeout: TEST_TIMEOUT },
  async () => {
    const redis = new FakeRedisWithExpire();
    const vector = createVectorStoreStub();
    const configs: Array<EmbeddingConfig & { indexName?: string; keyPrefix?: string }> = [];
    const settingsFetcher = async () => ({
      services: {
        memory: {
          indexName: "idx",
          keyPrefix: "kp",
          namespace: "ns",
          embeddingApiKey: "setting-key",
          embeddingBaseUrl: "https://embed",
          embeddingModel: "setting-model"
        }
      }
    });
    const vectorFactory = async (cfg: any) => {
      configs.push(cfg);
      return vector.store as any;
    };

    const store = await getMemoryStore(
      { apiKey: "call-key", model: "call-model" },
      { redis: redis as any, settingsFetcher, vectorStoreFactory: vectorFactory }
    );
    setNow("2025-02-01T00:00:00.000Z");
    const memory = await store.createMemory({ label: "l", content: "c", conversationId: "conv" });
    const ids = await redis.smembers("ns:ids");

    assert.ok(configs[0]);
    assert.equal(configs[0].indexName, "idx");
    assert.equal(configs[0].keyPrefix, "kp");
    assert.equal(configs[0].apiKey, "call-key");
    assert.equal(configs[0].baseUrl, "https://embed");
    assert.equal(configs[0].model, "call-model");
    assert.ok(ids.includes(memory.id));

    configs.length = 0;
    const fallback = await getMemoryStore(
      {},
      {
        redis: redis as any,
        settingsFetcher: async () => {
          throw new Error("boom");
        },
        vectorStoreFactory: vectorFactory
      }
    );
    await fallback.list();
    assert.equal(configs[0]?.indexName, "bernard_memories");
  }
);

test("verifyMemoryConfiguration short-circuits embedding failures", async () => {
  let embedCalls = 0;
  const result = await verifyMemoryConfiguration({}, {
    verifyEmbeddings: async () => {
      embedCalls += 1;
      return { ok: false, reason: "bad" };
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "bad");
  assert.equal(embedCalls, 1);
});

test("verifyMemoryConfiguration checks redis search success", async () => {
  let searchChecks = 0;
  const client = {
    async sendCommand() {
      return ["index"];
    }
  };
  const result = await verifyMemoryConfiguration(
    {},
    {
      verifyEmbeddings: async () => ({ ok: true }),
      redisClientFactory: async () => client as any,
      redisSearchCheck: async (c) => {
        searchChecks += 1;
        await c.sendCommand(["FT._LIST"]);
        return { ok: true };
      }
    }
  );
  assert.equal(result.ok, true);
  assert.equal(searchChecks, 1);
});

test("verifyMemoryConfiguration reports redis search failures", async () => {
  const result = await verifyMemoryConfiguration(
    {},
    {
      verifyEmbeddings: async () => ({ ok: true }),
      redisClientFactory: async () => ({}) as any,
      redisSearchCheck: async () => ({ ok: false, reason: "missing search" })
    }
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing search");
});

test("verifyMemoryConfiguration surfaces redis client errors", async () => {
  const result = await verifyMemoryConfiguration(
    {},
    {
      verifyEmbeddings: async () => ({ ok: true }),
      redisClientFactory: async () => {
        throw new Error("connection refused");
      }
    }
  );
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /connection refused/);
});
