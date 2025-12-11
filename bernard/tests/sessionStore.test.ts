import assert from "node:assert/strict";
import { test } from "vitest";

import { SessionStore } from "../lib/auth/sessionStore";
import { FakeRedis } from "./fakeRedis";

test("create stores a session record and indexes by user", async () => {
  const redis = new FakeRedis();
  const ttlSeconds = 60 * 60; // 1 hour
  const store = new SessionStore(redis as any, "ns", ttlSeconds);

  const record = await store.create("user-1");

  assert.equal(record.userId, "user-1");
  assert.equal(record.id.length, 36);

  const saved = await redis.hgetall(`ns:id:${record.id}`);
  assert.equal(saved.id, record.id);
  assert.equal(saved.userId, "user-1");

  const membership = await redis.smembers("ns:user:user-1:sessions");
  assert.ok(membership.includes(record.id));

  const expiresInMs = Date.parse(record.expiresAt) - Date.parse(record.createdAt);
  assert.ok(expiresInMs >= ttlSeconds * 1000);
  assert.ok(expiresInMs < ttlSeconds * 1000 + 2000); // small tolerance for wall-clock delay
});

test("get returns an existing session record", async () => {
  const redis = new FakeRedis();
  const store = new SessionStore(redis as any, "ns");

  const created = await store.create("user-2");
  const fetched = await store.get(created.id);

  assert.deepEqual(fetched, created);
});

test("get returns null when session is missing", async () => {
  const redis = new FakeRedis();
  const store = new SessionStore(redis as any, "ns");

  const fetched = await store.get("missing");
  assert.equal(fetched, null);
});

test("get deletes and skips expired sessions", async () => {
  const redis = new FakeRedis();
  const store = new SessionStore(redis as any, "ns");
  const id = "expired-id";
  const userId = "user-expired";
  const createdAt = new Date(Date.now() - 10_000).toISOString();
  const expiresAt = new Date(Date.now() - 5_000).toISOString();

  await redis.hset(`ns:id:${id}`, { id, userId, createdAt, expiresAt });
  await redis.sadd(`ns:user:${userId}:sessions`, id);

  const fetched = await store.get(id);

  assert.equal(fetched, null);
  assert.deepEqual(await redis.hgetall(`ns:id:${id}`), {});
  assert.equal((await redis.smembers(`ns:user:${userId}:sessions`)).length, 0);
});

test("delete removes session and membership even without provided userId", async () => {
  const redis = new FakeRedis();
  const store = new SessionStore(redis as any, "ns");
  const id = "session-delete";
  const userId = "user-delete";

  await redis.hset(`ns:id:${id}`, { id, userId, createdAt: new Date().toISOString(), expiresAt: new Date().toISOString() });
  await redis.sadd(`ns:user:${userId}:sessions`, id);

  await store.delete(id);

  assert.deepEqual(await redis.hgetall(`ns:id:${id}`), {});
  assert.equal((await redis.smembers(`ns:user:${userId}:sessions`)).length, 0);
});

test("deleteForUser removes all sessions for a user", async () => {
  const redis = new FakeRedis();
  const store = new SessionStore(redis as any, "ns");

  const first = await store.create("user-many");
  const second = await store.create("user-many");

  await store.deleteForUser("user-many");

  assert.deepEqual(await redis.hgetall(`ns:id:${first.id}`), {});
  assert.deepEqual(await redis.hgetall(`ns:id:${second.id}`), {});
  assert.equal((await redis.smembers("ns:user:user-many:sessions")).length, 0);
});

test("exportAll returns all valid sessions and skips incomplete entries", async () => {
  const redis = new FakeRedis();
  const store = new SessionStore(redis as any, "ns");

  const user1 = await store.create("user-one");
  const user3 = await store.create("user-three");

  // Incomplete session missing expiresAt should be ignored
  const incompleteId = "incomplete";
  await redis.hset(`ns:id:${incompleteId}`, { id: incompleteId, userId: "user-two", createdAt: new Date().toISOString() });
  await redis.sadd("ns:user:user-two:sessions", incompleteId);

  const exported = await store.exportAll(["user-one", "user-two", "user-three"]);
  const ids = new Set(exported.map((r) => r.id));

  assert.equal(exported.length, 2);
  assert.ok(ids.has(user1.id));
  assert.ok(ids.has(user3.id));
  assert.ok(!ids.has(incompleteId));
});

