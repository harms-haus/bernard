import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";

import { ResponseHarness, type ResponseInput, type ResponseOutput } from "../agent/harness/respond/respond.harness";
import type { HarnessContext, LLMCallConfig, LLMCaller, LLMResponse } from "../agent/harness/lib/types";

const originalConsole = {
  info: console.info,
  warn: console.warn,
  error: console.error
};

before(() => {
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
});

after(() => {
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
});

class FakeLLMCaller implements LLMCaller {
  constructor(private readonly responses: LLMResponse[]) {}
  async call(): Promise<LLMResponse> {
    const next = this.responses.shift();
    if (!next) throw new Error("No fake LLM response available");
    return next;
  }
}

class CapturingLLMCaller implements LLMCaller {
  public lastInput: LLMCallConfig | undefined;
  constructor(private readonly responses: LLMResponse[]) {}
  async call(input: LLMCallConfig): Promise<LLMResponse> {
    this.lastInput = input;
    const next = this.responses.shift();
    if (!next) throw new Error("No fake LLM response available");
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
    responseModel: "response-model"
  },
  conversationId: "conv-123",
  requestId: "req-123",
  turnId: "turn-123",
  now: () => new Date("2025-01-01T00:00:00Z")
};

function buildInput(memories?: ResponseInput["memories"]): ResponseInput {
  return {
    intent: {} as any,
    memories: memories ?? { memories: [] }
  };
}

test("ResponseHarness builds messages with system prompt, thread, and memories", async () => {
  const caller = new CapturingLLMCaller([
    {
      text: "ok",
      message: new AIMessage("ok")
    }
  ]);

  const harness = new ResponseHarness(caller);
  const ctx: HarnessContext = {
    ...baseCtx,
    conversation: {
      ...baseCtx.conversation,
      turns: [new HumanMessage("first")]
    }
  };
  await harness.run(buildInput({ memories: [{ title: "memo" }] }), ctx);

  assert.ok(caller.lastInput);
  const messages = caller.lastInput?.messages ?? [];
  assert.equal((messages[0] as { _getType?: () => string })._getType?.(), "system");
  const systemContent = String((messages[0] as SystemMessage).content ?? "");
  assert.ok(systemContent.includes("Now:"));
  assert.ok(systemContent.toLowerCase().includes("bernard"));
  assert.ok(messages.some((msg) => (msg as { _getType?: () => string })._getType?.() === "human"));
  const memoryMessage = messages[messages.length - 1] as HumanMessage;
  const memoryContent = String(memoryMessage.content ?? "");
  assert.ok(memoryContent.includes("Relevant memories"));
  assert.ok(memoryContent.includes("memo"));
});

test("ResponseHarness includes request metadata when calling LLM", async () => {
  const caller = new CapturingLLMCaller([
    { text: "hi", message: new AIMessage("hi") }
  ]);

  const harness = new ResponseHarness(caller);
  await harness.run(buildInput(), baseCtx);

  assert.ok(caller.lastInput?.meta);
  assert.equal(caller.lastInput?.meta?.conversationId, "conv-123");
  assert.equal(caller.lastInput?.meta?.requestId, "req-123");
  assert.equal(caller.lastInput?.meta?.turnId, "turn-123");
  assert.equal(caller.lastInput?.meta?.traceName, "response");
});

test("ResponseHarness returns non-blank LLM response unchanged", async () => {
  const caller = new FakeLLMCaller([
    { text: "hi there", message: new AIMessage("hi there") }
  ]);
  const harness = new ResponseHarness(caller);
  const result = await harness.run(buildInput(), baseCtx);

  assert.equal(result.output.text, "hi there");
  assert.equal((result.output.message as { content?: unknown }).content, "hi there");
});

test("ResponseHarness falls back to last tool output when LLM is blank", async () => {
  const caller = new FakeLLMCaller([
    {
      text: "   ",
      message: new AIMessage({ content: "" })
    }
  ]);
  const harness = new ResponseHarness(caller);
  const ctx: HarnessContext = {
    ...baseCtx,
    conversation: {
      turns: [new ToolMessage({ content: "latest tool data", tool_call_id: "call-1" })],
      recent: () => []
    }
  };

  const result = await harness.run(buildInput(), ctx);
  assert.ok(result.output.text.includes("Here's what I found"));
  assert.ok(result.output.text.includes("latest tool data"));
  assert.equal((result.output.message as { content?: unknown }).content, result.output.text);
});

test("ResponseHarness falls back to last human turn when blank and no tool", async () => {
  const caller = new FakeLLMCaller([
    { text: "", message: new AIMessage({ content: "" }) }
  ]);
  const harness = new ResponseHarness(caller);
  const ctx: HarnessContext = {
    ...baseCtx,
    conversation: {
      turns: [new HumanMessage("status update please")],
      recent: () => []
    }
  };

  const result = await harness.run(buildInput(), ctx);
  assert.ok(result.output.text.includes('status update please'));
  assert.ok(result.output.text.includes('check again'));
});

test("ResponseHarness creates message when LLM omits one and no history exists", async () => {
  const caller = new FakeLLMCaller([{ text: "", message: undefined as any }]);
  const harness = new ResponseHarness(caller);
  const ctx: HarnessContext = {
    ...baseCtx,
    conversation: {
      turns: [],
      recent: () => []
    }
  };

  const result = await harness.run(buildInput(), ctx);
  assert.ok(result.output.text.includes("I'm here if you want to try again"));
  assert.ok(result.output.message);
  assert.equal((result.output.message as { _getType?: () => string })._getType?.(), "ai");
});

