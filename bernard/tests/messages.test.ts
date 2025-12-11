import assert from "node:assert/strict";
import test from "node:test";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";

import {
  collectToolCalls,
  contentFromMessage,
  containsChatMLMarkers,
  extractMessagesFromChunk,
  extractTokenUsage,
  extractUsageFromMessages,
  findLastAssistantMessage,
  isRecord,
  isToolMessage,
  mapOpenAIToMessages,
  mapRecordsToMessages,
  messageRecordToOpenAI,
  messageRecordToBaseMessage,
  parseToolInput,
  parseToolInputWithDiagnostics,
  safeStringify,
  summarizeToolOutputs,
  toOpenAIChatMessage,
  type OpenAIMessage
} from "../lib/conversation/messages";
import type { MessageRecord } from "../lib/conversation/types";
import { hydrateMessagesWithHistory } from "../app/api/v1/_lib/openai";

test("type guards and marker detection", () => {
  assert.ok(isRecord({ a: 1 }));
  assert.equal(isRecord(null), false);
  assert.equal(isRecord("nope"), false);

  assert.ok(containsChatMLMarkers("<|im_start|>"));
  assert.ok(containsChatMLMarkers([{ text: "hi <|" }]));
  assert.equal(containsChatMLMarkers("plain"), false);
});

test("safeStringify falls back on circular structures", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.equal(safeStringify({ a: 1 }), '{"a":1}');
  assert.equal(safeStringify(circular), "[object Object]");
});

test("parseToolInput variants", () => {
  assert.deepEqual(parseToolInput('{"a":1}'), { a: 1 });
  assert.deepEqual(parseToolInput('{"a":1,}'), { a: 1 });
  const raw = "{bad}";
  assert.equal(parseToolInput(raw), raw);
  assert.equal(parseToolInput(5), 5);
});

test("parseToolInputWithDiagnostics reports repair attempts", () => {
  const repaired = parseToolInputWithDiagnostics('{"a":1,}');
  assert.equal(repaired.success, true);
  assert.equal(repaired.repaired, true);
  assert.deepEqual(repaired.value, { a: 1 });

  const failed = parseToolInputWithDiagnostics("{bad}");
  assert.equal(failed.success, false);
  assert.equal(failed.repaired, false);
  assert.equal(failed.value, "{bad}");
  assert.ok(typeof failed.error === "string");
});

test("contentFromMessage normalizes mixed content", () => {
  const msg = { content: [{ text: "hi" }, " there"] } as any;
  assert.equal(contentFromMessage(msg), "hi there");
  const textObj = { content: { text: "solo" } } as any;
  assert.equal(contentFromMessage(textObj), "solo");
  const missing = { content: { other: "x" } } as any;
  assert.equal(contentFromMessage(missing), null);
});

test("findLastAssistantMessage honors _getType and getType", () => {
  const first = { _getType: () => "ai", content: "old" } as any;
  const fallback = { getType: () => "ai", content: "new" } as any;
  const result = findLastAssistantMessage([{ _getType: () => "human" } as any, first, fallback]);
  assert.equal(result?.content, "new");
  assert.equal(findLastAssistantMessage([{ _getType: () => "human" } as any]), null);
});

test("collectToolCalls extracts and stringifies arguments", () => {
  const toolArgs = { key: "value" };
  const calls = collectToolCalls([
    new AIMessage({ content: "hi", tool_calls: [{ id: "1", type: "function", function: { name: "fn", arguments: toolArgs } }] }),
    new HumanMessage("ignored")
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, "1");
  assert.equal(calls[0].function.arguments, JSON.stringify(toolArgs));
});

test("toOpenAIChatMessage uses last assistant and merges tool calls", () => {
  const messages = [
    new HumanMessage("start"),
    new AIMessage({ content: "first" }),
    new AIMessage({ content: "second", tool_calls: [{ id: "c1", type: "function", function: { name: "n", arguments: "{}" } }] })
  ];
  const result = toOpenAIChatMessage(messages);
  assert.equal(result.content, "second");
  assert.ok(Array.isArray(result.tool_calls));
  assert.equal(result.tool_calls?.length, 1);
});

test("token usage extraction prefers response_metadata", () => {
  assert.deepEqual(extractTokenUsage(null), {});
  const usage = extractTokenUsage({ response_metadata: { token_usage: { prompt_tokens: 1 } }, usage_metadata: { prompt_tokens: 5 } });
  assert.deepEqual(usage, { prompt_tokens: 1 });

  const assistant = { _getType: () => "ai", response_metadata: { token_usage: { completion_tokens: 2 } } } as any;
  const usageFromMessages = extractUsageFromMessages([assistant]);
  assert.deepEqual(usageFromMessages, { completion_tokens: 2 });
});

test("messageRecordToOpenAI normalizes tool calls and traces", () => {
  const trace = messageRecordToOpenAI({
    id: "t1",
    role: "system",
    name: "llm_call",
    metadata: { traceType: "llm_call" },
    content: { trace: true },
    createdAt: new Date().toISOString()
  } as MessageRecord);
  assert.equal(trace?.role, "system");
  assert.equal((trace as any).metadata?.traceType, "llm_call");

  const toolCall = messageRecordToOpenAI({
    id: "r1",
    role: "assistant",
    content: "hi",
    tool_calls: [{ function: { name: "do", arguments: { a: 1 } } }],
    createdAt: new Date().toISOString()
  } as MessageRecord);
  assert.equal(toolCall?.tool_calls?.[0]?.function.name, "do");
  assert.equal(toolCall?.tool_calls?.[0]?.function.arguments, '{"a":1}');
});

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

test("messageRecordToBaseMessage normalizes tool content and unknown role", () => {
  const toolRecord = {
    id: "tool-1",
    role: "tool",
    content: { ok: true },
    createdAt: new Date().toISOString()
  } as MessageRecord;
  const toolMsg = messageRecordToOpenAI(toolRecord);
  const lcTool = messageRecordToBaseMessage(toolRecord);
  assert.equal(toolMsg?.tool_call_id, "tool_call");
  assert.equal(contentFromMessage(lcTool), '{"ok":true}');

  const unknown = messageRecordToBaseMessage({ ...toolRecord, role: "unknown" as any } as MessageRecord);
  assert.equal((unknown as any)?._getType?.(), "human");
});

test("mapOpenAIToMessages rejects invalid roles and ChatML markers", () => {
  assert.throws(() => mapOpenAIToMessages([{ role: "unknown" as any, content: "" }]));
  assert.throws(() =>
    mapOpenAIToMessages([{ role: "user", content: [{ text: "has <|" }] } as any as OpenAIMessage])
  );
});

test("mapOpenAIToMessages parses tool call args and fallbacks", () => {
  const output = mapOpenAIToMessages([
    {
      role: "assistant",
      content: "",
      tool_calls: [{ id: "", type: "function", function: { name: "weather", arguments: '{"city":"SF"}' } }]
    }
  ]);
  const toolCalls = (output[0] as AIMessage).tool_calls ?? [];
  assert.equal(toolCalls[0]?.id, "weather_0");
  assert.deepEqual(toolCalls[0]?.args, { city: "SF" });
  assert.equal(toolCalls[0]?.function.arguments, '{"city":"SF"}');
});

test("mapOpenAIToMessages handles legacy function_call with non-object args", () => {
  const output = mapOpenAIToMessages([
    { role: "assistant", content: "", function_call: { name: "fn", arguments: "raw" } }
  ]);
  const call = (output[0] as AIMessage).tool_calls?.[0];
  assert.deepEqual(call?.args, { value: "raw" });
  assert.equal(call?.id, "fn");
});

test("messageRecordToOpenAI sets tool_call_id fallback from name", () => {
  const record = {
    id: "tool-2",
    role: "tool",
    name: "my_tool",
    content: "result",
    createdAt: new Date().toISOString()
  } as MessageRecord;
  const result = messageRecordToOpenAI(record);
  assert.equal(result?.tool_call_id, "my_tool");
});

test("extractMessagesFromChunk handles multiple shapes", () => {
  const msgs = [new HumanMessage("hi")];
  assert.equal(extractMessagesFromChunk({ messages: msgs }), msgs);
  assert.equal(extractMessagesFromChunk({ data: { messages: msgs } }), msgs);
  assert.equal(extractMessagesFromChunk({ data: { agent: { messages: msgs } } }), msgs);
  assert.equal(extractMessagesFromChunk({ data: { tools: { messages: msgs } } }), msgs);
  assert.equal(extractMessagesFromChunk({ data: {} }), null);
});

test("summarizeToolOutputs and isToolMessage isolate tool content", () => {
  const tool = new ToolMessage({ tool_call_id: "call-1", content: "out" });
  const human = new HumanMessage("hi");
  const summary = summarizeToolOutputs([tool, human]);
  assert.deepEqual(summary, [{ id: "call-1", content: "out" }]);
  assert.equal(isToolMessage(tool), true);
  assert.equal(isToolMessage(human), false);
});

test("toOpenAIChatMessage defaults to empty content when no assistant", () => {
  const result = toOpenAIChatMessage([new HumanMessage("hi")]);
  assert.equal(result.content, "");
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



