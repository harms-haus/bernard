import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "vitest";

import { AIMessage, HumanMessage } from "@langchain/core/messages";

import { IntentHarness, type IntentTool } from "../agent/harness/intent/intent.harness";
import type { HarnessContext, LLMCallConfig, LLMCaller, LLMResponse } from "../agent/harness/lib/types";

const originalConsoleInfo = console.info;
beforeAll(() => {
  console.info = () => {};
});

afterAll(() => {
  console.info = originalConsoleInfo;
});

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
  const toolNames = (caller.lastInput?.tools as IntentTool[]).map((tool) => tool.name);
  assert.equal(toolNames.length, 2);
  assert.ok(toolNames.includes("echo_tool"));
  assert.ok(toolNames.includes("respond"));

  const systemContents = (caller.lastInput?.messages ?? [])
    .filter((msg) => (msg as { _getType?: () => string })._getType?.() === "system")
    .map((msg) => String((msg as { content?: unknown }).content ?? ""))
    .join("\n");
  assert.ok(systemContents.includes("Unavailable tools"));
  assert.ok(systemContents.includes("broken_tool"));
  assert.ok(systemContents.includes("Missing API key"));
});

test("IntentHarness deduplicates identical tool calls within a single turn", async () => {
  const toolCallA = {
    id: "call_1",
    name: "echo_tool",
    function: { name: "echo_tool", arguments: '{"value":"hi"}' },
    arguments: '{"value":"hi"}'
  };
  const toolCallADuplicate = {
    id: "call_2",
    name: "echo_tool",
    function: { name: "echo_tool", arguments: '{"value":"hi"}' },
    arguments: '{"value":"hi"}'
  };

  const caller = new FakeLLMCaller([
    {
      text: "",
      message: new AIMessage({ content: "", tool_calls: [toolCallA, toolCallADuplicate] } as any),
      toolCalls: [toolCallA, toolCallADuplicate]
    },
    {
      text: "",
      message: new AIMessage({ content: "" }),
      toolCalls: []
    }
  ]);

  let invocations = 0;
  const tools: IntentTool[] = [
    {
      name: "echo_tool",
      async invoke(input) {
        invocations += 1;
        return { echoed: input };
      }
    }
  ];

  const harness = new IntentHarness(caller, tools, 3);
  const result = await harness.run({}, baseCtx);

  assert.equal(invocations, 1);
  const toolMessages = result.output.transcript.filter((msg) => (msg as { _getType?: () => string })._getType?.() === "tool");
  assert.ok(toolMessages.some((msg) => String((msg as { content?: unknown }).content ?? "").includes("Duplicate tool call")));
});

test("IntentHarness logs recordKeeper when tool returns error result", async () => {
  const toolCall = {
    id: "call_error",
    name: "failing_tool",
    function: { name: "failing_tool", arguments: "{}" },
    arguments: "{}"
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

  const recordToolResults: Array<{ turnId: string; toolName: string; result: unknown }> = [];
  const recordKeeper = {
    async recordToolResult(turnId: string, toolName: string, result: unknown) {
      recordToolResults.push({ turnId, toolName, result });
    },
    async recordLLMCall() {}
  };

  const tools: IntentTool[] = [
    {
      name: "failing_tool",
      async invoke() {
        return { status: "error", message: "Geocoding failed: network error: timeout", errorType: "AbortError" };
      }
    }
  ];

  const harness = new IntentHarness(caller, tools, 3);
  const ctx = { ...baseCtx, recordKeeper: recordKeeper as any, turnId: "turn-123" };
  const result = await harness.run({}, ctx);

  assert.equal(recordToolResults.length, 1);
  assert.equal(recordToolResults[0]?.turnId, "turn-123");
  assert.equal(recordToolResults[0]?.toolName, "failing_tool");
  assert.equal((recordToolResults[0]?.result as { ok?: boolean })?.ok, false);
  assert.equal((recordToolResults[0]?.result as { errorType?: string })?.errorType, "AbortError");

  const toolMessages = result.output.transcript
    .filter((msg) => (msg as { _getType?: () => string })._getType?.() === "tool")
    .map((msg) => String((msg as { content?: unknown }).content ?? ""));
  assert.ok(toolMessages.some((content) => content.includes("network error")));
});

test("IntentHarness can finish via respond tool after successful calls", async () => {
  const toolCall = {
    id: "call_1",
    name: "echo_tool",
    function: { name: "echo_tool", arguments: '{"value":"hi"}' },
    arguments: '{"value":"hi"}'
  };
  const respondCall = {
    id: "respond_call",
    name: "respond",
    function: { name: "respond", arguments: "{}" },
    arguments: "{}"
  };

  const caller = new FakeLLMCaller([
    {
      text: "",
      message: new AIMessage({ content: "", tool_calls: [toolCall, respondCall] } as any),
      toolCalls: [toolCall, respondCall]
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

  assert.equal(result.output.done, true);
  assert.equal(result.output.toolCalls.length, 0);
  const toolMessages = result.output.transcript.filter((msg) => (msg as { _getType?: () => string })._getType?.() === "tool");
  assert.ok(toolMessages.some((msg) => String((msg as { content?: unknown }).content ?? "").includes("Ready to hand off")));
});

test("IntentHarness requires failed tools to be fixed before respond succeeds", async () => {
  const toolCall = {
    id: "call_flaky",
    name: "flaky_tool",
    function: { name: "flaky_tool", arguments: "{}" },
    arguments: "{}"
  };
  const respondCall = {
    id: "respond_call",
    name: "respond",
    function: { name: "respond", arguments: "{}" },
    arguments: "{}"
  };

  const caller = new FakeLLMCaller([
    {
      text: "",
      message: new AIMessage({ content: "", tool_calls: [toolCall, respondCall] } as any),
      toolCalls: [toolCall, respondCall]
    },
    {
      text: "",
      message: new AIMessage({ content: "", tool_calls: [toolCall, respondCall] } as any),
      toolCalls: [toolCall, respondCall]
    }
  ]);

  let attempts = 0;
  const tools: IntentTool[] = [
    {
      name: "flaky_tool",
      async invoke() {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("first failure");
        }
        return "ok";
      }
    }
  ];

  const harness = new IntentHarness(caller, tools, 4);
  const result = await harness.run({}, baseCtx);

  assert.equal(attempts, 2);
  const toolMessages = result.output.transcript
    .filter((msg) => (msg as { _getType?: () => string })._getType?.() === "tool")
    .map((msg) => String((msg as { content?: unknown }).content ?? ""));
  assert.ok(toolMessages.some((content) => content.includes("respond() failed")));
  assert.ok(toolMessages.some((content) => content.includes("Ready to hand off")));
});

test("IntentHarness allows respond() alone when no tools are needed", async () => {
  const respondCall = {
    id: "respond_only",
    name: "respond",
    function: { name: "respond", arguments: "{}" },
    arguments: "{}"
  };

  const caller = new FakeLLMCaller([
    {
      text: "",
      message: new AIMessage({ content: "", tool_calls: [respondCall] } as any),
      toolCalls: [respondCall]
    }
  ]);

  const harness = new IntentHarness(caller, [], 2);
  const result = await harness.run({}, baseCtx);

  assert.equal(result.output.done, true);
  const toolMessages = result.output.transcript
    .filter((msg) => (msg as { _getType?: () => string })._getType?.() === "tool")
    .map((msg) => String((msg as { content?: unknown }).content ?? ""));
  assert.ok(toolMessages.some((content) => content.includes("No tool calls needed")));
});

test("IntentHarness allows respond() alone after prior successful tools", async () => {
  const toolCall = {
    id: "call_ok",
    name: "echo_tool",
    function: { name: "echo_tool", arguments: '{"value":"hi"}' },
    arguments: '{"value":"hi"}'
  };
  const respondCall = {
    id: "respond_after_success",
    name: "respond",
    function: { name: "respond", arguments: "{}" },
    arguments: "{}"
  };

  const caller = new FakeLLMCaller([
    { text: "", message: new AIMessage({ content: "", tool_calls: [toolCall] } as any), toolCalls: [toolCall] },
    { text: "", message: new AIMessage({ content: "", tool_calls: [respondCall] } as any), toolCalls: [respondCall] }
  ]);

  let invocations = 0;
  const tools: IntentTool[] = [
    {
      name: "echo_tool",
      async invoke(input) {
        invocations += 1;
        return { echoed: input };
      }
    }
  ];

  const harness = new IntentHarness(caller, tools, 3);
  const result = await harness.run({}, baseCtx);

  assert.equal(invocations, 1);
  const toolMessages = result.output.transcript
    .filter((msg) => (msg as { _getType?: () => string })._getType?.() === "tool")
    .map((msg) => String((msg as { content?: unknown }).content ?? ""));
  assert.ok(toolMessages.some((content) => content.includes("already succeeded earlier in this run")));
});

test("IntentHarness blocks respond() alone when earlier tools failed", async () => {
  const toolCall = {
    id: "call_fail",
    name: "flaky_tool",
    function: { name: "flaky_tool", arguments: "{}" },
    arguments: "{}"
  };
  const respondCall = {
    id: "respond_after_failure",
    name: "respond",
    function: { name: "respond", arguments: "{}" },
    arguments: "{}"
  };

  const caller = new FakeLLMCaller([
    { text: "", message: new AIMessage({ content: "", tool_calls: [toolCall] } as any), toolCalls: [toolCall] },
    { text: "", message: new AIMessage({ content: "", tool_calls: [respondCall] } as any), toolCalls: [respondCall] },
    { text: "", message: new AIMessage({ content: "" }), toolCalls: [] }
  ]);

  const tools: IntentTool[] = [
    {
      name: "flaky_tool",
      async invoke() {
        throw new Error("boom");
      }
    }
  ];

  const harness = new IntentHarness(caller, tools, 3);
  const result = await harness.run({}, baseCtx);

  const toolMessages = result.output.transcript
    .filter((msg) => (msg as { _getType?: () => string })._getType?.() === "tool")
    .map((msg) => String((msg as { content?: unknown }).content ?? ""));
  assert.ok(toolMessages.some((content) => content.includes("Tool flaky_tool failed: boom")));
  assert.ok(toolMessages.some((content) => content.includes("Previous tool call(s) in this run failed")));
});

test("IntentHarness short-circuits if the same tool call repeats with no new work", async () => {
  const toolCall = {
    id: "repeat_call",
    name: "echo_tool",
    function: { name: "echo_tool", arguments: '{"value":"again"}' },
    arguments: '{"value":"again"}'
  };

  const caller = new FakeLLMCaller([
    { text: "", message: new AIMessage({ content: "", tool_calls: [toolCall] } as any), toolCalls: [toolCall] },
    { text: "", message: new AIMessage({ content: "", tool_calls: [toolCall] } as any), toolCalls: [toolCall] },
    { text: "", message: new AIMessage({ content: "", tool_calls: [toolCall] } as any), toolCalls: [toolCall] }
  ]);

  const tools: IntentTool[] = [
    {
      name: "echo_tool",
      async invoke(input) {
        return { echoed: input };
      }
    }
  ];

  const harness = new IntentHarness(caller, tools, 5);
  const result = await harness.run({}, baseCtx);
  assert.equal(result.output.done, true);
  const toolMessages = result.output.transcript
    .filter((msg) => (msg as { _getType?: () => string })._getType?.() === "tool")
    .map((msg) => String((msg as { content?: unknown }).content ?? ""));
  assert.ok(toolMessages.some((content) => content.includes("Tool calls already completed")));
});

test("IntentHarness repairs parse failures then succeeds", async () => {
  const badCall = {
    id: "bad",
    name: "echo_tool",
    function: { name: "echo_tool", arguments: "not-json[" },
    arguments: "not-json["
  };
  const fixedCall = {
    id: "fixed",
    name: "echo_tool",
    function: { name: "echo_tool", arguments: '{"value":"ok"}' },
    arguments: '{"value":"ok"}'
  };

  const caller = new FakeLLMCaller([
    { text: "", message: new AIMessage({ content: "", tool_calls: [badCall] } as any), toolCalls: [badCall] },
    { text: "", message: new AIMessage({ content: "", tool_calls: [fixedCall] } as any), toolCalls: [fixedCall] },
    { text: "", message: new AIMessage({ content: "" }), toolCalls: [] }
  ]);

  let invokedWith: unknown;
  const tools: IntentTool[] = [
    {
      name: "echo_tool",
      async invoke(input) {
        invokedWith = input;
        return { echoed: input };
      }
    }
  ];

  const harness = new IntentHarness(caller, tools, 4);
  const result = await harness.run({}, baseCtx);

  const messages = result.output.transcript.map((msg) => String((msg as { content?: unknown }).content ?? ""));
  assert.ok(messages.some((m) => m.includes("Tool arguments parse failed")));
  assert.ok(messages.some((m) => m.includes("Repair the tool call")));
  assert.deepEqual(invokedWith, { value: "ok" });
});

test("IntentHarness stops after exceeding max correction attempts", async () => {
  const badCalls = ["not-json[", "bad[", "worse["].map((arg, idx) => ({
    id: `bad_${idx}`,
    name: "echo_tool",
    function: { name: "echo_tool", arguments: arg },
    arguments: arg
  }));

  const caller = new FakeLLMCaller([
    { text: "", message: new AIMessage({ content: "", tool_calls: [badCalls[0]] } as any), toolCalls: [badCalls[0]] },
    { text: "", message: new AIMessage({ content: "", tool_calls: [badCalls[1]] } as any), toolCalls: [badCalls[1]] },
    { text: "", message: new AIMessage({ content: "", tool_calls: [badCalls[2]] } as any), toolCalls: [badCalls[2]] }
  ]);

  const tools: IntentTool[] = [
    {
      name: "echo_tool",
      async invoke() {
        return "ok";
      }
    }
  ];

  const harness = new IntentHarness(caller, tools, 4);
  await assert.rejects(() => harness.run({}, baseCtx), /tool arguments could not be repaired/);
});

test("IntentHarness caps parallel tool execution and skips extras", async () => {
  const toolCalls = Array.from({ length: 5 }).map((_, idx) => ({
    id: `call_${idx}`,
    name: "echo_tool",
    function: { name: "echo_tool", arguments: `{"value":"${idx}"}` },
    arguments: `{"value":"${idx}"}`
  }));

  const caller = new FakeLLMCaller([
    {
      text: "",
      message: new AIMessage({ content: "", tool_calls: toolCalls } as any),
      toolCalls
    },
    { text: "", message: new AIMessage({ content: "" }), toolCalls: [] }
  ]);

  let invocations: string[] = [];
  const tools: IntentTool[] = [
    {
      name: "echo_tool",
      async invoke(input) {
        invocations.push(String((input as { value?: string }).value));
        return { echoed: input };
      }
    }
  ];

  const harness = new IntentHarness(caller, tools, 2);
  const result = await harness.run({}, baseCtx);

  assert.equal(invocations.length, 4);
  const toolMessages = result.output.transcript
    .filter((msg) => (msg as { _getType?: () => string })._getType?.() === "tool")
    .map((msg) => String((msg as { content?: unknown }).content ?? ""));
  assert.ok(toolMessages.some((content) => content.includes("exceeded max parallel tool calls")));
});

test("IntentHarness throws when a failing tool repeats three times", async () => {
  const repeatCall = {
    id: "repeat_fail",
    name: "flaky_tool",
    function: { name: "flaky_tool", arguments: "{}" },
    arguments: "{}"
  };

  const caller = new FakeLLMCaller([
    { text: "", message: new AIMessage({ content: "", tool_calls: [repeatCall] } as any), toolCalls: [repeatCall] },
    { text: "", message: new AIMessage({ content: "", tool_calls: [repeatCall] } as any), toolCalls: [repeatCall] },
    { text: "", message: new AIMessage({ content: "", tool_calls: [repeatCall] } as any), toolCalls: [repeatCall] }
  ]);

  const tools: IntentTool[] = [
    {
      name: "flaky_tool",
      async invoke() {
        throw new Error("fail");
      }
    }
  ];

  const harness = new IntentHarness(caller, tools, 5);
  await assert.rejects(() => harness.run({}, baseCtx), /repeated 3 times/);
});

test("IntentHarness streams tool calls and responses", async () => {
  const toolCall = {
    id: "call_stream",
    name: "echo_tool",
    function: { name: "echo_tool", arguments: '{"value":"test"}' },
    arguments: '{"value":"test"}'
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

  const streamEvents: any[] = [];
  const tools: IntentTool[] = [
    {
      name: "echo_tool",
      async invoke(input) {
        return { echoed: input };
      }
    }
  ];

  const harness = new IntentHarness(caller, tools, 3);
  const result = await harness.run({}, baseCtx, (event) => {
    streamEvents.push(event);
  });

  // Verify that we received streaming events
  assert.equal(streamEvents.length, 2);
  
  // First event should be tool call
  assert.equal(streamEvents[0].type, "tool_call");
  assert.equal(streamEvents[0].toolCall?.name, "echo_tool");
  
  // Second event should be tool response
  assert.equal(streamEvents[1].type, "tool_response");
  assert.equal(streamEvents[1].toolResponse?.toolName, "echo_tool");
  assert.ok(streamEvents[1].toolResponse?.content.includes("echoed"));
});


