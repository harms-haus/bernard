import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FakeRedis } from "./fakeRedis";
import { UserStore } from "@/lib/userStore";

describe("UserStore", () => {
  it("promotes the first OAuth user to admin", async () => {
    const store = new UserStore(new FakeRedis() as any);
    const first = await store.upsertOAuthUser("user-1", "First User");
    assert.equal(first.isAdmin, true);
    const second = await store.upsertOAuthUser("user-2", "Second User");
    assert.equal(second.isAdmin, false);
  });

  it("redacts on delete and keeps id reserved", async () => {
    const store = new UserStore(new FakeRedis() as any);
    await store.create({ id: "user-1", displayName: "First User", isAdmin: true });
    const deleted = await store.delete("user-1");
    assert.equal(deleted?.status, "deleted");
    assert.equal(deleted?.isAdmin, false);
    await assert.rejects(() => store.create({ id: "user-1", displayName: "Again", isAdmin: false }), Error);
  });

  it("updates display name and admin flag", async () => {
    const store = new UserStore(new FakeRedis() as any);
    await store.create({ id: "user-1", displayName: "First User", isAdmin: true });
    const updated = await store.update("user-1", { displayName: "Renamed", isAdmin: false });
    assert.equal(updated?.displayName, "Renamed");
    assert.equal(updated?.isAdmin, false);
  });
});

