import assert from "node:assert/strict";
import { test } from "vitest";

import { RecordKeeper } from "../agent/recordKeeper/conversation.keeper";
import type { SummaryResult } from "../lib/conversation/summary";
import type { MessageRecord, OpenRouterResult, ToolResult } from "../lib/conversation/types";
import { FakeRedis } from "./fakeRedis";

const NS = "bernard:rk";
const MET_NS = "bernard:rk:metrics";

/**
 * Creates a RecordKeeper wired to a fresh in-memory Redis double.
 */
function createKeeper(opts: Record<string, unknown> = {}) {
  const redis = new FakeRedis();
  const keeper = new RecordKeeper(redis as any, { queueDisabled: true, ...opts });
  return { redis, keeper };
}

test("startRequest handles creation, reopen, and active reuse", { timeout: 5000 }, async (t) => {
  (t as any).test = async (_name: string, fn: () => unknown) => await fn();
  await t.test("creates a new conversation with counters and sets", async () => {
    const { redis, keeper } = createKeeper();
    const { conversationId, requestId, isNewConversation } = await keeper.startRequest("token-1", "model-a", {
      place: "kitchen",
      clientMeta: { app: "test" }
    });

    assert.ok(isNewConversation);

    const conv = await redis.hgetall(`${NS}:conv:${conversationId}`);
    assert.equal(conv.status, "open");
    assert.equal(conv.messageCount, "0");
    assert.equal(conv.toolCallCount, "0");
    assert.equal(conv.requestCount, "1");
    assert.equal(conv.placeTags, JSON.stringify(["kitchen"]));
    assert.deepEqual(JSON.parse(conv.modelSet), ["model-a"]);
    assert.deepEqual(JSON.parse(conv.tokenSet), ["token-1"]);
    assert.equal(conv.lastTouchedAt, conv.lastRequestAt);
    assert.ok(conv.startedAt);

    const req = await redis.hgetall(`${NS}:req:${requestId}`);
    assert.equal(req.conversationId, conversationId);
    assert.equal(req.token, "token-1");
    assert.equal(req.modelUsed, "model-a");
    assert.equal(req.initialPlace, "kitchen");
    assert.equal(req.clientMeta, JSON.stringify({ app: "test" }));

    const activeCount = await redis.zcard(`${NS}:convs:active`);
    const requestIds = await redis.zrevrange(`${NS}:conv:${conversationId}:requests`, 0, -1);
    assert.equal(activeCount, 1);
    assert.deepEqual(requestIds, [requestId]);
  });

  await t.test("creates a conversation without place tags", async () => {
    const { redis, keeper } = createKeeper();
    const { conversationId } = await keeper.startRequest("token-plain", "model-plain");
    const conv = await redis.hgetall(`${NS}:conv:${conversationId}`);
    assert.equal(conv.placeTags, "");
  });

  await t.test("reopens a closed conversation and clears close metadata", async () => {
    const { redis, keeper } = createKeeper();
    const convId = "conv-existing";
    const ts = new Date("2025-01-02T00:00:00Z").toISOString();

    await redis.hset(`${NS}:conv:${convId}`, {
      status: "closed",
      startedAt: ts,
      lastTouchedAt: ts,
      closedAt: ts,
      closeReason: "idle",
      requestCount: 2
    });
    await redis.zadd(`${NS}:convs:closed`, Date.parse(ts), convId);

    const { isNewConversation } = await keeper.startRequest("token-2", "model-b", { conversationId: convId });
    assert.equal(isNewConversation, false);

    const conv = await redis.hgetall(`${NS}:conv:${convId}`);
    assert.equal(conv.status, "open");
    assert.equal(conv.closedAt, "");
    assert.equal(conv.closeReason, "");
    assert.equal(conv.requestCount, "3");
    assert.ok(conv.lastTouchedAt);
    assert.equal(await redis.zcard(`${NS}:convs:closed`), 0);
  });

  await t.test("reuses an active conversation for the same token", async () => {
    const idleMs = 10 * 1000;
    const { redis, keeper } = createKeeper({ idleMs });
    const convId = "conv-active";
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    await redis.hset(`${NS}:conv:${convId}`, { status: "open", startedAt: nowIso, lastTouchedAt: nowIso });
    await redis.zadd(`${NS}:convs:active`, now - 1000, convId);
    await redis.zadd(`${NS}:token:token-3:convs`, now - 1000, convId);

    const result = await keeper.startRequest("token-3", "model-c");
    assert.equal(result.conversationId, convId);
    assert.equal(result.isNewConversation, false);

    const conv = await redis.hgetall(`${NS}:conv:${convId}`);
    assert.equal(conv.requestCount, "1");
  });
});

test("turn lifecycle, metrics, and tool/model recording", { timeout: 5000 }, async (t) => {
  (t as any).test = async (_name: string, fn: () => unknown) => await fn();
  await t.test("startTurn merges sets and endTurn records metrics", async () => {
    const { redis, keeper } = createKeeper();
    const { conversationId, requestId } = await keeper.startRequest("token-turn", "model-turn");
    const turnId = await keeper.startTurn(requestId, conversationId, "token-turn", "model-turn", 11);
    await keeper.endTurn(turnId, { status: "ok", tokensIn: 11, tokensOut: 7, latencyMs: 30 });

    const turn = await redis.hgetall(`${NS}:turn:${turnId}`);
    assert.equal(turn.requestId, requestId);
    assert.equal(turn.tokensIn, "11");
    assert.equal(turn.tokensOut, "7");
    assert.equal(turn.latencyMs, "30");

    const conv = await redis.hgetall(`${NS}:conv:${conversationId}`);
    assert.deepEqual(JSON.parse(conv.modelSet), ["model-turn"]);
    assert.deepEqual(JSON.parse(conv.tokenSet), ["token-turn"]);

    const metrics = await redis.hgetall(`${MET_NS}:turns`);
    assert.equal(metrics.count, "1");
  });

  await t.test("endTurn errors increment metrics", async () => {
    const { redis, keeper } = createKeeper();
    const { conversationId, requestId } = await keeper.startRequest("token-turn-err", "model-turn-err");
    const turnId = await keeper.startTurn(requestId, conversationId, "token-turn-err", "model-turn-err");
    await keeper.endTurn(turnId, { status: "error", latencyMs: 42, errorType: "failure" });

    const turn = await redis.hgetall(`${NS}:turn:${turnId}`);
    assert.equal(turn.status, "error");
    assert.equal(turn.errorType, "failure");

    const metrics = await redis.hgetall(`${MET_NS}:turns`);
    assert.equal(metrics.error, "1");
  });

  await t.test("completeRequest stores latency", async () => {
    const { redis, keeper } = createKeeper();
    const { requestId } = await keeper.startRequest("token-complete", "model-complete");
    await keeper.completeRequest(requestId, 123);
    const req = await redis.hgetall(`${NS}:req:${requestId}`);
    assert.equal(req.latencyMs, "123");
  });

  await t.test("records tool and OpenRouter results", async () => {
    const { redis, keeper } = createKeeper();
    const { conversationId, requestId } = await keeper.startRequest("token-tool", "model-tool");
    const turnId = await keeper.startTurn(requestId, conversationId, "token-tool", "model-tool");

    const okResult: ToolResult = { ok: true, latencyMs: 15 };
    const badResult: ToolResult = { ok: false, latencyMs: 22, errorType: "timeout" };
    await keeper.recordToolResult(turnId, "search", okResult);
    await keeper.recordToolResult(turnId, "search", badResult);

    const toolMetrics = await redis.hgetall(`${MET_NS}:tool:search`);
    assert.equal(toolMetrics.ok, "1");
    assert.equal(toolMetrics.fail, "1");
    assert.equal(toolMetrics["error:timeout"], "1");

    const toolTurn = await redis.hgetall(`${NS}:turn:${turnId}`);
    assert.equal(toolTurn.errorType, "timeout");

    const goodOpenRouter: OpenRouterResult = { ok: true, latencyMs: 50, tokensIn: 5, tokensOut: 7 };
    const badOpenRouter: OpenRouterResult = { ok: false, errorType: "bad_input" };
    await keeper.recordOpenRouterResult(turnId, "model-x", goodOpenRouter);
    await keeper.recordOpenRouterResult(turnId, "model-x", badOpenRouter);

    const latencyMetrics = await redis.hgetall(`${MET_NS}:model:model-x:latency`);
    assert.equal(latencyMetrics.count, "1");
    assert.equal(latencyMetrics.sum_ms, "50");
    assert.equal(latencyMetrics.sum_sqr_ms, "2500");

    const tokenMetrics = await redis.hgetall(`${MET_NS}:model:model-x:tokens`);
    assert.equal(tokenMetrics.in, "5");
    assert.equal(tokenMetrics.out, "7");

    const modelMetrics = await redis.hgetall(`${MET_NS}:model:model-x:openrouter`);
    assert.equal(modelMetrics.ok, "1");
    assert.equal(modelMetrics.fail, "1");
    assert.equal(modelMetrics["error:bad_input"], "1");

    const turnAfter = await redis.hgetall(`${NS}:turn:${turnId}`);
    assert.equal(turnAfter.tokensIn, "5");
    assert.equal(turnAfter.tokensOut, "7");
    assert.equal(turnAfter.latencyMs, "50");
    assert.equal(turnAfter.errorType, "bad_input");
  });

  await t.test("recordToolResult handles failures without error type", async () => {
    const { redis, keeper } = createKeeper();
    const { conversationId, requestId } = await keeper.startRequest("token-tool2", "model-tool2");
    const turnId = await keeper.startTurn(requestId, conversationId, "token-tool2", "model-tool2");

    await keeper.recordToolResult(turnId, "noerror", { ok: false, latencyMs: 5 });

    const turn = await redis.hgetall(`${NS}:turn:${turnId}`);
    assert.equal(turn.errorType, undefined);
    const metrics = await redis.hgetall(`${MET_NS}:tool:noerror`);
    assert.equal(metrics.fail, "1");
  });
});

test("message persistence, tracing, and export", { timeout: 5000 }, async (t) => {
  (t as any).test = async (_name: string, fn: () => unknown) => await fn();
  await t.test("appendMessages updates counters and stores records", async () => {
    const { redis, keeper } = createKeeper();
    const { conversationId } = await keeper.startRequest("token-msg", "model-msg");
    const now = new Date().toISOString();

    const messages: MessageRecord[] = [
      {
        id: "m1",
        role: "assistant",
        content: "call",
        createdAt: now,
        tool_calls: [{ id: "tool-1", type: "function", name: "lookup", function: { name: "lookup", arguments: "{}" } }]
      },
      { id: "m2", role: "tool", name: "lookup", content: "result", tool_call_id: "tool-1", createdAt: now },
      { id: "m3", role: "system", name: "orchestrator.error", content: "failed", createdAt: now },
      { id: "m4", role: "user", content: "next", createdAt: now }
    ];

    await keeper.appendMessages(conversationId, messages);

    const conv = await redis.hgetall(`${NS}:conv:${conversationId}`);
    assert.equal(conv.messageCount, "4");
    assert.equal(conv.toolCallCount, "2");
    assert.equal(conv.errorCount, "1");
    assert.equal(conv.userAssistantCount, "2");
    assert.ok(conv.lastTouchedAt);

    const stored = await keeper.getMessages(conversationId);
    assert.equal(stored.length, 4);
  });

  await t.test("appendMessages is a no-op for empty input", async () => {
    const { redis, keeper } = createKeeper();
    const { conversationId } = await keeper.startRequest("token-msg-empty", "model-msg-empty");

    await keeper.appendMessages(conversationId, []);

    const conv = await redis.hgetall(`${NS}:conv:${conversationId}`);
    assert.equal(conv.messageCount, "0");
  });

  await t.test("recordLLMCall trims context and previews content", async () => {
    const { keeper } = createKeeper();
    const { conversationId, requestId } = await keeper.startRequest("token-trace", "model-trace");
    const context: MessageRecord[] = [
      { id: "c1", role: "user", content: "first", createdAt: "2025-01-01T00:00:00Z" },
      { id: "c2", role: "assistant", content: "a very long content value", createdAt: "2025-01-01T00:00:01Z" },
      { id: "c3", role: "user", content: "third", createdAt: "2025-01-01T00:00:02Z" }
    ];
    const result: MessageRecord = { id: "r1", role: "assistant", content: "done", createdAt: "2025-01-01T00:00:03Z" };

    await keeper.recordLLMCall(conversationId, {
      model: "trace-model",
      context,
      result,
      contextLimit: 2,
      contentPreviewChars: 4,
      tokens: { in: 10, out: 5 },
      requestId,
      turnId: "turn-xyz",
      stage: "plan",
      tools: [{ name: "tool" }]
    });

    const messages = await keeper.getMessages(conversationId);
    const trace = messages.at(-1)!;
    assert.equal(trace.name, "llm_call.plan");
    const traceContent = trace.content as { context: Array<{ content: string }> };
    assert.equal(traceContent.context.length, 2);
    const preview = traceContent.context[0].content;
    assert.ok(preview.endsWith("…"));
    assert.ok(preview.length <= 6);
    assert.equal((trace.metadata as { traceType?: string }).traceType, "llm_call");
  });

  await t.test("getFullConversation maps records to OpenAI messages", async () => {
    const { keeper } = createKeeper();
    const { conversationId } = await keeper.startRequest("token-export", "model-export");
    await keeper.appendMessages(conversationId, [
      { id: "u1", role: "user", content: "hi", createdAt: new Date().toISOString() }
    ]);

    const result = await keeper.getFullConversation(conversationId);
    assert.equal(result.records.length, 1);
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].role, "user");
  });

  await t.test("recordLLMCall keeps content when preview not requested", async () => {
    const { keeper } = createKeeper();
    const { conversationId } = await keeper.startRequest("token-trace2", "model-trace2");
    const context: MessageRecord[] = [
      { id: "c1", role: "user", content: "short", createdAt: "2025-01-01T00:00:00Z" }
    ];

    await keeper.recordLLMCall(conversationId, { model: "trace2", context, result: undefined });
    const messages = await keeper.getMessages(conversationId);
    const trace = messages.at(-1)!;
    const traceContext = (trace.content as { context: Array<{ content: string }> }).context;
    assert.equal(traceContext[0].content, "short");
  });
});

test("rate limits, close lifecycle, idle handling, and deletion", { timeout: 5000 }, async (t) => {
  (t as any).test = async (_name: string, fn: () => unknown) => await fn();
  await t.test("records rate limits", async () => {
    const { redis, keeper } = createKeeper();
    await keeper.recordRateLimit("token-rl", "model-rl", "quota");

    const tokenMetrics = await redis.hgetall(`${MET_NS}:token:token-rl:ratelimit`);
    const modelMetrics = await redis.hgetall(`${MET_NS}:model:model-rl:openrouter`);
    assert.equal(tokenMetrics.denied, "1");
    assert.equal(modelMetrics.fail, "1");
    assert.equal(modelMetrics["error:quota"], "1");
  });

  await t.test("closeConversation writes summary and errors, closeIfIdle closes old convs", async () => {
    const summary: SummaryResult = {
      summary: "wrapped up",
      tags: ["tag1"],
      flags: { important: true },
      keywords: ["alpha"],
      places: ["kitchen"]
    };
    const summarizer = { summarize: async () => summary };
    const { keeper } = createKeeper({ summarizer });
    const { conversationId } = await keeper.startRequest("token-close", "model-close");
    await keeper.appendMessages(conversationId, [
      { id: "m1", role: "user", content: "hi", createdAt: new Date().toISOString() }
    ]);

    await keeper.closeConversation(conversationId, "manual");
    const closed = await keeper.getConversation(conversationId);
    assert.equal(closed?.status, "closed");
    assert.equal(closed?.summary, "wrapped up");
    assert.equal(closed?.tags?.[0], "tag1");
    assert.equal(closed?.closeReason, "manual");

    // Summary error path
    const summarizerWithError = { summarize: async () => ({ summaryError: "fail" }) as SummaryResult };
    const { keeper: keeperError } = createKeeper({ summarizer: summarizerWithError });
    const { conversationId: convErr } = await keeperError.startRequest("token-close-err", "model-close-err");
    await keeperError.closeConversation(convErr, "manual");
    const closedErr = await keeperError.getConversation(convErr);
    assert.ok(closedErr?.closeReason?.includes("summary_error:fail"));

    // Idle closing
    const { redis: redisIdle, keeper: keeperIdle } = createKeeper({ idleMs: 1000 });
    const { conversationId: idleConv } = await keeperIdle.startRequest("token-idle", "model-idle");
    await redisIdle.zadd(`${NS}:convs:active`, Date.now() - 2000, idleConv);
    await keeperIdle.closeIfIdle(Date.now());
    const idleClosed = await keeperIdle.getConversation(idleConv);
    assert.equal(idleClosed?.status, "closed");
  });

  await t.test("closeConversation calls summarizer", async () => {
    let called = 0;
    const summarizer = {
      async summarize() {
        called += 1;
        return { summary: "done" } as SummaryResult;
      }
    };
    const { keeper } = createKeeper({ summarizer });
    const { conversationId } = await keeper.startRequest("token-summary", "model-summary");
    await keeper.closeConversation(conversationId, "manual");
    assert.equal(called, 1);
  });

  await t.test("closeIfIdle handles multiple idle conversations", async () => {
    const { redis, keeper } = createKeeper({ idleMs: 1000 });
    const now = Date.now();
    const convA = "conv-a";
    const convB = "conv-b";
    await redis.hset(`${NS}:conv:${convA}`, {
      status: "open",
      startedAt: new Date(now - 2000).toISOString(),
      lastTouchedAt: new Date(now - 2000).toISOString()
    });
    await redis.hset(`${NS}:conv:${convB}`, {
      status: "open",
      startedAt: new Date(now - 3000).toISOString(),
      lastTouchedAt: new Date(now - 3000).toISOString()
    });
    await redis.zadd(`${NS}:convs:active`, now - 2000, convA);
    await redis.zadd(`${NS}:convs:active`, now - 3000, convB);

    await keeper.closeIfIdle(now);
    const aStatus = await keeper.getConversation(convA);
    const bStatus = await keeper.getConversation(convB);
    assert.equal(aStatus?.status, "closed");
    assert.equal(bStatus?.status, "closed");
  });

  await t.test("closeIfIdle is a no-op when nothing is idle", async () => {
    const { keeper } = createKeeper({ idleMs: 1000 });
    await keeper.closeIfIdle(Date.now());
  });

  await t.test("closeConversation is safe for missing or already closed conversations", async () => {
    const { keeper, redis } = createKeeper();
    await keeper.closeConversation("missing-conv", "none");

    const convId = "conv-closed";
    const ts = new Date().toISOString();
    await redis.hset(`${NS}:conv:${convId}`, { status: "closed", startedAt: ts, lastTouchedAt: ts });
    await keeper.closeConversation(convId, "repeat");
    const stored = await keeper.getConversation(convId);
    assert.equal(stored?.status, "closed");
  });

  await t.test("deleteConversation removes all related keys", async () => {
    const { redis, keeper } = createKeeper();
    const { conversationId, requestId } = await keeper.startRequest("token-del", "model-del");
    const turnId = await keeper.startTurn(requestId, conversationId, "token-del", "model-del");
    await keeper.appendMessages(conversationId, [
      { id: "m-del", role: "user", content: "hi", createdAt: new Date().toISOString() }
    ]);
    await redis.zadd(`${NS}:conv:${conversationId}:requests`, Date.now(), requestId);
    await redis.zadd(`${NS}:conv:${conversationId}:turns`, Date.now(), turnId);

    const deleted = await keeper.deleteConversation(conversationId);
    assert.equal(deleted, true);
    assert.equal(await redis.exists(`${NS}:conv:${conversationId}`), 0);
    assert.equal(await redis.exists(`${NS}:req:${requestId}`), 0);
    assert.equal(await redis.exists(`${NS}:turn:${turnId}`), 0);
    assert.equal(await redis.zcard(`${NS}:convs:active`), 0);
    assert.equal(await redis.zcard(`${NS}:convs:closed`), 0);
  });

  await t.test("deleteConversation returns false when missing", async () => {
    const { keeper } = createKeeper();
    const deleted = await keeper.deleteConversation("missing");
    assert.equal(deleted, false);
  });
});

test("status reporting, recall, reopening, and listing", { timeout: 5000 }, async (t) => {
  (t as any).test = async (_name: string, fn: () => unknown) => await fn();
  await t.test("getStatus reports empty state", async () => {
    const { keeper } = createKeeper();
    const status = await keeper.getStatus();
    assert.equal(status.activeConversations, 0);
    assert.equal(status.closedConversations, 0);
    assert.equal(status.tokensActive, 0);
    assert.equal(status.lastActivityAt, undefined);
  });

  await t.test("getStatus reports counts and last activity", async () => {
    const { redis, keeper } = createKeeper();
    const { conversationId } = await keeper.startRequest("token-status", "model-status");
    const statusActive = await keeper.getStatus();
    assert.equal(statusActive.activeConversations, 1);
    assert.equal(statusActive.closedConversations, 0);
    assert.equal(statusActive.tokensActive, 1);
    assert.ok(statusActive.lastActivityAt);

    // Move to closed to hit fallback branch.
    await keeper.closeConversation(conversationId, "manual");
    const statusClosed = await keeper.getStatus();
    assert.equal(statusClosed.activeConversations, 0);
    assert.equal(statusClosed.closedConversations, 1);
    assert.ok(statusClosed.lastActivityAt);
  });

  await t.test("recallConversation supports direct ID lookup and filtered search", async () => {
    const { keeper } = createKeeper();
    const { conversationId } = await keeper.startRequest("token-recall", "model-recall");
    const nowIso = new Date().toISOString();
    await keeper.appendMessages(conversationId, [{ id: "r1", role: "user", content: "hello", createdAt: nowIso }]);
    await keeper.closeConversation(conversationId, "done");

    const direct = await keeper.recallConversation({ conversationId, includeMessages: true, messageLimit: 1 });
    assert.equal(direct.length, 1);
    assert.equal(direct[0].conversation.id, conversationId);
    assert.equal(direct[0].messages?.length, 1);

    // Filtered search by token and keyword/place
    const { keeper: keeperSearch, redis: redisSearch } = createKeeper();
    const convId = "conv-filter";
    const startedAt = new Date("2025-01-03T00:00:00Z");
    await redisSearch.hset(`${NS}:conv:${convId}`, {
      status: "closed",
      startedAt: startedAt.toISOString(),
      lastTouchedAt: startedAt.toISOString(),
      keywords: JSON.stringify(["Bread"]),
      placeTags: "kitchen,pantry"
    });
    const score = startedAt.getTime();
    await redisSearch.zadd(`${NS}:convs:closed`, score, convId);
    await redisSearch.zadd(`${NS}:token:token-recall:convs`, score, convId);

    const filtered = await keeperSearch.recallConversation({
      token: "token-recall",
      timeRange: { since: score - 1000, until: score + 1000 },
      keywords: ["bread"],
      place: "kitchen",
      limit: 5,
      includeMessages: false
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].conversation.id, convId);
  });

  await t.test("reopenConversation reactivates and merges tokens without duplicates", async () => {
    const { redis, keeper } = createKeeper();
    const convId = "conv-reopen";
    const ts = new Date().toISOString();
    await redis.hset(`${NS}:conv:${convId}`, {
      status: "closed",
      startedAt: ts,
      lastTouchedAt: ts,
      tokenSet: JSON.stringify(["token-old"])
    });
    await redis.zadd(`${NS}:convs:closed`, Date.now(), convId);

    const reopened = await keeper.reopenConversation(convId, "token-new");
    assert.ok(reopened);
    assert.equal(reopened?.status, "open");
    assert.ok(reopened?.tokenSet?.includes("token-old"));
    assert.ok(reopened?.tokenSet?.includes("token-new"));

    const activeCard = await redis.zcard(`${NS}:convs:active`);
    assert.equal(activeCard, 1);
  });

  await t.test("reopenConversation no-ops when token already present", async () => {
    const { redis, keeper } = createKeeper();
    const convId = "conv-reopen-same";
    const ts = new Date().toISOString();
    await redis.hset(`${NS}:conv:${convId}`, {
      status: "closed",
      startedAt: ts,
      lastTouchedAt: ts,
      tokenSet: JSON.stringify(["token-same"])
    });
    await redis.zadd(`${NS}:convs:closed`, Date.now(), convId);

    const reopened = await keeper.reopenConversation(convId, "token-same");
    assert.ok(reopened);
    assert.equal(reopened?.tokenSet?.length, 1);
  });

  await t.test("reopenConversation returns null when conversation is missing", async () => {
    const { keeper } = createKeeper();
    const reopened = await keeper.reopenConversation("missing", "token");
    assert.equal(reopened, null);
  });

  await t.test("listConversations cleans stale entries and returns stats", async () => {
    const { redis, keeper } = createKeeper();
    const { conversationId } = await keeper.startRequest("token-list", "model-list");
    await keeper.appendMessages(conversationId, [
      {
        id: "tool-msg",
        role: "assistant",
        content: "call",
        tool_calls: [{ id: "t1", type: "function", name: "do", function: { name: "do", arguments: "{}" } }],
        createdAt: new Date().toISOString()
      }
    ]);
    await keeper.startTurn("req-x", conversationId, "token-list", "model-list");
    await redis.zadd(`${NS}:convs:active`, Date.now(), "stale-id");

    const list = await keeper.listConversations({ limit: 5, includeOpen: true, includeClosed: true });
    assert.equal(list.length, 1);
    assert.equal(list[0].id, conversationId);
    assert.ok(list[0].messageCount >= 1);
    assert.ok(list[0].toolCallCount >= 1);
    assert.ok(list[0].hasErrors === false);

    const activeAfter = await redis.zcard(`${NS}:convs:active`);
    assert.equal(activeAfter, 1);
  });

  await t.test("computes stats when counters are missing", async () => {
    const { keeper, redis } = createKeeper();
    const convId = "conv-nocounts";
    const startedAt = new Date("2025-01-04T00:00:00Z");

    await redis.hset(`${NS}:conv:${convId}`, {
      status: "open",
      startedAt: startedAt.toISOString(),
      lastTouchedAt: startedAt.toISOString()
    });
    await redis.zadd(`${NS}:convs:active`, startedAt.getTime(), convId);
    await redis.zadd(`${NS}:conv:${convId}:requests`, startedAt.getTime(), "req-nc");
    const turnId = "turn-nc";
    await redis.zadd(`${NS}:conv:${convId}:turns`, startedAt.getTime(), turnId);
    await redis.hset(`${NS}:turn:${turnId}`, { latencyMs: 99 });

    await redis.rpush(
      `${NS}:conv:${convId}:msgs`,
      JSON.stringify({
        id: "a1",
        role: "assistant",
        content: "hi",
        createdAt: startedAt.toISOString(),
        tool_calls: [{ id: "call", type: "function", name: "tool", function: { name: "tool", arguments: "{}" } }]
      })
    );
    await redis.rpush(
      `${NS}:conv:${convId}:msgs`,
      JSON.stringify({
        id: "t1",
        role: "tool",
        content: "result",
        tool_call_id: "call",
        createdAt: startedAt.toISOString()
      })
    );
    await redis.rpush(
      `${NS}:conv:${convId}:msgs`,
      JSON.stringify({
        id: "u1",
        role: "user",
        content: "hello",
        createdAt: startedAt.toISOString()
      })
    );

    const list = await keeper.listConversations({ includeOpen: true, includeClosed: false, limit: 10 });
    const conv = list.find((c) => c.id === convId)!;
    assert.equal(conv.messageCount, 3);
    assert.equal(conv.userAssistantCount, 2);
    assert.equal(conv.toolCallCount, 2);
    assert.equal(conv.requestCount, 1);
    assert.equal(conv.maxTurnLatencyMs, 99);
    assert.ok(conv.lastRequestAt);
  });

  await t.test("getConversationWithMessages, countConversations, and helpers", async () => {
    const { keeper, redis } = createKeeper();
    const { conversationId } = await keeper.startRequest("token-count", "model-count");
    await keeper.appendMessages(conversationId, [
      {
        id: "assistant-1",
        role: "assistant",
        content: "tool",
        tool_calls: [{ id: "tool-x", type: "function", name: "tool", function: { name: "tool", arguments: "{}" } }],
        createdAt: new Date().toISOString()
      },
      { id: "tool-1", role: "tool", content: "result", tool_call_id: "tool-x", createdAt: new Date().toISOString() }
    ]);
    await redis.zadd(`${NS}:conv:${conversationId}:requests`, Date.now(), "req-count");

    const withMessages = await keeper.getConversationWithMessages(conversationId, 10);
    assert.ok(withMessages);
    assert.equal(withMessages?.messages.length, 2);
    assert.ok(withMessages?.conversation.toolCallCount >= 1);

    const counts = await keeper.countConversations();
    assert.equal(counts.active, 1);
    assert.equal(counts.total, 1);

    // findActiveConversationForToken returns null when closed
    await redis.hset(`${NS}:conv:${conversationId}`, { status: "closed" });
    const active = await (keeper as any).findActiveConversationForToken("token-count", Date.now());
    assert.equal(active, null);
  });
});

test("recordLLMCallStart includes tools when provided", async () => {
  const { keeper } = createKeeper();
  const conversationId = "conv-tools-test";
  const messageId = "msg-tools-test";

  const tools = ["list_home_assistant_entities", "execute_home_assistant_service"];

  await keeper.recordLLMCallStart(conversationId, {
    messageId,
    model: "router",
    context: [],
    tools
  });

  const messages = await keeper.getMessages(conversationId);
  assert.equal(messages.length, 1);

  const trace = messages[0];
  assert.equal(trace.role, "system");
  assert.equal(trace.name, "llm_call");

  const content = trace.content as any;
  assert.equal(content.type, "llm_call");
  assert.equal(content.model, "router");
  assert.deepEqual(content.tools, tools);
});

