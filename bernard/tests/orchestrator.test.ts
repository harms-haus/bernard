import assert from "node:assert/strict";
import test from "node:test";

import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";

import { Orchestrator } from "../agent/orchestrator/orchestrator";
import { buildHarnessConfig } from "../agent/orchestrator/config";
import { IntentHarness } from "../agent/harness/intent/intent.harness";
import { MemoryHarness } from "../agent/harness/memory/memory.harness";
import { ResponseHarness } from "../agent/harness/respond/respond.harness";
import { UtilityHarness } from "../agent/harness/utility/utility.harness";
import type { HarnessContext, LLMCaller, LLMCallConfig, LLMResponse } from "../agent/harness/lib/types";

class FakeLLMCaller implements LLMCaller {
  constructor(private readonly responses: LLMResponse[]) {}
  async call(): Promise<LLMResponse> {
    const next = this.responses.shift();
    if (!next) throw new Error("No fake LLM response available");
    return next;
  }
}

const baseConversation = [new HumanMessage("hi orchestrator")];
const ctxBase: HarnessContext = {
  conversation: {
    turns: baseConversation,
    recent: (n?: number) => (typeof n === "number" ? baseConversation.slice(-n) : baseConversation)
  },
  config: buildHarnessConfig({ intentModel: "intent-m", responseModel: "resp-m" }),
  conversationId: "conv-test",
  now: () => new Date("2025-01-02T00:00:00Z")
};

test("Orchestrator runs intent+memory then response once", async () => {
  const intentCall = new FakeLLMCaller([
    {
      text: "",
      message: new AIMessage({ content: "" }),
      toolCalls: []
    }
  ]);
  const responseCall = new FakeLLMCaller([
    {
      text: "final response",
      message: new AIMessage({ content: "final response" })
    }
  ]);

  const orchestrator = new Orchestrator(
    null,
    ctxBase.config,
    new IntentHarness(intentCall, [], 2),
    new MemoryHarness(),
    new ResponseHarness(responseCall),
    new UtilityHarness()
  );

  const result = await orchestrator.run({
    conversationId: "conv-test",
    incoming: baseConversation,
    intentInput: {},
    memoryInput: {}
  });

  assert.equal(result.response.text, "final response");
  assert.equal(result.intent.transcript.length >= baseConversation.length, true);
  assert.ok(Array.isArray(result.memories.memories));
});

test("Orchestrator removes blank/response tool messages before response prompt", async () => {
  const toolCallMessage = new AIMessage({
    content: "",
    tool_calls: [{ id: "search_call", function: { name: "search", arguments: "{}" } }] as any
  } as any);
  const toolResult = new ToolMessage({ tool_call_id: "search_call", name: "search", content: "search result" });
  const blankToolResult = new ToolMessage({ tool_call_id: "search_call", name: "search", content: "   " });
  const respondCall = new AIMessage({
    content: "",
    tool_calls: [{ id: "respond_call", function: { name: "respond", arguments: "{}" } }] as any
  } as any);
  const respondResult = new ToolMessage({
    tool_call_id: "respond_call",
    name: "respond",
    content: "Ready to hand off"
  });

  const transcript = [...baseConversation, toolCallMessage, toolResult, blankToolResult, respondCall, respondResult];
  const intentHarness = {
    async run() {
      return {
        output: { transcript, toolCalls: [], done: true },
        done: true
      };
    }
  } as unknown as IntentHarness;

  let responseCallInput: LLMCallConfig | undefined;
  const responseHarness = new ResponseHarness({
    async call(input) {
      responseCallInput = input;
      return {
        text: "ok",
        message: new AIMessage({ content: "ok" })
      };
    }
  });

  const orchestrator = new Orchestrator(
    null,
    ctxBase.config,
    intentHarness,
    new MemoryHarness(),
    responseHarness,
    new UtilityHarness()
  );

  await orchestrator.run({
    conversationId: "conv-filter",
    incoming: baseConversation
  });

  assert.ok(responseCallInput);
  const responseMessages = (responseCallInput?.messages ?? []).filter(
    (msg) => (msg as { _getType?: () => string })._getType?.() !== "system"
  );
  const contents = responseMessages.map((msg) => String((msg as { content?: unknown }).content ?? ""));

  assert.equal(responseMessages.length, 2);
  assert.ok(contents.every((content) => content.trim().length > 0));
  assert.ok(contents.some((content) => content.includes("hi orchestrator")));
  assert.ok(contents.some((content) => content.includes("search result")));

  const toolNames = responseMessages
    .filter((msg) => (msg as { _getType?: () => string })._getType?.() === "tool")
    .map((msg) => (msg as { name?: string }).name);
  assert.ok(!toolNames.includes("respond"));
});

test("Response harness falls back when model returns a blank message", async () => {
  const forecast = new ToolMessage({
    tool_call_id: "forecast_call",
    name: "get_weather_forecast",
    content: "Forecast: high 72F, low 55F with light winds."
  });
  const transcript = [...baseConversation, forecast];
  const intentHarness = {
    async run() {
      return {
        output: { transcript, toolCalls: [], done: true },
        done: true
      };
    }
  } as unknown as IntentHarness;

  const responseCall = new FakeLLMCaller([
    {
      text: "",
      message: new AIMessage({ content: "" })
    }
  ]);

  const orchestrator = new Orchestrator(
    null,
    ctxBase.config,
    intentHarness,
    new MemoryHarness(),
    new ResponseHarness(responseCall),
    new UtilityHarness()
  );

  const result = await orchestrator.run({
    conversationId: "conv-fallback",
    incoming: baseConversation
  });

  assert.ok(result.response.text.trim().length > 0);
  assert.ok(result.response.text.includes("Forecast"));
});


