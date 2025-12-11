import assert from "node:assert/strict";
import test from "node:test";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

import { mapOpenAIToMessages, mapRecordsToMessages, type OpenAIMessage } from "../lib/agent";
import type { MessageRecord } from "../lib/recordKeeper";
import { hydrateMessagesWithHistory } from "../app/api/v1/_lib/openai";

test("mapRecordsToMessages restores conversation history and drops traces", () => {
  const now = new Date("2025-01-01T00:00:00Z").toISOString();
  const records: MessageRecord[] = [
    {
      id: "sys-1",
      role: "system",
      content: "prior system",
      createdAt: now
    },
    {
      id: "ai-1",
      role: "assistant",
      content: "calling lookup",
      tool_calls: [
        {
          id: "lookup_1",
          type: "tool_call",
          name: "lookup",
          function: { name: "lookup", arguments: '{"query":"hi"}' }
        }
      ],
      createdAt: now
    },
    {
      id: "tool-1",
      role: "tool",
      tool_call_id: "lookup_1",
      name: "lookup",
      content: "result payload",
      createdAt: now
    },
    {
      id: "trace-1",
      role: "system",
      name: "llm_call",
      metadata: { traceType: "llm_call" },
      content: { trace: true },
      createdAt: now
    },
    {
      id: "user-2",
      role: "user",
      content: "new question",
      createdAt: now
    }
  ];

  const messages = mapRecordsToMessages(records);

  assert.equal(messages.length, 4);
  assert.equal((messages[0] as { _getType?: () => string })._getType?.(), "system");
  assert.equal((messages[1] as { _getType?: () => string })._getType?.(), "ai");
  const toolCalls = (messages[1] as { tool_calls?: unknown[] }).tool_calls;
  assert.ok(Array.isArray(toolCalls));
  assert.equal((toolCalls as unknown[]).length, 1);
  assert.equal(
    ((toolCalls as Array<{ function?: { name?: string } }>)[0]?.function?.name) ?? "",
    "lookup"
  );
  assert.equal((messages[2] as { _getType?: () => string })._getType?.(), "tool");
  assert.equal((messages[3] as { _getType?: () => string })._getType?.(), "human");
});

test("mapOpenAIToMessages converts OpenAI-style messages", () => {
  const input: OpenAIMessage[] = [
    { role: "system", content: "You are helpful" },
    { role: "user", content: "Hello" },
    {
      role: "assistant",
      content: "Hi",
      tool_calls: [{ id: "1", type: "function", function: { name: "noop", arguments: "{}" } }]
    }
  ];

  const output = mapOpenAIToMessages(input);
  assert.equal(output.length, 3);
  assert.ok(output[0] instanceof SystemMessage);
  assert.ok(output[1] instanceof HumanMessage);
  assert.ok(output[2] instanceof AIMessage);
  assert.equal((output[2] as AIMessage).tool_calls?.length, 1);
});

test("mapOpenAIToMessages supports legacy function_call", () => {
  const input: OpenAIMessage[] = [
    {
      role: "assistant",
      content: null,
      function_call: { name: "get_weather_current", arguments: { lat: 37.77, lon: -122.42, units: "imperial" } }
    }
  ];

  const output = mapOpenAIToMessages(input);
  const ai = output[0] as AIMessage;
  assert.equal(ai.tool_calls?.length, 1);
  assert.equal(ai.tool_calls?.[0].function.name, "get_weather_current");
  assert.equal(ai.tool_calls?.[0].function.arguments, '{"lat":37.77,"lon":-122.42,"units":"imperial"}');
});

test("mapOpenAIToMessages falls back to tool name when id missing", () => {
  const input: OpenAIMessage[] = [{ role: "tool", name: "toolA", content: "result" }];

  const output = mapOpenAIToMessages(input);
  assert.equal(output.length, 1);
  assert.equal((output[0] as any).tool_call_id, "toolA");
});

test("mapRecordsToMessages can include llm_call traces when requested", () => {
  const now = new Date("2025-01-02T00:00:00Z").toISOString();
  const records: MessageRecord[] = [
    {
      id: "trace-llm",
      role: "system",
      name: "llm_call",
      metadata: { traceType: "llm_call" },
      content: { model: "x", context: [] },
      createdAt: now
    },
    {
      id: "user-1",
      role: "user",
      content: "hi",
      createdAt: now
    }
  ];

  const filtered = mapRecordsToMessages(records);
  assert.equal(filtered.length, 1);
  assert.equal((filtered[0] as { _getType?: () => string })._getType?.(), "human");

  const withTraces = mapRecordsToMessages(records, { includeTraces: true });
  assert.equal(withTraces.length, 2);
  assert.equal((withTraces[0] as { _getType?: () => string })._getType?.(), "system");
  assert.equal((withTraces[1] as { _getType?: () => string })._getType?.(), "human");
});

test("hydrateMessagesWithHistory preserves tool call before tool result at identical timestamps", async () => {
  const createdAt = new Date("2025-01-03T00:00:00Z").toISOString();
  const history: MessageRecord[] = [
    {
      id: "ai-1",
      role: "assistant",
      content: "calling lookup",
      tool_calls: [{ id: "call-1", type: "function", function: { name: "lookup", arguments: "{}" } }],
      createdAt
    },
    {
      id: "tool-1",
      role: "tool",
      name: "lookup",
      tool_call_id: "call-1",
      content: "tool result",
      createdAt
    }
  ];

  const merged = await hydrateMessagesWithHistory({
    keeper: { getMessages: async () => history } as any,
    conversationId: "conv",
    incoming: [new HumanMessage("follow up?")]
  });

  assert.equal(merged.length, 3);
  assert.equal((merged[0] as { _getType?: () => string })._getType?.(), "ai");
  assert.equal((merged[1] as { _getType?: () => string })._getType?.(), "tool");
  assert.equal((merged[2] as { _getType?: () => string })._getType?.(), "human");
});

test("hydrateMessagesWithHistory falls back to sequence when timestamps are missing", async () => {
  const history: MessageRecord[] = [
    { id: "ai-1", role: "assistant", content: "call", createdAt: "invalid" },
    { id: "tool-1", role: "tool", content: "result", tool_call_id: "call", createdAt: "invalid" }
  ];

  const merged = await hydrateMessagesWithHistory({
    keeper: { getMessages: async () => history } as any,
    conversationId: "conv",
    incoming: [new HumanMessage("next?")]
  });

  assert.equal(merged.length, 3);
  assert.equal((merged[0] as { _getType?: () => string })._getType?.(), "ai");
  assert.equal((merged[1] as { _getType?: () => string })._getType?.(), "tool");
  assert.equal((merged[2] as { _getType?: () => string })._getType?.(), "human");
});



