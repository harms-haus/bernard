import assert from "node:assert/strict";
import test from "node:test";

import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { buildGraph } from "../lib/agent";
import { getWeatherCurrentTool } from "../libs/weather";

type FakeToolCall = { id: string; name: string; args: unknown };
type FakeUsage = { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number };
type FakeResponse = {
  content: string;
  toolCalls?: FakeToolCall[];
  usage?: FakeUsage;
  usagePath?: "response_metadata" | "usage_metadata";
};

const modelInvocations: Array<{ messages: BaseMessage[] }> = [];
const toolInvocations: unknown[] = [];
let pendingResponses: FakeResponse[] = [];
let toolError: Error | null = null;

function resetFakes() {
  modelInvocations.length = 0;
  toolInvocations.length = 0;
  pendingResponses = [];
  toolError = null;
}

function queueResponses(...responses: FakeResponse[]) {
  pendingResponses = responses;
}

const stubTool = {
  name: "stub_tool",
  description: "Stub tool for tests",
  async invoke(input: unknown) {
    const normalized =
      typeof input === "object" && input !== null && "args" in (input as Record<string, unknown>)
        ? (() => {
            try {
              return JSON.parse((input as { args: string }).args);
            } catch {
              return input;
            }
          })()
        : input;
    toolInvocations.push(normalized);
    if (toolError) throw toolError;
    return { echoed: normalized };
  }
};

class FakeChatOpenAI {
  constructor(_opts?: unknown) {}

  private consume(messages: BaseMessage[]) {
    modelInvocations.push({ messages });
    const next = pendingResponses.shift();
    if (!next) {
      throw new Error("No fake response queued");
    }
    const msg = new AIMessage({
      content: next.content,
      tool_calls: next.toolCalls?.map((tc) => ({
        id: tc.id,
        type: "tool_call",
        name: tc.name,
        args: tc.args,
        function: { name: tc.name, arguments: tc.args }
      }))
    });
    if (next.usagePath === "usage_metadata") {
      (msg as any).usage_metadata = next.usage ?? {};
    } else {
      (msg as any).response_metadata = { token_usage: next.usage ?? {} };
    }
    return msg;
  }

  bindTools(_tools: unknown) {
    return {
      invoke: async (messages: BaseMessage[]) => this.consume(messages)
    };
  }

  async invoke(messages: BaseMessage[]) {
    return this.consume(messages);
  }
}

function makeKeeper() {
  const toolResults: unknown[] = [];
  const modelResults: unknown[] = [];
  const llmCalls: unknown[] = [];
  return {
    toolResults,
    modelResults,
    llmCalls,
    async recordToolResult(...args: unknown[]) {
      toolResults.push(args);
    },
    async recordOpenRouterResult(...args: unknown[]) {
      modelResults.push(args);
    },
    async recordLLMCall(...args: unknown[]) {
      llmCalls.push(args);
    }
  };
}

async function withSilentConsole<T>(fn: () => Promise<T> | T): Promise<T> {
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error
  };
  console.log = console.info = console.warn = console.error = () => {};
  try {
    return await fn();
  } finally {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
  }
}

test("runs tool path and records metrics", { timeout: 2000 }, async () => {
  resetFakes();
  queueResponses(
    {
      content: "Calling tool",
      toolCalls: [{ id: "call-1", name: "stub_tool", args: { value: "hi" } }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
      usagePath: "response_metadata"
    },
    {
      content: "done",
      usage: { prompt_tokens: 4, completion_tokens: 2 },
      usagePath: "response_metadata"
    }
  );
  const keeper = makeKeeper();
  const graph = buildGraph({
    recordKeeper: keeper as any,
    turnId: "turn-1",
    conversationId: "conv-1",
    requestId: "req-1",
    token: "tok",
    model: "model-x"
  }, { model: new FakeChatOpenAI() as any, tools: [stubTool as any] });

  const result = await withSilentConsole(() => graph.invoke({ messages: [new HumanMessage("hello")] }));
  const finalMessage = result.messages?.[result.messages.length - 1] as AIMessage | undefined;

  assert.equal(finalMessage?.content, "done");
  assert.equal(toolInvocations.length, 1);
  assert.deepEqual(toolInvocations[0], { value: "hi" });

  assert.equal(keeper.toolResults.length, 2);
  const [turnId, toolName, toolRes] = keeper.toolResults[0] as [string, string, Record<string, unknown>];
  assert.equal(turnId, "turn-1");
  assert.equal(toolName, "stub_tool");
  assert.equal(toolRes.ok, true);
  assert.equal(typeof toolRes.latencyMs, "number");
  const respondEntry = keeper.toolResults.find(([, name]) => name === "respond");
  assert.ok(respondEntry);

  assert.equal(keeper.modelResults.length, 2);
  const [, , firstModelMetrics] = keeper.modelResults[0] as [string, string, Record<string, number>];
  const [, , secondModelMetrics] = keeper.modelResults[1] as [string, string, Record<string, number>];
  assert.equal(firstModelMetrics.tokensIn, 5);
  assert.equal(firstModelMetrics.tokensOut, 2);
  assert.equal(secondModelMetrics.tokensIn, 4);
  assert.equal(secondModelMetrics.tokensOut, 2);
});

test("short-circuits when no tool calls are requested", { timeout: 2000 }, async () => {
  resetFakes();
  queueResponses({
    content: "No tools needed",
    usage: { prompt_tokens: 3, completion_tokens: 1 },
    usagePath: "response_metadata"
  }, {
    content: "Final response",
    usage: { prompt_tokens: 2, completion_tokens: 1 },
    usagePath: "response_metadata"
  });
  const keeper = makeKeeper();
  const graph = buildGraph({
    recordKeeper: keeper as any,
    turnId: "turn-2",
    conversationId: "conv-2",
    requestId: "req-2",
    token: "tok",
    model: "model-x"
  }, { model: new FakeChatOpenAI() as any, tools: [stubTool as any] });

  const result = await withSilentConsole(() => graph.invoke({ messages: [new HumanMessage("hello")] }));
  const finalMessage = result.messages?.[result.messages.length - 1] as AIMessage | undefined;

  assert.equal(finalMessage?.content, "Final response");
  assert.equal(toolInvocations.length, 0);
  assert.equal(keeper.toolResults.length, 1);
  const respondEntry = keeper.toolResults.find(([, name]) => name === "respond");
  assert.ok(respondEntry);
  assert.equal(keeper.modelResults.length, 2);
});

test("records tool errors and classifies rate limits", { timeout: 2000 }, async () => {
  resetFakes();
  queueResponses({
    content: "Calling tool",
    toolCalls: [{ id: "call-err", name: "stub_tool", args: { fail: true } }],
    usage: { prompt_tokens: 2, completion_tokens: 1 },
    usagePath: "response_metadata"
  });
  toolError = new Error("429 rate limit");

  const keeper = makeKeeper();
  const graph = buildGraph({
    recordKeeper: keeper as any,
    turnId: "turn-3",
    conversationId: "conv-3",
    requestId: "req-3",
    token: "tok",
    model: "model-x"
  }, { model: new FakeChatOpenAI() as any, tools: [stubTool as any] });

  await assert.rejects(
    withSilentConsole(() => graph.invoke({ messages: [new HumanMessage("trigger error")] })),
    /429/
  );

  assert.equal(toolInvocations.length, 1);
  assert.equal(keeper.toolResults.length, 1);
  const [, toolName, toolRes] = keeper.toolResults[0] as [string, string, Record<string, unknown>];
  assert.equal(toolName, "stub_tool");
  assert.equal(toolRes.ok, false);
  assert.equal(toolRes.errorType, "rate_limit");
  assert.equal(keeper.modelResults.length, 1);
});

test("invokes weather tool end-to-end through the agent graph", { timeout: 3000 }, async () => {
  resetFakes();
  const originalFetch = globalThis.fetch;
  const mockResponses: Response[] = [
    new Response(
      JSON.stringify({
        current: {
          time: "2024-04-01T10:00",
          temperature_2m: 20,
          apparent_temperature: 19,
          precipitation: 0,
          wind_speed_10m: 5,
          relative_humidity_2m: 60,
          weather_code: 1
        },
        timezone: "Europe/Paris"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  ];
  globalThis.fetch = async () => {
    const next = mockResponses.shift();
    if (!next) throw new Error("Unexpected fetch call");
    return next;
  };

  queueResponses(
    {
      content: "Calling tool",
      toolCalls: [{ id: "w1", name: "get_weather_current", args: { lat: 48.8566, lon: 2.3522, units: "metric" } }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
      usagePath: "response_metadata"
    },
    {
      content: "done",
      usage: { input_tokens: 10, output_tokens: 3 },
      usagePath: "usage_metadata"
    }
  );

  const keeper = makeKeeper();
  const graph = buildGraph(
    {
      recordKeeper: keeper as any,
      turnId: "turn-weather",
      conversationId: "conv-weather",
      requestId: "req-weather",
      token: "tok-weather",
      model: "model-weather"
    },
    { model: new FakeChatOpenAI() as any, tools: [getWeatherCurrentTool as any] }
  );

  try {
    const result = await withSilentConsole(() => graph.invoke({ messages: [new HumanMessage("weather please")] }));
    const toolMessage = result.messages.find((m) => (m as AIMessage).tool_call_id) as AIMessage | undefined;
    const finalMessage = result.messages[result.messages.length - 1] as AIMessage | undefined;

    assert.ok(toolMessage, "expected a tool message");
    assert.match(String((toolMessage as any).content ?? ""), /Current @ 2024-04-01T10:00/);
    assert.equal(finalMessage?.content, "done");

    assert.equal(keeper.toolResults.length, 2);
    const weatherEntry = keeper.toolResults.find(([, name]) => name === "get_weather_current") as
      | [string, string, Record<string, unknown>]
      | undefined;
    assert.ok(weatherEntry);
    assert.equal(weatherEntry?.[2].ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


