import assert from "node:assert/strict";
import { afterEach, test } from "vitest";

import { UserStore } from "../lib/auth/userStore";
import { FakeRedis } from "./fakeRedis";

const TEST_TIMEOUT = 2000;
const OriginalDate = Date;
let currentNow = OriginalDate.now();

function setNow(iso: string) {
  currentNow = new OriginalDate(iso).getTime();
  class MockDate extends OriginalDate {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(currentNow);
      } else {
        super(...(args as [any]));
      }
    }

    static now() {
      return currentNow;
    }
  }

  // @ts-expect-error override global Date for deterministic timestamps
  globalThis.Date = MockDate as DateConstructor;
}

afterEach(() => {
  globalThis.Date = OriginalDate;
});

test("upsertOAuthUser creates first user as admin with timestamps", { timeout: TEST_TIMEOUT }, async () => {
  const redis = new FakeRedis();
  const store = new UserStore(redis);
  const now = "2025-02-01T00:00:00.000Z";
  setNow(now);

  const user = await store.upsertOAuthUser("u1", "First User");

  assert.equal(user.isAdmin, true);
  assert.equal(user.status, "active");
  assert.equal(user.createdAt, now);
  assert.equal(user.updatedAt, now);
  assert.equal(user.lastLoginAt, now);
});

test("upsertOAuthUser creates subsequent users as non-admin", { timeout: TEST_TIMEOUT }, async () => {
  const redis = new FakeRedis();
  const store = new UserStore(redis);
  setNow("2025-02-01T00:00:00.000Z");
  await store.upsertOAuthUser("u1", "First");

  const later = "2025-02-01T12:00:00.000Z";
  setNow(later);
  const user2 = await store.upsertOAuthUser("u2", "Second");

  assert.equal(user2.isAdmin, false);
  assert.equal(user2.createdAt, later);
  assert.equal(user2.updatedAt, later);
  assert.equal(user2.lastLoginAt, later);
});

test("upsertOAuthUser updates existing active users on login", { timeout: TEST_TIMEOUT }, async () => {
  const redis = new FakeRedis();
  const store = new UserStore(redis);
  const created = "2025-02-01T00:00:00.000Z";
  const relog = "2025-02-02T01:02:03.000Z";
  setNow(created);
  const initial = await store.upsertOAuthUser("u1", "First");

  setNow(relog);
  const updated = await store.upsertOAuthUser("u1", "Renamed");

  assert.equal(updated.displayName, "Renamed");
  assert.equal(updated.createdAt, initial.createdAt);
  assert.equal(updated.lastLoginAt, relog);
  assert.equal(updated.updatedAt, relog);
  assert.equal(updated.isAdmin, true);
});

test("upsertOAuthUser throws when user is deleted", { timeout: TEST_TIMEOUT }, async () => {
  const store = new UserStore(new FakeRedis());
  setNow("2025-02-01T00:00:00.000Z");
  await store.upsertOAuthUser("u1", "First");
  await store.delete("u1");

  await assert.rejects(() => store.upsertOAuthUser("u1", "Again"), /deleted/);
});

test("create inserts a new user and rejects duplicates", { timeout: TEST_TIMEOUT }, async () => {
  const store = new UserStore(new FakeRedis());
  const now = "2025-02-01T00:00:00.000Z";
  setNow(now);

  const created = await store.create({ id: "u1", displayName: "Named", isAdmin: false });
  assert.equal(created.displayName, "Named");
  assert.equal(created.isAdmin, false);
  assert.equal(created.status, "active");
  assert.equal(created.createdAt, now);
  assert.equal(created.updatedAt, now);

  await assert.rejects(() => store.create({ id: "u1", displayName: "Dup", isAdmin: true }), /already exists/);
});

test("get returns null for unknown users and returns sanitized record", async () => {
  const store = new UserStore(new FakeRedis());
  assert.equal(await store.get("missing"), null);

  const now = "2025-02-01T00:00:00.000Z";
  setNow(now);
  const created = await store.create({ id: "u1", displayName: "Exists", isAdmin: false });
  const fetched = await store.get("u1");
  assert.deepEqual(fetched, created);
});

test("list returns stored users and drops invalid entries", async () => {
  const redis = new FakeRedis();
  const store = new UserStore(redis);
  const now = "2025-02-01T00:00:00.000Z";
  setNow(now);
  await store.create({ id: "u1", displayName: "Valid", isAdmin: false });

  // Insert a corrupted entry (missing createdAt) that should be filtered out.
  await redis.hset("bernard:users:id:bad", { id: "bad", displayName: "Bad" });
  await redis.sadd("bernard:users:ids", "bad");

  const list = await store.list();
  const ids = list.map((u) => u.id);
  assert.ok(ids.includes("u1"));
  assert.ok(!ids.includes("bad"));
});

test("update modifies allowed fields when active and updates timestamp", { timeout: TEST_TIMEOUT }, async () => {
  const store = new UserStore(new FakeRedis());
  const createdAt = "2025-02-01T00:00:00.000Z";
  const updatedAt = "2025-02-02T00:00:00.000Z";
  setNow(createdAt);
  await store.create({ id: "u1", displayName: "Before", isAdmin: false });

  setNow(updatedAt);
  const updated = await store.update("u1", { displayName: "After", isAdmin: true });
  assert.ok(updated);
  assert.equal(updated?.displayName, "After");
  assert.equal(updated?.isAdmin, true);
  assert.equal(updated?.createdAt, createdAt);
  assert.equal(updated?.updatedAt, updatedAt);

  assert.equal(await store.update("missing", { displayName: "Nope" }), null);
  await store.delete("u1");
  assert.equal(await store.update("u1", { displayName: "Nope" }), null);
});

test("setStatus updates status for active users and ignores deleted", { timeout: TEST_TIMEOUT }, async () => {
  const store = new UserStore(new FakeRedis());
  const createdAt = "2025-02-01T00:00:00.000Z";
  const updatedAt = "2025-02-02T00:00:00.000Z";
  setNow(createdAt);
  await store.create({ id: "u1", displayName: "Named", isAdmin: false });

  setNow(updatedAt);
  const updated = await store.setStatus("u1", "disabled");
  assert.ok(updated);
  assert.equal(updated?.status, "disabled");
  assert.equal(updated?.updatedAt, updatedAt);

  assert.equal(await store.setStatus("missing", "active"), null);
  await store.delete("u1");
  assert.equal(await store.setStatus("u1", "active"), null);
});

test("delete redacts display name, demotes admin, and marks deleted", { timeout: TEST_TIMEOUT }, async () => {
  const store = new UserStore(new FakeRedis());
  const createdAt = "2025-02-01T00:00:00.000Z";
  const deletedAt = "2025-02-03T00:00:00.000Z";
  setNow(createdAt);
  await store.create({ id: "u1", displayName: "KeepMe", isAdmin: true });

  setNow(deletedAt);
  const deleted = await store.delete("u1");

  assert.ok(deleted);
  assert.equal(deleted?.status, "deleted");
  assert.equal(deleted?.isAdmin, false);
  assert.ok(deleted?.displayName.startsWith("deleted-"));
  assert.equal(deleted?.updatedAt, deletedAt);

  const refetched = await store.get("u1");
  assert.deepEqual(refetched, deleted);
});

