import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, test, vi } from "vitest";

import { TokenStore, type TokenRecord } from "../lib/auth/tokenStore";
import { FakeRedis } from "./fakeRedis";

const DEFAULT_NAMESPACE = "bernard:tokens";

function createStore(redis = new FakeRedis()) {
  return { store: new TokenStore(redis as any), redis };
}

function stubRandomBytes(values: Buffer[]) {
  let call = 0;
  vi.spyOn(crypto, "randomBytes").mockImplementation((size: number) => {
    const next = values[call] ?? Buffer.alloc(size, call);
    call += 1;
    if (next.length === size) return next;
    const padded = Buffer.alloc(size);
    next.copy(padded, 0, 0, Math.min(next.length, size));
    return padded;
  });
}

function idKey(id: string) {
  return `${DEFAULT_NAMESPACE}:id:${id}`;
}

function nameKey(name: string) {
  return `${DEFAULT_NAMESPACE}:name:${name}`;
}

function tokenKey(token: string) {
  return `${DEFAULT_NAMESPACE}:secret:${token}`;
}

function idsSet() {
  return `${DEFAULT_NAMESPACE}:ids`;
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("create stores token with mappings and prevents duplicates", { timeout: 2000 }, async () => {
  stubRandomBytes([Buffer.alloc(10, 1), Buffer.alloc(24, 2)]);
  const { store, redis } = createStore();

  const record = await store.create("alice");

  assert.equal(record.id, "01010101010101010101");
  assert.equal(record.token, "brnd-020202020202020202020202020202020202020202020202");
  assert.equal(record.name, "alice");
  assert.equal(record.status, "active");
  assert.ok(record.createdAt);

  const stored = await redis.hgetall(idKey(record.id));
  assert.equal(stored.name, "alice");
  assert.equal(stored.token, record.token);
  assert.equal(await redis.get(nameKey("alice")), record.id);
  assert.equal(await redis.get(tokenKey(record.token)), record.id);
  assert.ok((await redis.smembers(idsSet())).includes(record.id));

  await assert.rejects(store.create("alice"), /already exists/);
});

test("validate returns token info and updates lastUsedAt", { timeout: 2000 }, async () => {
  stubRandomBytes([Buffer.alloc(10, 3), Buffer.alloc(24, 4)]);
  const { store } = createStore();
  const { token, id } = await store.create("bob");

  const info = await store.validate(token);

  assert.ok(info);
  assert.equal(info?.id, id);
  assert.equal(info?.name, "bob");
  assert.equal(info?.status, "active");
  assert.ok(info?.lastUsedAt);
  const fetched = await store.get(id);
  assert.equal(fetched?.lastUsedAt, info?.lastUsedAt);
});

test("validate rejects unknown or disabled tokens", { timeout: 2000 }, async () => {
  const { store } = createStore();
  const missing = await store.validate("brnd-unknown");
  assert.equal(missing, null);

  stubRandomBytes([Buffer.alloc(10, 5), Buffer.alloc(24, 6)]);
  const { token, id } = await store.create("carol");
  await store.update(id, { status: "disabled" });

  const disabled = await store.validate(token);
  assert.equal(disabled, null);
});

test("resolve returns info without mutating lastUsedAt", { timeout: 2000 }, async () => {
  stubRandomBytes([Buffer.alloc(10, 7), Buffer.alloc(24, 8)]);
  const { store, redis } = createStore();
  const { token, id } = await store.create("dave");
  const existingLastUsed = "2025-01-01T00:00:00.000Z";
  await redis.hset(idKey(id), { lastUsedAt: existingLastUsed });

  const info = await store.resolve(token);

  assert.ok(info);
  assert.equal(info?.lastUsedAt, existingLastUsed);
  const stored = await redis.hget(idKey(id), "lastUsedAt");
  assert.equal(stored, existingLastUsed);
});

test("get fetches token info or null for missing/incomplete", { timeout: 2000 }, async () => {
  const { store, redis } = createStore();
  assert.equal(await store.get("missing"), null);

  await redis.hset(idKey("partial"), { id: "partial" });
  assert.equal(await store.get("partial"), null);

  stubRandomBytes([Buffer.alloc(10, 9), Buffer.alloc(24, 10)]);
  const { id } = await store.create("erin");
  const fetched = await store.get(id);
  assert.ok(fetched);
  assert.equal(fetched?.name, "erin");
});

test("update supports rename and status change with conflict checks", { timeout: 2000 }, async () => {
  stubRandomBytes([
    Buffer.alloc(10, 11),
    Buffer.alloc(24, 12),
    Buffer.alloc(10, 13),
    Buffer.alloc(24, 14)
  ]);
  const { store, redis } = createStore();
  const second = await store.create("second");

  await assert.rejects(store.update(second.id, { name: "first" }), /already exists/);

  await redis.hset(idKey(second.id), { lastUsedAt: "2025-02-02T00:00:00.000Z" });
  const updated = await store.update(second.id, { name: "second-renamed", status: "disabled" });

  assert.ok(updated);
  assert.equal(updated?.name, "second-renamed");
  assert.equal(updated?.status, "disabled");
  assert.equal(updated?.lastUsedAt, "2025-02-02T00:00:00.000Z");
  assert.equal(await redis.get(nameKey("second-renamed")), second.id);
  assert.equal(await redis.get(nameKey("second")), null);
});

test("delete removes all related keys and set membership", { timeout: 2000 }, async () => {
  stubRandomBytes([Buffer.alloc(10, 15), Buffer.alloc(24, 16)]);
  const { store, redis } = createStore();
  const { id, token } = await store.create("gone");

  const removed = await store.delete(id);
  assert.equal(removed, true);
  assert.equal(await store.get(id), null);
  assert.equal(await store.validate(token), null);
  assert.equal(await redis.get(nameKey("gone")), null);
  assert.equal(await redis.get(tokenKey(token)), null);
  assert.ok(!(await redis.smembers(idsSet())).includes(id));

  assert.equal(await store.delete("missing"), false);
});

test("list returns active records and skips malformed ones", { timeout: 2000 }, async () => {
  stubRandomBytes([
    Buffer.alloc(10, 17),
    Buffer.alloc(24, 18),
    Buffer.alloc(10, 19),
    Buffer.alloc(24, 20)
  ]);
  const { store, redis } = createStore();
  const second = await store.create("listed-b");
  await store.update(second.id, { status: "disabled" });
  await redis.hset(idKey("bad"), { id: "bad" });
  await redis.sadd(idsSet(), "bad");

  const list = await store.list();

  assert.equal(list.length, 2);
  const names = list.map((t) => t.name).sort();
  assert.deepEqual(names, ["listed-a", "listed-b"]);
  const statuses = Object.fromEntries(list.map((t) => [t.name, t.status]));
  assert.equal(statuses["listed-b"], "disabled");
});

test("exportAll returns stored tokens including lastUsedAt and token", { timeout: 2000 }, async () => {
  stubRandomBytes([Buffer.alloc(10, 21), Buffer.alloc(24, 22)]);
  const { store, redis } = createStore();
  const created = await store.create("exported");
  await redis.hset(idKey(created.id), { lastUsedAt: "2025-03-03T00:00:00.000Z" });

  const all = await store.exportAll();

  assert.equal(all.length, 1);
  const record = all[0] as TokenRecord;
  assert.equal(record.id, created.id);
  assert.equal(record.token, created.token);
  assert.equal(record.lastUsedAt, "2025-03-03T00:00:00.000Z");
});
