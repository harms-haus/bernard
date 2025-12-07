// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";

import type Redis from "ioredis";

import { RecordKeeper, type MessageRecord } from "../lib/recordKeeper";
import { FakeRedis } from "./fakeRedis";
import type { ConversationSummaryService, SummaryResult } from "../lib/conversationSummary";

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

class ErrorSummarizer {
  summarize(_conversationId: string, _messages: MessageRecord[]): Promise<SummaryResult> {
    return Promise.resolve({
      summary: "",
      tags: [],
      keywords: [],
      places: [],
      flags: { summaryError: true },
      summaryError: "fail"
    });
  }
}

class KeywordSummarizer {
  summarize(_conversationId: string, _messages: MessageRecord[]): Promise<SummaryResult> {
    return Promise.resolve({
      summary: "keywords summary",
      tags: ["t"],
      keywords: ["apple", "kitchen"],
      places: ["kitchen"],
      flags: { explicit: false, forbidden: false }
    });
  }
}

function makeMessage(role: MessageRecord["role"], content: unknown, extras: Record<string, unknown> = {}) {
  return { _getType: () => role, content, ...extras };
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
  const keeper = new RecordKeeper(redisClient, {
    idleMs: 10,
    summarizer: new StubSummarizer() as unknown as ConversationSummaryService
  });

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
  assert.equal(toolMetrics["ok"], "1");
  assert.equal(toolMetrics["fail"], "1");

  const modelMetrics = await redisClient.hgetall("bernard:rk:metrics:model:modelA:openrouter");
  assert.equal(modelMetrics["ok"], "1");
  assert.equal(modelMetrics["fail"] ?? "0", "0");
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

void test("reports status snapshot", async () => {
  const redis = new FakeRedis();
  const redisClient = redis as unknown as Redis;
  const keeper = new RecordKeeper(redisClient, { idleMs: 5 * 60 * 1000 });

  const { requestId, conversationId } = await keeper.startRequest("token-status", "model-x");
  await keeper.appendMessages(conversationId, []);
  const turnId = await keeper.startTurn(requestId, conversationId, "token-status", "model-x");
  await keeper.endTurn(turnId, { status: "ok", latencyMs: 42 });

  const status = await keeper.getStatus();

  assert.equal(status.activeConversations, 1);
  assert.equal(status.tokensActive, 1);
  assert.equal(status.totalRequests, 1);
  assert.equal(status.totalTurns, 1);
  assert.equal(status.errorTurns, 0);
  assert.ok(status.lastActivityAt);
});

void test("starts new conversation after idle cutoff and seeds sets", async () => {
  const redis = new FakeRedis();
  const redisClient = redis as unknown as Redis;
  const keeper = new RecordKeeper(redisClient, { idleMs: 5 });

  const first = await keeper.startRequest("tok-new", "m-one", { place: "kitchen" });
  const oldScore = Date.now() - 1000;
  await redis.zadd("bernard:rk:convs:active", oldScore, first.conversationId);
  await redis.zadd("bernard:rk:token:tok-new:convs", oldScore, first.conversationId);

  const second = await keeper.startRequest("tok-new", "m-two", { place: "kitchen" });

  assert.notEqual(first.conversationId, second.conversationId);
  assert.equal(second.isNewConversation, true);

  const convo = await redis.hgetall(`bernard:rk:conv:${second.conversationId}`);
  assert.equal(convo.status, "open");
  assert.equal(convo.requestCount, "1");
  assert.ok(JSON.parse(convo.tokenSet).includes("tok-new"));
  assert.ok(JSON.parse(convo.modelSet).includes("m-two"));
  assert.ok(JSON.parse(convo.placeTags).includes("kitchen"));
});

void test("startTurn merges token and model sets", async () => {
  const redis = new FakeRedis();
  const redisClient = redis as unknown as Redis;
  const keeper = new RecordKeeper(redisClient);
  const { conversationId } = await keeper.startRequest("tok-a", "model-a");

  const turnId = await keeper.startTurn("req-a", conversationId, "tok-b", "model-b", 4);

  const raw = await redis.hgetall(`bernard:rk:conv:${conversationId}`);
  assert.deepEqual(JSON.parse(raw.tokenSet).sort(), ["tok-a", "tok-b"].sort());
  assert.deepEqual(JSON.parse(raw.modelSet).sort(), ["model-a", "model-b"].sort());

  const convo = await keeper.getConversation(conversationId);
  assert.deepEqual(new Set(convo?.tokenSet), new Set(["tok-a", "tok-b"]));
  assert.deepEqual(new Set(convo?.modelSet), new Set(["model-a", "model-b"]));

  const turn = await redis.hgetall(`bernard:rk:turn:${turnId}`);
  assert.equal(turn.tokensIn, "4");
});

void test("endTurn records errors and increments metrics", async () => {
  const redis = new FakeRedis();
  const keeper = new RecordKeeper(redis as unknown as Redis);
  const { conversationId } = await keeper.startRequest("tok-err", "model-err");
  const turnId = await keeper.startTurn("req-err", conversationId, "tok-err", "model-err");

  await keeper.endTurn(turnId, { status: "error", latencyMs: 12, errorType: "upstream" });

  const turn = await redis.hgetall(`bernard:rk:turn:${turnId}`);
  assert.equal(turn.status, "error");
  assert.equal(turn.errorType, "upstream");
  const metrics = await redis.hgetall("bernard:rk:metrics:turns");
  assert.equal(metrics.error, "1");
});

void test("recordToolResult updates turn error and metrics", async () => {
  const redis = new FakeRedis();
  const keeper = new RecordKeeper(redis as unknown as Redis);
  const { conversationId } = await keeper.startRequest("tok-tool", "model-tool");
  const turnId = await keeper.startTurn("req-tool", conversationId, "tok-tool", "model-tool");

  await keeper.recordToolResult(turnId, "toolY", { ok: false, latencyMs: 25, errorType: "timeout" });

  const turn = await redis.hgetall(`bernard:rk:turn:${turnId}`);
  assert.equal(turn.errorType, "timeout");
  const metrics = await redis.hgetall("bernard:rk:metrics:tool:toolY");
  assert.equal(metrics.fail, "1");
  assert.equal(metrics["error:timeout"], "1");
});

void test("recordOpenRouterResult updates latency, tokens, and errors", async () => {
  const redis = new FakeRedis();
  const keeper = new RecordKeeper(redis as unknown as Redis);
  const { conversationId } = await keeper.startRequest("tok-orr", "model-orr");
  const turnId = await keeper.startTurn("req-orr", conversationId, "tok-orr", "model-orr");

  await keeper.recordOpenRouterResult(turnId, "model-orr", {
    ok: false,
    latencyMs: 40,
    tokensIn: 3,
    tokensOut: 7,
    errorType: "bad_response"
  });

  const turn = await redis.hgetall(`bernard:rk:turn:${turnId}`);
  assert.equal(turn.tokensIn, "3");
  assert.equal(turn.tokensOut, "7");
  assert.equal(turn.errorType, "bad_response");

  const latency = await redis.hgetall("bernard:rk:metrics:model:model-orr:latency");
  assert.equal(latency.sum_ms, "40");
  assert.equal(latency.count, "1");

  const tokens = await redis.hgetall("bernard:rk:metrics:model:model-orr:tokens");
  assert.equal(tokens.in, "3");
  assert.equal(tokens.out, "7");

  const modelMetrics = await redis.hgetall("bernard:rk:metrics:model:model-orr:openrouter");
  assert.equal(modelMetrics.fail, "1");
  assert.equal(modelMetrics["error:bad_response"], "1");
});

void test("recordRateLimit tracks token and model failures", async () => {
  const redis = new FakeRedis();
  const keeper = new RecordKeeper(redis as unknown as Redis);

  await keeper.recordRateLimit("tok-rl", "model-rl", "quota");

  const tokenMetrics = await redis.hgetall("bernard:rk:metrics:token:tok-rl:ratelimit");
  assert.equal(tokenMetrics.denied, "1");
  const modelMetrics = await redis.hgetall("bernard:rk:metrics:model:model-rl:openrouter");
  assert.equal(modelMetrics.fail, "1");
  assert.equal(modelMetrics["error:quota"], "1");
});

void test("appendMessages normalizes content and counts tool calls", async () => {
  const redis = new FakeRedis();
  const keeper = new RecordKeeper(redis as unknown as Redis);
  const { conversationId } = await keeper.startRequest("tok-msg", "model-msg");
  const before = await keeper.getConversation(conversationId);

  const assistantMsg = makeMessage("assistant", [{ text: "hi" }], {
    usage_metadata: { input_tokens: 2, output_tokens: 5 },
    response_metadata: { meta: true },
    tool_calls: [{ id: "call-1" }]
  });
  const toolMsg = makeMessage("tool", { ok: true });

  await keeper.appendMessages(conversationId, [assistantMsg, toolMsg]);

  const messages = await keeper.getMessages(conversationId);
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0].tokenDeltas, { in: 2, out: 5 });
  assert.equal(messages[0].role, "assistant");
  assert.equal(messages[1].role, "tool");

  const convo = await keeper.getConversation(conversationId);
  assert.ok(convo?.lastTouchedAt);
  assert.equal(convo?.messageCount, 2);
  assert.equal(convo?.toolCallCount, 2);
  const beforeTouched = Date.parse(before?.lastTouchedAt ?? "");
  const afterTouched = Date.parse(convo?.lastTouchedAt ?? "");
  assert.ok(afterTouched >= beforeTouched);
});

void test("getMessages supports limits and skips malformed entries", async () => {
  const redis = new FakeRedis();
  const keeper = new RecordKeeper(redis as unknown as Redis);
  const { conversationId } = await keeper.startRequest("tok-limit", "model-limit");

  await keeper.appendMessages(conversationId, [makeMessage("user", "first"), makeMessage("assistant", "second")]);
  await redis.rpush(`bernard:rk:conv:${conversationId}:msgs`, "not-json");
  await keeper.appendMessages(conversationId, [makeMessage("assistant", "tail")]);

  const limited = await keeper.getMessages(conversationId, 1);
  assert.equal(limited.length, 1);
  assert.equal(limited[0].content, "tail");

  const all = await keeper.getMessages(conversationId);
  assert.equal(all.length, 3);
});

void test("closeConversation records summary errors in closeReason", async () => {
  const redis = new FakeRedis();
  const keeper = new RecordKeeper(redis as unknown as Redis, {
    summarizer: new ErrorSummarizer() as unknown as ConversationSummaryService
  });
  const { conversationId } = await keeper.startRequest("tok-close", "model-close");

  await keeper.closeConversation(conversationId, "manual");
  const convo = await keeper.getConversation(conversationId);

  assert.equal(convo?.status, "closed");
  assert.ok(convo?.closeReason?.includes("summary_error:fail"));
  assert.equal(convo?.flags?.summaryError, true);
});

void test("closeIfIdle closes all idle conversations", async () => {
  const redis = new FakeRedis();
  const keeper = new RecordKeeper(redis as unknown as Redis, { idleMs: 10 });
  const first = await keeper.startRequest("tok-idle", "model-idle");
  const second = await keeper.startRequest("tok-idle2", "model-idle");

  await keeper.closeIfIdle(Date.now() + 20);

  const convo1 = await keeper.getConversation(first.conversationId);
  const convo2 = await keeper.getConversation(second.conversationId);
  assert.equal(convo1?.status, "closed");
  assert.equal(convo2?.status, "closed");
});

void test("recallConversation filters by keywords and place", async () => {
  const redis = new FakeRedis();
  const keeper = new RecordKeeper(redis as unknown as Redis, {
    summarizer: new KeywordSummarizer() as unknown as ConversationSummaryService
  });
  const { conversationId } = await keeper.startRequest("tok-recall", "model-recall", { place: "kitchen" });
  await keeper.appendMessages(conversationId, [makeMessage("user", "hi there")]);
  await keeper.closeConversation(conversationId, "done");

  const recalled = await keeper.recallConversation({
    keywords: ["apple"],
    place: "kitchen",
    includeMessages: true,
    messageLimit: 1
  });

  assert.equal(recalled.length, 1);
  assert.equal(recalled[0].conversation.id, conversationId);
  assert.ok(recalled[0].messages?.length);
});

void test("reopenConversation handles missing and adds tokens to sets", async () => {
  const redis = new FakeRedis();
  const keeper = new RecordKeeper(redis as unknown as Redis);

  const missing = await keeper.reopenConversation("missing", "tok-missing");
  assert.equal(missing, null);

  const { conversationId } = await keeper.startRequest("tok-reopen", "model-reopen");
  await keeper.closeConversation(conversationId, "done");
  const reopened = await keeper.reopenConversation(conversationId, "tok-new");

  assert.ok(reopened);
  assert.equal(reopened?.status, "open");
  assert.ok(reopened?.tokenSet?.includes("tok-new"));

  const tokenZ = await redis.zrevrange("bernard:rk:token:tok-new:convs", 0, 0);
  assert.deepEqual(tokenZ, [conversationId]);
});

void test("getStatus falls back to most recent closed conversation", async () => {
  const redis = new FakeRedis();
  const keeper = new RecordKeeper(redis as unknown as Redis);
  const { conversationId } = await keeper.startRequest("tok-status", "model-status");
  await keeper.closeConversation(conversationId, "done");

  const status = await keeper.getStatus();
  assert.equal(status.activeConversations, 0);
  assert.equal(status.closedConversations, 1);
  assert.ok(status.lastActivityAt);
});

void test("listConversations drops stale zset references", async () => {
  const redis = new FakeRedis();
  const keeper = new RecordKeeper(redis as unknown as Redis);
  await redis.zadd("bernard:rk:convs:active", Date.now(), "ghost");

  const list = await keeper.listConversations();
  assert.equal(list.length, 0);

  const remaining = await redis.zcard("bernard:rk:convs:active");
  assert.equal(remaining, 0);
});

void test("getConversationWithMessages applies message limit", async () => {
  const redis = new FakeRedis();
  const keeper = new RecordKeeper(redis as unknown as Redis);
  const { conversationId } = await keeper.startRequest("tok-cwm", "model-cwm");
  await keeper.appendMessages(conversationId, [
    makeMessage("user", "one"),
    makeMessage("assistant", "two"),
    makeMessage("assistant", "three")
  ]);

  const result = await keeper.getConversationWithMessages(conversationId, 2);
  assert.ok(result);
  assert.equal(result?.messages.length, 2);
  assert.equal(result?.conversation.messageCount, 3);
});

void test("countConversations tallies open and closed", async () => {
  const redis = new FakeRedis();
  const keeper = new RecordKeeper(redis as unknown as Redis);
  const first = await keeper.startRequest("tok-count", "model-count");
  const second = await keeper.startRequest("tok-count2", "model-count2");
  await keeper.closeConversation(first.conversationId, "done");

  const counts = await keeper.countConversations();
  assert.deepEqual(counts, { active: 1, closed: 1, total: 2 });
});

