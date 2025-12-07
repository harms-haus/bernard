import assert from "node:assert/strict";
import test from "node:test";

import { TokenStore } from "../lib/tokenStore";
import { FakeRedis } from "./fakeRedis";

const withSilencedConsole = async (fn: () => Promise<void>) => {
  const original = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    await fn();
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test(
  "create returns full record and hides secrets in get/list",
  { timeout: 1_000 },
  async () =>
    withSilencedConsole(async () => {
      const redis = new FakeRedis();
      const store = new TokenStore(redis as any);

      const created = await store.create("alpha");
      assert.match(created.id, /^[0-9a-f]{20}$/);
      assert.match(created.token, /^[0-9a-f]{48}$/);
      assert.equal(created.name, "alpha");
      assert.equal(created.status, "active");
      assert.ok(!Number.isNaN(Date.parse(created.createdAt)));

      const listed = await store.list();
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.name, "alpha");
      assert.equal((listed[0] as any).token, undefined);

      const fetched = await store.get(created.id);
      assert.equal((fetched as any)?.token, undefined);
    })
);

test(
  "create rejects duplicate names and preserves existing record",
  { timeout: 1_000 },
  async () =>
    withSilencedConsole(async () => {
      const redis = new FakeRedis();
      const store = new TokenStore(redis as any);

      const first = await store.create("alpha");
      await assert.rejects(() => store.create("alpha"), /already exists/);

      const listed = await store.list();
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.id, first.id);
    })
);

test(
  "validate sets and refreshes lastUsedAt while keeping createdAt",
  { timeout: 1_000 },
  async () =>
    withSilencedConsole(async () => {
      const store = new TokenStore(new FakeRedis() as any);
      const created = await store.create("beta");

      assert.equal((await store.get(created.id))?.lastUsedAt, undefined);

      const first = await store.validate(created.token);
      assert.ok(first?.lastUsedAt);
      const firstUsed = first?.lastUsedAt!;
      assert.equal(first?.createdAt, created.createdAt);

      await sleep(10);

      const second = await store.validate(created.token);
      assert.ok(second?.lastUsedAt);
      assert.equal(second?.createdAt, created.createdAt);
      assert.notEqual(second?.lastUsedAt, firstUsed);
      assert.ok(new Date(second!.lastUsedAt!).getTime() > new Date(firstUsed).getTime());

      const fetched = await store.get(created.id);
      assert.equal(fetched?.lastUsedAt, second?.lastUsedAt);
    })
);

test(
  "validate rejects disabled and unknown tokens without mutations",
  { timeout: 1_000 },
  async () =>
    withSilencedConsole(async () => {
      const redis = new FakeRedis();
      const store = new TokenStore(redis as any);
      const created = await store.create("gamma");

      await store.update(created.id, { status: "disabled" });
      assert.equal(await store.validate(created.token), null);

      const emptyStore = new TokenStore(new FakeRedis() as any);
      assert.equal(await emptyStore.validate("missing"), null);
      const ids = await (emptyStore as any).redis.smembers("bernard:tokens:ids");
      assert.deepEqual(ids, []);
    })
);

test(
  "resolve returns info without bumping lastUsedAt and respects disabled",
  { timeout: 1_000 },
  async () =>
    withSilencedConsole(async () => {
      const store = new TokenStore(new FakeRedis() as any);
      const created = await store.create("delta");

      await store.validate(created.token);
      const before = await store.get(created.id);
      const beforeUsed = before?.lastUsedAt;
      assert.ok(beforeUsed);

      await sleep(10);
      const resolved = await store.resolve(created.token);
      assert.ok(resolved);
      assert.equal(resolved?.lastUsedAt, beforeUsed);

      const after = await store.get(created.id);
      assert.equal(after?.lastUsedAt, beforeUsed);

      await store.update(created.id, { status: "disabled" });
      assert.equal(await store.resolve(created.token), null);
    })
);

test(
  "update enforces unique names and frees old name after rename",
  { timeout: 1_000 },
  async () =>
    withSilencedConsole(async () => {
      const store = new TokenStore(new FakeRedis() as any);
      const one = await store.create("one");
      const two = await store.create("two");

      await assert.rejects(() => store.update(two.id, { name: "one" }));

      const renamed = await store.update(two.id, { name: "three" });
      assert.equal(renamed?.name, "three");

      const reused = await store.create("two");
      assert.equal(reused.name, "two");

      const listedNames = (await store.list()).map((t) => t.name).sort();
      assert.deepEqual(listedNames, ["one", "three", "two"].sort());
      assert.equal((await store.get(one.id))?.name, "one");
    })
);

test(
  "update toggles status and preserves existing lastUsedAt",
  { timeout: 1_000 },
  async () =>
    withSilencedConsole(async () => {
      const store = new TokenStore(new FakeRedis() as any);
      const created = await store.create("epsilon");
      await store.validate(created.token);

      const before = await store.get(created.id);
      const beforeUsed = before?.lastUsedAt;
      assert.ok(beforeUsed);

      const updated = await store.update(created.id, { status: "disabled" });
      assert.equal(updated?.status, "disabled");
      assert.equal(updated?.lastUsedAt, beforeUsed);
    })
);

test(
  "delete removes mappings for existing id and ignores missing ones",
  { timeout: 1_000 },
  async () =>
    withSilencedConsole(async () => {
      const store = new TokenStore(new FakeRedis() as any);
      const keep = await store.create("keep");
      const target = await store.create("delete-me");

      assert.equal(await store.delete(target.id), true);
      assert.equal(await store.validate(target.token), null);
      assert.equal(await store.resolve(target.token), null);
      assert.equal(await store.get(target.id), null);
      assert.equal((await store.list()).some((t) => t.id === target.id), false);

      assert.equal(await store.delete("missing"), false);
      assert.ok((await store.get(keep.id))?.name === "keep");
    })
);

test(
  "list filters out corrupted records",
  { timeout: 1_000 },
  async () =>
    withSilencedConsole(async () => {
      const redis = new FakeRedis();
      const store = new TokenStore(redis as any);
      const good = await store.create("good");

      await redis.sadd("bernard:tokens:ids", "ghost");

      const listed = await store.list();
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.id, good.id);
    })
);

test(
  "namespace isolation prevents cross-tenant collisions",
  { timeout: 1_000 },
  async () =>
    withSilencedConsole(async () => {
      const redis = new FakeRedis();
      const storeA = new TokenStore(redis as any, "nsA");
      const storeB = new TokenStore(redis as any, "nsB");

      const a = await storeA.create("shared");
      const b = await storeB.create("shared");

      assert.equal((await storeA.list()).length, 1);
      assert.equal((await storeB.list()).length, 1);

      assert.equal(await storeB.validate(a.token), null);
      assert.ok(await storeA.validate(a.token));
      assert.equal(await storeA.validate(b.token), null);
      assert.ok(await storeB.validate(b.token));
    })
);
