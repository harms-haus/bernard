import assert from "node:assert/strict";
import { beforeAll, test, vi } from "vitest";

import { NextRequest } from "next/server";

type Role = "system" | "human" | "ai" | "tool";

// shared mutable stubs
const state = {
  validateAccessTokenResult: { access: { token: "tok" } } as Record<string, unknown>,
  summarizerBehavior: "ok" as "ok" | "throw",
  primaryModels: {
    response: "resp-model",
    router: "router-model"
  },
  keeperHistory: [] as Array<Record<string, unknown>>
};

// Mocks for dependencies of openai.ts
vi.mock("@/lib/auth", () => ({
  validateAccessToken: async () => state.validateAccessTokenResult
}));

vi.mock("@/lib/conversation/summary", () => ({
  ConversationSummaryService: {
    create: async () => {
      if (state.summarizerBehavior === "throw") {
        throw new Error("no summarizer");
      }
      return { summarizer: true };
    }
  }
}));

class StubRecordKeeper {
  static instances: StubRecordKeeper[] = [];
  closed = false;
  requests: Array<unknown[]> = [];
  turns: Array<unknown[]> = [];
  constructor(public redis: unknown, public opts: Record<string, unknown>) {
    StubRecordKeeper.instances.push(this);
  }
  async closeIfIdle() {
    this.closed = true;
  }
  async startRequest(token: string, responseModel: string) {
    this.requests.push([token, responseModel]);
    return { requestId: "req-1", conversationId: "conv-1", isNewConversation: true };
  }
  async startTurn(requestId: string, conversationId: string, token: string, model: string) {
    this.turns.push([requestId, conversationId, token, model]);
    return "turn-1";
  }
  async getMessages() {
    return state.keeperHistory;
  }
}

vi.mock("@/agent/recordKeeper/conversation.keeper", () => ({
  RecordKeeper: StubRecordKeeper
}));

vi.mock("@/lib/config/models", () => ({
  getPrimaryModel: async (category: "response" | "router", opts?: { fallback?: string[] }) => {
    if (category === "response") return state.primaryModels.response;
    return state.primaryModels.router ?? opts?.fallback?.[0] ?? "router-fallback";
  }
}));

vi.mock("@/lib/infra/redis", () => ({
  getRedis: () => ({ redis: true })
}));

vi.mock("@/lib/conversation/messages", () => ({
  messageRecordToBaseMessage: (record: { role: Role; content?: string } | null) =>
    record
      ? ({
          content: record.content ?? record.role,
          type: record.role
        } as unknown)
      : null
}));

vi.mock("@/lib/agent", () => ({
  extractTokenUsage: () => ({ prompt_tokens: 1, completion_tokens: 2 }),
  mapOpenAIToMessages: (input: unknown) => [{ mapped: true, input }]
}));

// Import after mocks
let openai: Awaited<typeof import("../app/api/v1/_lib/openai")>;

beforeAll(async () => {
  openai = await import("../app/api/v1/_lib/openai");
});

const mkMessage = (role: Role, content: unknown = "") =>
  ({
    type: role,
    content
  }) as unknown as import("@langchain/core/messages").BaseMessage;

test("listModels returns bernard model", () => {
  const models = openai.listModels();
  assert.equal(models.length, 1);
  assert.equal(models[0]?.id, openai.BERNARD_MODEL_ID);
  assert.equal(models[0]?.owned_by, "bernard-v1");
});

test("validateAuth passes through error or token", async () => {
  state.validateAccessTokenResult = { error: "nope" };
  const req = new NextRequest(new Request("http://localhost/api"));
  const bad = await openai.validateAuth(req);
  assert.ok("error" in bad);

  state.validateAccessTokenResult = { access: { token: "abc" } };
  const ok = await openai.validateAuth(req);
  assert.deepEqual(ok, { token: "abc" });
});

test("createScaffolding uses models and keeper, handles summarizer success", async () => {
  state.summarizerBehavior = "ok";
  const result = await openai.createScaffolding({ token: "tok", responseModelOverride: "override-model" });
  assert.equal(result.responseModelName, "override-model");
  assert.equal(result.routerModelName, state.primaryModels.router);
  assert.equal(result.requestId, "req-1");
  assert.equal(result.turnId, "turn-1");
  const keeper = result.keeper as StubRecordKeeper;
  assert.ok(keeper.closed);
  assert.deepEqual(keeper.requests[0], ["tok", "override-model"]);
});

test("createScaffolding survives summarizer failure", async () => {
  state.summarizerBehavior = "throw";
  const result = await openai.createScaffolding({ token: "tok2" });
  assert.equal(result.responseModelName, state.primaryModels.response);
  assert.equal(result.routerModelName, state.primaryModels.router);
});

test("isBernardModel matches bernard-v1 or undefined", () => {
  assert.equal(openai.isBernardModel(undefined), true);
  assert.equal(openai.isBernardModel(openai.BERNARD_MODEL_ID), true);
  assert.equal(openai.isBernardModel("other"), false);
});

test("collectToolCalls stringifies args and keeps ids/names", () => {
  const calls = openai.collectToolCalls([
    {
      tool_calls: [
        { id: "x", function: { name: "foo", arguments: { a: 1 } } },
        { function: { name: "bar", arguments: "raw" } }
      ]
    } as unknown as import("@langchain/core/messages").BaseMessage
  ]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].id, "x");
  assert.ok(typeof calls[0].function.arguments === "string");
  assert.equal(calls[1].id, "bar");
});

test("extractUsageFromMessages forwards token usage when assistant present", () => {
  const usage = openai.extractUsageFromMessages([mkMessage("human"), mkMessage("ai")]);
  assert.deepEqual(usage, { prompt_tokens: 1, completion_tokens: 2 });
});

test("safeStringify falls back on stringify errors", () => {
  assert.equal(openai.safeStringify(BigInt(1)), "1");
  assert.equal(openai.safeStringify({ a: 1 }), '{"a":1}');
});

test("contentFromMessage handles strings, arrays, objects, and null", () => {
  assert.equal(openai.contentFromMessage(mkMessage("ai", "hi")), "hi");
  assert.equal(openai.contentFromMessage(mkMessage("ai", ["a", { text: "b" }])), "ab");
  assert.equal(openai.contentFromMessage(mkMessage("ai", { text: "c" })), "c");
  assert.equal(openai.contentFromMessage(null), null);
});

test("findLastAssistantMessage walks backward", () => {
  const result = openai.findLastAssistantMessage([mkMessage("human"), mkMessage("tool"), mkMessage("ai")]);
  assert.ok(result);
  assert.equal(openai.findLastAssistantMessage([mkMessage("human")]), null);
});

test("extractMessagesFromChunk detects various nests", () => {
  const msg = mkMessage("ai");
  assert.deepEqual(openai.extractMessagesFromChunk({ messages: [msg] }), [msg]);
  assert.deepEqual(openai.extractMessagesFromChunk({ data: { messages: [msg] } }), [msg]);
  assert.deepEqual(openai.extractMessagesFromChunk({ data: { agent: { messages: [msg] } } }), [msg]);
  assert.deepEqual(openai.extractMessagesFromChunk({ data: { tools: { messages: [msg] } } }), [msg]);
  assert.equal(openai.extractMessagesFromChunk({ data: {} }), null);
});

test("mapChatMessages proxies mapOpenAIToMessages", () => {
  const res = openai.mapChatMessages([{ role: "user", content: "hi" } as never]);
  assert.ok(Array.isArray(res));
  assert.equal((res[0] as { mapped?: boolean }).mapped, true);
});

test("mapCompletionPrompt builds system + human", () => {
  const msgs = openai.mapCompletionPrompt("hello");
  assert.equal(msgs.length, 2);
  assert.equal(openai.contentFromMessage(msgs[1]), "hello");
});

test("summarizeToolOutputs collects tool outputs and respects ids", () => {
  const msgs = [
    mkMessage("tool", "out1"),
    mkMessage("tool", { text: "out2" }) as never
  ];
  (msgs[0] as unknown as { tool_call_id: string }).tool_call_id = "id1";
  const summary = openai.summarizeToolOutputs(msgs);
  assert.equal(summary.length, 2);
  assert.equal(summary[0].id, "id1");
  assert.equal(summary[0].content, "out1");
});

test("isToolMessage checks type", () => {
  assert.equal(openai.isToolMessage(mkMessage("tool")), true);
  assert.equal(openai.isToolMessage(mkMessage("human")), false);
});

test("hydrateMessagesWithHistory merges history with incoming and orders by ts", async () => {
  state.keeperHistory = [
    { role: "system", metadata: { traceType: "ignored" }, name: "noop", createdAt: "invalid" },
    { role: "system", metadata: { traceType: "llm_call" }, name: "llm_call", createdAt: "2024-01-01T00:00:00Z" },
    { role: "ai", createdAt: "2024-01-01T00:00:01Z" }
  ];
  const incoming = [mkMessage("human", "hi"), mkMessage("ai", "reply")];
  const merged = await openai.hydrateMessagesWithHistory({
    keeper: StubRecordKeeper.instances.at(-1) as unknown as import("@/agent/recordKeeper/conversation.keeper").RecordKeeper,
    conversationId: "conv",
    incoming
  });
  // should include the allowed system + ai history, then incoming ordered
  assert.equal(merged.length, 4);
  assert.equal(openai.contentFromMessage(merged[0]), "system"); // from llm_call record
  assert.equal(openai.contentFromMessage(merged[1]), "ai"); // history ai
  assert.equal(openai.contentFromMessage(merged.at(-1) ?? null), "reply");
});

