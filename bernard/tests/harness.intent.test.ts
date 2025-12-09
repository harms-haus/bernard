import assert from "node:assert/strict";
import test from "node:test";

import { AIMessage, HumanMessage } from "@langchain/core/messages";

import { IntentHarness, type IntentTool } from "../agent/harness/intent/intent.harness";
import type { HarnessContext, LLMCallConfig, LLMCaller, LLMResponse } from "../agent/harness/lib/types";

class FakeLLMCaller implements LLMCaller {
  constructor(private readonly responses: LLMResponse[]) {}
  async call(): Promise<LLMResponse> {
    const next = this.responses.shift();
    if (!next) {
      throw new Error("No fake LLM response available");
    }
    return next;
  }
}

class CapturingLLMCaller implements LLMCaller {
  public lastInput: LLMCallConfig | undefined;
  constructor(private readonly responses: LLMResponse[]) {}
  async call(input: LLMCallConfig): Promise<LLMResponse> {
    this.lastInput = input;
    const next = this.responses.shift();
    if (!next) {
      throw new Error("No fake LLM response available");
    }
    return next;
  }
}

const baseCtx: HarnessContext = {
  conversation: {
    turns: [new HumanMessage("hello")],
    recent: (n?: number) => (typeof n === "number" ? [new HumanMessage("hello")].slice(-n) : [new HumanMessage("hello")])
  },
  config: {
    intentModel: "intent-model",
    responseModel: "response-model",
    maxIntentIterations: 3
  },
  conversationId: "conv-test",
  now: () => new Date("2025-01-01T00:00:00Z")
};

test("IntentHarness stops on empty response with no tool calls", async () => {
  const caller = new FakeLLMCaller([
    {
      text: "",
      message: new AIMessage({ content: "" }),
      toolCalls: []
    }
  ]);

  const harness = new IntentHarness(caller, [], 3);
  const result = await harness.run({}, baseCtx);

  assert.equal(result.output.done, true);
  assert.equal(result.output.transcript.length, 1);
  const last = result.output.transcript[result.output.transcript.length - 1] as HumanMessage;
  assert.equal((last.content as string) ?? "", "hello");
});

test("IntentHarness executes tool calls and appends tool results", async () => {
  const toolCall = {
    id: "call_1",
    name: "echo_tool",
    function: { name: "echo_tool", arguments: '{"value":"hi"}' },
    arguments: '{"value":"hi"}'
  };

  const caller = new FakeLLMCaller([
    {
      text: "",
      message: new AIMessage({ content: "", tool_calls: [toolCall] } as any),
      toolCalls: [toolCall]
    },
    {
      text: "",
      message: new AIMessage({ content: "" }),
      toolCalls: []
    }
  ]);

  const tools: IntentTool[] = [
    {
      name: "echo_tool",
      async invoke(input) {
        return { echoed: input };
      }
    }
  ];

  const harness = new IntentHarness(caller, tools, 4);
  const result = await harness.run({}, baseCtx);

  const transcriptTexts = result.output.transcript.map((msg) => String((msg as { content?: unknown }).content ?? ""));
  assert.ok(transcriptTexts.some((text) => text.includes("echoed")));
  assert.equal(result.output.toolCalls.length, 0);
});

test("IntentHarness accepts tool args outside function.arguments", async () => {
  const toolCall = {
    id: "call_args",
    name: "echo_tool",
    args: { value: "hello" },
    function: { name: "echo_tool" }
  };

  const caller = new FakeLLMCaller([
    {
      text: "",
      message: new AIMessage({ content: "", tool_calls: [toolCall] } as any),
      toolCalls: [toolCall]
    },
    {
      text: "",
      message: new AIMessage({ content: "" }),
      toolCalls: []
    }
  ]);

  const tools: IntentTool[] = [
    {
      name: "echo_tool",
      async invoke(input) {
        return { echoed: input };
      }
    }
  ];

  const harness = new IntentHarness(caller, tools, 3);
  const result = await harness.run({}, baseCtx);

  const transcriptTexts = result.output.transcript.map((msg) => String((msg as { content?: unknown }).content ?? ""));
  assert.ok(transcriptTexts.some((text) => text.includes("echoed")));
});

test("IntentHarness filters misconfigured tools and annotates prompt", async () => {
  const caller = new CapturingLLMCaller([
    {
      text: "",
      message: new AIMessage({ content: "" }),
      toolCalls: []
    }
  ]);

  const tools: IntentTool[] = [
    {
      name: "broken_tool",
      verifyConfiguration: () => ({ ok: false, reason: "Missing API key" }),
      async invoke() {
        return "should not be called";
      }
    },
    {
      name: "echo_tool",
      async invoke() {
        return "ok";
      }
    }
  ];

  const harness = new IntentHarness(caller, tools, 1);
  await harness.run({}, baseCtx);

  assert.ok(caller.lastInput);
  assert.equal(Array.isArray(caller.lastInput?.tools), true);
  assert.equal((caller.lastInput?.tools as IntentTool[]).length, 1);
  assert.equal((caller.lastInput?.tools as IntentTool[])[0]?.name, "echo_tool");

  const systemContent = String((caller.lastInput?.messages[0] as { content?: unknown })?.content ?? "");
  assert.ok(systemContent.includes("Unavailable tools"));
  assert.ok(systemContent.includes("broken_tool"));
  assert.ok(systemContent.includes("Missing API key"));
});


