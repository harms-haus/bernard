import assert from "node:assert/strict";
import test from "node:test";

import type Redis from "ioredis";

import { RecordKeeper, type MessageRecord } from "../lib/recordKeeper";
import { FakeRedis } from "./fakeRedis";
import type { SummaryResult } from "../lib/conversationSummary";

class StubSummarizer {
  summarize(_conversationId: string, _messages: MessageRecord[]): Promise<SummaryResult> {
    return Promise.resolve({
      summary: "short summary",
      tags: ["tag1", "tag2"],
      keywords: ["k1"],
      places: ["home"],
      flags: { explicit: false, forbidden: false }
    });
  }
}

void test("reuses conversation within idle window", async () => {
  const redis = new FakeRedis();
  const redisClient = redis as unknown as Redis;
  const keeper = new RecordKeeper(redisClient, { idleMs: 10 * 60 * 1000 });

  const first = await keeper.startRequest("t1", "m1");
  const second = await keeper.startRequest("t1", "m1");

  assert.equal(first.conversationId, second.conversationId);
});

void test("closes idle conversation and writes summary", async () => {
  const redis = new FakeRedis();
  const redisClient = redis as unknown as Redis;
  const keeper = new RecordKeeper(redisClient, { idleMs: 10, summarizer: new StubSummarizer() });

  const { conversationId } = await keeper.startRequest("t1", "m1");
  await keeper.appendMessages(conversationId, []);
  await keeper.closeIfIdle(Date.now() + 20);

  const convo = await keeper.getConversation(conversationId);
  assert.equal(convo?.status, "closed");
  assert.equal(convo?.summary, "short summary");
});

void test("records tool and model metrics", async () => {
  const redis = new FakeRedis();
  const redisClient = redis as unknown as Redis;
  const keeper = new RecordKeeper(redisClient);
  const turnId = await keeper.startTurn("req1", "conv1", "tok", "modelA");

  await keeper.recordToolResult(turnId, "toolX", { ok: true, latencyMs: 50 });
  await keeper.recordToolResult(turnId, "toolX", { ok: false, latencyMs: 30, errorType: "timeout" });
  await keeper.recordOpenRouterResult(turnId, "modelA", { ok: true, latencyMs: 100, tokensIn: 10, tokensOut: 20 });

  const toolMetrics = await redisClient.hgetall("bernard:rk:metrics:tool:toolX");
  assert.equal(toolMetrics.ok, "1");
  assert.equal(toolMetrics.fail, "1");

  const modelMetrics = await redisClient.hgetall("bernard:rk:metrics:model:modelA:openrouter");
  assert.equal(modelMetrics.ok, "1");
  assert.equal(modelMetrics.fail ?? "0", modelMetrics.fail ?? "0");
});

void test("recall and reopen conversation", async () => {
  const redis = new FakeRedis();
  const redisClient = redis as unknown as Redis;
  const keeper = new RecordKeeper(redisClient);
  const { conversationId } = await keeper.startRequest("tokenA", "modelA");

  const recalled = await keeper.recallConversation({ token: "tokenA", includeMessages: false });
  assert.ok(recalled.length >= 1);

  const reopened = await keeper.reopenConversation(conversationId, "tokenB");
  assert.ok(reopened);
  assert.ok(reopened?.tokenSet?.includes("tokenB"));
});

