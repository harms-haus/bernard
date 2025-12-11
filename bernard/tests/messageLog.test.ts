import assert from "node:assert/strict";
import { test } from "vitest";
import type { BaseMessage } from "@langchain/core/messages";

import {
  MessageLog,
  contentToText,
  countToolCallsInMessages,
  countUserAssistantMessages,
  isErrorRecord,
  mapMessageRole,
  normalizeMessageContent,
  snapshotMessageForTrace,
  toToolCallEntry
} from "../lib/conversation/messageLog";
import type { MessageRecord, ToolCallEntry } from "../lib/conversation/types";

class FakeMulti {
  constructor(private readonly redis: FakeRedis) {}
  private commands: Array<{ type: string; args: unknown[] }> = [];

  rpush(key: string, value: string) {
    this.commands.push({ type: "rpush", args: [key, value] });
    const list = this.redis.lists[key] ?? [];
    list.push(value);
    this.redis.lists[key] = list;
    return this;
  }

  hincrby(key: string, field: string, delta: number) {
    this.commands.push({ type: "hincrby", args: [key, field, delta] });
    const hash = this.redis.hashes[key] ?? {};
    const current = typeof hash[field] === "number" ? (hash[field] as number) : Number(hash[field] ?? 0);
    hash[field] = current + delta;
    this.redis.hashes[key] = hash;
    return this;
  }

  hset(key: string, values: Record<string, unknown>) {
    this.commands.push({ type: "hset", args: [key, values] });
    const hash = this.redis.hashes[key] ?? {};
    Object.assign(hash, values);
    this.redis.hashes[key] = hash;
    return this;
  }

  zadd(key: string, score: number, member: string) {
    this.commands.push({ type: "zadd", args: [key, score, member] });
    const existing = this.redis.zsets[key] ?? [];
    existing.push({ score, member });
    this.redis.zsets[key] = existing;
    return this;
  }

  async exec() {
    return this.commands.map((command) => ({ ok: command.type }));
  }
}

class FakeRedis {
  lists: Record<string, string[]> = {};
  hashes: Record<string, Record<string, unknown>> = {};
  zsets: Record<string, Array<{ score: number; member: string }>> = {};
  multiCalls = 0;

  multi() {
    this.multiCalls += 1;
    return new FakeMulti(this);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists[key] ?? [];
    const startIdx = start < 0 ? Math.max(list.length + start, 0) : start;
    const stopIdx = stop < 0 ? list.length + stop : stop;
    return list.slice(startIdx, stopIdx + 1);
  }
}

test("mapMessageRole normalizes supported aliases", () => {
  assert.equal(mapMessageRole("ai"), "assistant");
  assert.equal(mapMessageRole("assistant"), "assistant");
  assert.equal(mapMessageRole("human"), "user");
  assert.equal(mapMessageRole("user"), "user");
  assert.equal(mapMessageRole("system"), "system");
  assert.equal(mapMessageRole("tool"), "tool");
  assert.equal(mapMessageRole(undefined), "user");
});

test("normalizeMessageContent filters only object parts and keeps objects", () => {
  const obj = { x: 1 };
  const arr = [{ keep: true }, "drop", 3] as unknown[];
  assert.equal(normalizeMessageContent("hi"), "hi");
  assert.deepEqual(normalizeMessageContent(arr), [{ keep: true }]);
  assert.deepEqual(normalizeMessageContent(obj), obj);
  assert.equal(normalizeMessageContent(null), "");
});

test("toToolCallEntry safely strips unknown fields", () => {
  const entry = toToolCallEntry({
    id: "1",
    type: "function",
    name: "lookup",
    arguments: { query: "hi" },
    function: { name: "lookup", arguments: '{"query":"hi"}', args: { x: 1 } },
    raw: { raw: true }
  });
  assert.deepEqual(entry, {
    id: "1",
    type: "function",
    name: "lookup",
    arguments: { query: "hi" },
    function: { name: "lookup", arguments: '{"query":"hi"}', args: { x: 1 } },
    raw: { raw: true }
  });

  const stringEntry = toToolCallEntry("simple");
  assert.deepEqual(stringEntry, { name: "simple" });
});

test("contentToText flattens arrays and object shapes", () => {
  const mixed = [
    "plain",
    { text: "text" },
    { content: "content" },
    { other: 1 },
    42
  ] as Array<unknown>;
  assert.equal(contentToText("hi"), "hi");
  assert.equal(contentToText(mixed), 'plain text content {"other":1} 42');
  assert.equal(contentToText({ text: "solo" }), "solo");
  assert.equal(contentToText(null), "");
});

test("count helpers and error detection cover tool and assistant paths", () => {
  const messages: MessageRecord[] = [
    { id: "1", role: "assistant", content: "", createdAt: "iso", tool_calls: [{ id: "tc1" }] },
    { id: "2", role: "tool", content: "", createdAt: "iso", name: "call" },
    { id: "3", role: "user", content: "", createdAt: "iso" },
    {
      id: "4",
      role: "assistant",
      content: "",
      createdAt: "iso",
      name: "orchestrator.error",
      metadata: { traceType: "orchestrator.error" }
    }
  ];
  assert.equal(countToolCallsInMessages(messages), 2);
  assert.equal(countUserAssistantMessages(messages), 3);
  assert.equal(isErrorRecord(messages[3]), true);
});

test("snapshotMessageForTrace normalizes roles, content, and tool calls", () => {
  const baseMsg = {
    _getType: () => "ai",
    content: [{ text: "hello" }, { content: "world" }, 5],
    tool_calls: [{ id: "1", function: { name: "fn", arguments: "{}" } as ToolCallEntry["function"] }],
    name: "assistant-name",
    tool_call_id: "tc-1"
  } as unknown as BaseMessage;

  const snap = snapshotMessageForTrace(baseMsg);
  assert.equal(snap.role, "assistant");
  assert.equal(snap.name, "assistant-name");
  assert.equal(snap.tool_call_id, "tc-1");
  assert.equal(snap.content, "hello world 5");
  assert.ok(Array.isArray(snap.tool_calls));
  assert.equal(snap.tool_calls?.[0]?.function?.name, "fn");

  const recordSnap = snapshotMessageForTrace({
    id: "r1",
    role: "user",
    content: "hi",
    createdAt: "iso",
    name: "named"
  });
  assert.equal(recordSnap.role, "user");
  assert.equal(recordSnap.content, "hi");
  assert.equal(recordSnap.name, "named");
});

test("append persists messages and updates counters with consistent timestamps", async () => {
  const fixedMs = 1_700_000_000_000;
  const originalDate = Date;
  const originalRandom = Math.random;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Date = class extends Date {
    constructor(...args: ConstructorParameters<typeof Date>) {
      if (args.length) {
        super(...args);
      } else {
        super(fixedMs);
      }
    }
    static now() {
      return fixedMs;
    }
  };
  Math.random = () => 0.123456789;

  const redis = new FakeRedis();
  const log = new MessageLog(redis as any, (suffix) => `ns:${suffix}`);

  const assistant = {
    _getType: () => "ai",
    content: "hello",
    tool_calls: [{ id: "call-1", function: { name: "lookup", arguments: '{"q":1}' } }],
    usage_metadata: { input_tokens: 10, output_tokens: 5 },
    response_metadata: { latency: 123 },
    name: "assistant"
  } as unknown as BaseMessage;

  const toolResult: MessageRecord = {
    id: "tool-1",
    role: "tool",
    content: "result",
    createdAt: "iso",
    tool_call_id: "call-1",
    name: "lookup"
  };

  const errorRecord: MessageRecord = {
    id: "err-1",
    role: "assistant",
    content: "boom",
    createdAt: "iso",
    name: "orchestrator.error",
    metadata: { traceType: "orchestrator.error" }
  };

  await log.append("c1", [assistant, toolResult, errorRecord], "conv:c1");

  const listKey = "ns:conv:c1:msgs";
  assert.equal(redis.lists[listKey]?.length, 3);

  const storedAssistant = JSON.parse(redis.lists[listKey][0]) as MessageRecord;
  assert.equal(storedAssistant.role, "assistant");
  assert.equal(storedAssistant.tool_calls?.[0]?.id, "call-1");
  assert.deepEqual(storedAssistant.tokenDeltas, { in: 10, out: 5 });
  assert.equal(typeof storedAssistant.id, "string");
  assert.equal(storedAssistant.createdAt, new originalDate(fixedMs).toISOString());

  const counters = redis.hashes["conv:c1"];
  assert.equal(counters.messageCount, 3);
  assert.equal(counters.userAssistantCount, 2);
  assert.equal(counters.toolCallCount, 2);
  assert.equal(counters.errorCount, 1);
  assert.equal(typeof counters.lastTouchedAt, "string");
  assert.equal(redis.zsets["ns:convs:active"]?.[0]?.member, "c1");

  Math.random = originalRandom;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Date = originalDate;

  {
    const noopRedis = new FakeRedis();
    const noopLog = new MessageLog(noopRedis as any, (suffix) => `ns:${suffix}`);
    await noopLog.append("c2", [], "conv:c2");
    assert.equal(noopRedis.multiCalls, 0);
  }
});

test("getMessages tolerates invalid JSON and respects limit", async () => {
  const redis = new FakeRedis();
  const key = "ns:conv:abc:msgs";
  redis.lists[key] = ["not-json", '{"id":"1","role":"user","content":"","createdAt":"iso"}'];

  const log = new MessageLog(redis as any, (suffix) => `ns:${suffix}`);
  const messages = await log.getMessages("abc", 1);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].id, "1");
});

test("count helpers delegate to getMessages", async () => {
  const redis = new FakeRedis();
  const key = "ns:conv:xyz:msgs";
  redis.lists[key] = [
    JSON.stringify({ id: "1", role: "user", content: "", createdAt: "iso" }),
    JSON.stringify({ id: "2", role: "assistant", content: "", createdAt: "iso", tool_calls: [{ id: "tc" }] }),
    JSON.stringify({ id: "3", role: "tool", content: "", createdAt: "iso" })
  ];

  const log = new MessageLog(redis as any, (suffix) => `ns:${suffix}`);
  assert.equal(await log.countUserAssistant("xyz"), 2);
  assert.equal(await log.countToolCalls("xyz"), 2);
});

