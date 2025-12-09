import assert from "node:assert";

import { bumpFreshness, ttlSeconds, computeExpiryMs, isExpired, type MemoryRecord } from "../lib/memoryStore";

const baseRecord = (): MemoryRecord => ({
  id: "id-1",
  label: "label",
  content: "content",
  conversationId: "conv-1",
  createdAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
  refreshedAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
  freshnessMaxDays: 7
});

describe("memoryStore math", () => {
  it("bumps freshness by 10% capped at 3 days", () => {
    assert.strictEqual(bumpFreshness(7), 7 + 0.7);
    assert.strictEqual(bumpFreshness(40), 43); // capped at 3
  });

  it("caps freshness at 90 days", () => {
    assert.strictEqual(bumpFreshness(90), 90);
    assert.strictEqual(bumpFreshness(88), 90);
  });

  it("computes ttl in seconds", () => {
    const record = baseRecord();
    const now = new Date("2024-01-02T00:00:00.000Z").getTime();
    const expiresAt = computeExpiryMs(record);
    assert.ok(expiresAt > now);
    const ttl = ttlSeconds(record, now);
    assert.ok(ttl > 0);
  });

  it("detects expiration", () => {
    const record = { ...baseRecord(), refreshedAt: new Date("2023-12-01T00:00:00.000Z").toISOString(), freshnessMaxDays: 1 };
    const now = new Date("2023-12-05T00:00:00.000Z").getTime();
    assert.ok(isExpired(record, now));
  });
});

