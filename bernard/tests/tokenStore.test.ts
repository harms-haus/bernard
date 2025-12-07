import assert from "node:assert/strict";
import test from "node:test";

import { TokenStore } from "../lib/tokenStore";
import { FakeRedis } from "./fakeRedis";

test("create returns secret once and list hides it", async () => {
  const redis = new FakeRedis();
  const store = new TokenStore(redis as any);

  const created = await store.create("alpha");
  assert.ok(created.token);
  assert.equal(created.name, "alpha");
  assert.equal(created.status, "active");

  const listed = await store.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.name, "alpha");
  assert.equal((listed[0] as any).token, undefined);
});

test("validate updates lastUsedAt and rejects disabled tokens", async () => {
  const store = new TokenStore(new FakeRedis() as any);
  const created = await store.create("beta");

  const first = await store.validate(created.token);
  assert.ok(first?.lastUsedAt);
  await new Promise((resolve) => setTimeout(resolve, 5));

  const second = await store.validate(created.token);
  assert.ok(second?.lastUsedAt);
  assert.notEqual(first?.lastUsedAt, second?.lastUsedAt);

  await store.update(created.id, { status: "disabled" });
  const rejected = await store.validate(created.token);
  assert.equal(rejected, null);
});

test("update enforces unique names", async () => {
  const store = new TokenStore(new FakeRedis() as any);
  const one = await store.create("one");
  const two = await store.create("two");

  await assert.rejects(() => store.update(two.id, { name: "one" }));

  const renamed = await store.update(two.id, { name: "three" });
  assert.equal(renamed?.name, "three");

  const listed = await store.list();
  assert.deepEqual(
    listed
      .map((t) => t.name)
      .sort(),
    ["one", "three"]
  );
});

test("delete removes token", async () => {
  const store = new TokenStore(new FakeRedis() as any);
  const created = await store.create("delete-me");

  const removed = await store.delete(created.id);
  assert.equal(removed, true);

  const listed = await store.list();
  assert.equal(listed.length, 0);

  const validation = await store.validate(created.token);
  assert.equal(validation, null);
});

