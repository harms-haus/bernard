import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";

const noopRecordKeeper = () => {
  const toolResults: unknown[] = [];
  const modelResults: unknown[] = [];
  return {
    toolResults,
    modelResults,
    async recordToolResult(...args: unknown[]) {
      toolResults.push(args);
    },
    async recordOpenRouterResult(...args: unknown[]) {
      modelResults.push(args);
    }
  };
};

test("instrumented tools parse args and classify timeout/auth/other", async () => {
  const keeper = noopRecordKeeper();
  const failingTools = [
    {
      name: "timeout_tool",
      description: "fails with timeout",
      async invoke() {
        throw new Error("Request timeout");
      }
    },
    {
      name: "auth_tool",
      description: "fails auth",
      async invoke() {
        throw new Error("Auth failed");
      }
    },
    {
      name: "other_tool",
      description: "fails other",
      async invoke() {
        throw new Error("boom");
      }
    }
  ];

  // Build graph with a fake model that calls each tool once.
  class FakeChatOpenAI {
    constructor(_opts?: unknown) {}
    bindTools(tools: any[]) {
      return {
        async invoke(_messages: unknown[]) {
          const [t1, t2, t3] = tools;
          await assert.rejects(() => t1.invoke({ args: "{}" }), /timeout/i);
          await assert.rejects(() => t2.invoke({ args: "{}" }), /Auth/i);
          await assert.rejects(() => t3.invoke({ args: "{}" }), /boom/);
          // Return a no-tool-call message to end the loop.
          return new AIMessage("done");
        }
      };
    }
  }

  const { buildGraph } = await import("../lib/agent");
  const graph = buildGraph(
    {
      recordKeeper: keeper as any,
      turnId: "turn-timeout",
      conversationId: "conv-timeout",
      requestId: "req-timeout",
      token: "tok",
      model: "model-x"
    },
    { model: new FakeChatOpenAI() as any, tools: failingTools as any }
  );

  await graph.invoke({ messages: [new HumanMessage("hi")] });

  assert.equal(keeper.toolResults.length, 3);
  const errorTypes = keeper.toolResults.map((entry) => (entry as any)[2].errorType);
  assert.deepEqual(errorTypes.sort(), ["auth", "other", "timeout"].sort());
});

test("default buildGraph path constructs ChatOpenAI and parses string args", async () => {
  const toolInvocations: unknown[] = [];
  const keeper = noopRecordKeeper();

  const defaultTool = {
    name: "default_tool",
    description: "stub",
    async invoke(input: unknown) {
      toolInvocations.push(input);
      return { echoed: input };
    }
  };

  const FakeChatOpenAI = class {
    opts: unknown;
    private called = false;
    constructor(opts: unknown) {
      this.opts = opts;
    }
    bindTools(_tools: unknown[]) {
      return {
        async invoke(_messages: unknown[]) {
          if (!this.called) {
            this.called = true;
            return new AIMessage({
              content: "",
              tool_calls: [
                { id: "t1", type: "tool_call", name: "default_tool", args: '{"foo":"bar"}' } as any
              ],
              usage_metadata: { input_tokens: 3, output_tokens: 1 }
            } as any);
          }
          return new AIMessage({
            content: "done",
            usage_metadata: { input_tokens: 1, output_tokens: 1 }
          } as any);
        }
      };
    }
  };

  const { buildGraph } = await import("../lib/agent?default-path");
  const graph = buildGraph({
    recordKeeper: keeper as any,
    turnId: "turn-default",
    conversationId: "conv-default",
    requestId: "req-default",
    token: "tok",
    model: "model-default"
  }, { tools: [defaultTool as any], ChatOpenAI: FakeChatOpenAI as any });

  await graph.invoke({ messages: [new HumanMessage("hello")] });

  assert.ok(toolInvocations.length >= 1);
  assert.deepEqual(toolInvocations[0], { foo: "bar" });
  assert.equal(keeper.toolResults[0][2].ok, true);
  assert.ok(keeper.modelResults.length >= 1);
});

test("instrumented tool falls back to raw input when JSON parse fails", async () => {
  const toolInvocations: unknown[] = [];
  const keeper = noopRecordKeeper();

  const defaultTool = {
    name: "default_tool",
    description: "stub",
    async invoke(input: unknown) {
      toolInvocations.push(input);
      return { echoed: input };
    }
  };

  const FakeChatOpenAI = class {
    bindTools() {
      return {
        async invoke() {
          return new AIMessage({
            content: "",
            tool_calls: [
              { id: "bad", type: "tool_call", name: "default_tool", args: "{not-json" } as any
            ]
          } as any);
        }
      };
    }
  };

  const { buildGraph } = await import("../lib/agent?parse-fallback");
  const graph = buildGraph({
    recordKeeper: keeper as any,
    turnId: "turn-badjson",
    conversationId: "conv-badjson",
    requestId: "req-badjson",
    token: "tok",
    model: "model-default"
  }, { tools: [defaultTool as any], ChatOpenAI: FakeChatOpenAI as any });

  await graph.invoke({ messages: [new HumanMessage("hello")] });

  assert.ok(toolInvocations.length >= 1);
  assert.equal(toolInvocations[0], "{not-json");
});

test("stream yields intermediate states through tool loop", async () => {
  const toolInvocations: unknown[] = [];
  const keeper = noopRecordKeeper();

  const defaultTool = {
    name: "default_tool",
    description: "stub",
    async invoke(input: unknown) {
      toolInvocations.push(input);
      return "done";
    }
  };

  const FakeChatOpenAI = class {
    private called = false;
    bindTools() {
      return {
        async invoke() {
          if (!this.called) {
            this.called = true;
            return new AIMessage({
              content: "",
              tool_calls: [
                { id: "t1", type: "tool_call", name: "default_tool", args: '{"foo":"bar"}' } as any
              ]
            } as any);
          }
          return new AIMessage("done");
        }
      };
    }
  };

  const { buildGraph } = await import("../lib/agent?streaming");
  const graph = buildGraph({
    recordKeeper: keeper as any,
    turnId: "turn-stream",
    conversationId: "conv-stream",
    requestId: "req-stream",
    token: "tok",
    model: "model-stream"
  }, { tools: [defaultTool as any], ChatOpenAI: FakeChatOpenAI as any });

  const chunks: unknown[] = [];
  for await (const chunk of await graph.stream({ messages: [new HumanMessage("hello")] })) {
    chunks.push(chunk);
  }

  assert.ok(chunks.length >= 2, "expected intermediate stream updates");
  assert.ok(toolInvocations.length >= 1);
});

test("falls back to env defaults when ctx model is missing", async () => {
  const keeper = noopRecordKeeper();
  const defaultTool = {
    name: "default_tool",
    description: "noop",
    async invoke() {
      return "ok";
    }
  };

  const constructedOpts: any[] = [];
  const FakeChatOpenAI = class {
    opts: any;
    constructor(opts: any) {
      this.opts = opts;
      constructedOpts.push(opts);
    }
    bindTools() {
      return {
        async invoke() {
          return new AIMessage("done");
        }
      };
    }
  };

  const originalModel = process.env["OPENROUTER_MODEL"];
  const originalBase = process.env["OPENROUTER_BASE_URL"];
  process.env["OPENROUTER_MODEL"] = "env-model";
  process.env["OPENROUTER_BASE_URL"] = "https://env-base.example";

  try {
    const { buildGraph } = await import("../lib/agent?env-fallback");
    const graph = buildGraph({
      recordKeeper: keeper as any,
      turnId: "turn-env",
      conversationId: "conv-env",
      requestId: "req-env",
      token: "tok",
      // Intentionally undefined to trigger env fallback
      model: undefined as unknown as string
    }, { tools: [defaultTool as any], ChatOpenAI: FakeChatOpenAI as any });

    await graph.invoke({ messages: [new HumanMessage("hi")] });
    assert.ok(constructedOpts[0]);
    assert.equal(constructedOpts[0].model, "env-model");
    assert.equal(constructedOpts[0].configuration.baseURL, "https://env-base.example");
  } finally {
    process.env["OPENROUTER_MODEL"] = originalModel;
    process.env["OPENROUTER_BASE_URL"] = originalBase;
  }
});

test("uses baked-in defaults when no ctx or env model configured", async () => {
  const keeper = noopRecordKeeper();
  const defaultTool = {
    name: "default_tool",
    description: "noop",
    async invoke() {
      return "ok";
    }
  };

  const constructedOpts: any[] = [];
  const FakeChatOpenAI = class {
    opts: any;
    constructor(opts: any) {
      this.opts = opts;
      constructedOpts.push(opts);
    }
    bindTools() {
      return {
        async invoke() {
          return new AIMessage("done");
        }
      };
    }
  };

  const originalModel = process.env["OPENROUTER_MODEL"];
  const originalBase = process.env["OPENROUTER_BASE_URL"];
  delete process.env["OPENROUTER_MODEL"];
  delete process.env["OPENROUTER_BASE_URL"];

  try {
    const { buildGraph } = await import("../lib/agent?env-fallback-default");
    const graph = buildGraph({
      recordKeeper: keeper as any,
      turnId: "turn-env2",
      conversationId: "conv-env2",
      requestId: "req-env2",
      token: "tok",
      model: undefined as unknown as string
    }, { tools: [defaultTool as any], ChatOpenAI: FakeChatOpenAI as any });

    await graph.invoke({ messages: [new HumanMessage("hi")] });
    assert.equal(constructedOpts[0].model, "kwaipilot/KAT-coder-v1:free");
    assert.equal(constructedOpts[0].configuration.baseURL, "https://openrouter.ai/api/v1");
  } finally {
    if (originalModel === undefined) {
      delete process.env["OPENROUTER_MODEL"];
    } else {
      process.env["OPENROUTER_MODEL"] = originalModel;
    }
    if (originalBase === undefined) {
      delete process.env["OPENROUTER_BASE_URL"];
    } else {
      process.env["OPENROUTER_BASE_URL"] = originalBase;
    }
  }
});

test("supports custom tool node and onUpdate hooks", async () => {
  const updates: Array<unknown> = [];
  const keeper = noopRecordKeeper();

  const defaultTool = {
    name: "default_tool",
    description: "stub",
    async invoke() {
      return "ok";
    }
  };

  const FakeChatOpenAI = class {
    bindTools() {
      return {
        async invoke() {
          return new AIMessage({
            content: "",
            tool_calls: [{ id: "c1", type: "tool_call", name: "default_tool", args: { val: 1 } } as any]
          } as any);
        }
      };
    }
  };

  const customToolNode = {
    async invoke() {
      return [
        new ToolMessage({
          content: "ok",
          tool_call_id: "c1",
          name: "default_tool"
        })
      ];
    }
  };

  const { buildGraph } = await import("../lib/agent?custom-toolnode");
  const graph = buildGraph({
    recordKeeper: keeper as any,
    turnId: "turn-onupdate",
    conversationId: "conv-onupdate",
    requestId: "req-onupdate",
    token: "tok",
    model: "model-onupdate"
  }, { tools: [defaultTool as any], ChatOpenAI: FakeChatOpenAI as any, toolNode: customToolNode as any, onUpdate: (msgs) => updates.push(msgs) });

  await graph.invoke({ messages: [new HumanMessage("hi")] });

  assert.ok(updates.length >= 2, "should receive updates for model and tool steps");
  assert.equal(keeper.modelResults[0][2].tokensIn, undefined);
  assert.equal(keeper.modelResults[0][2].tokensOut, undefined);
});

test("handles unexpected tool node output gracefully", async () => {
  const keeper = noopRecordKeeper();
  const defaultTool = {
    name: "default_tool",
    description: "noop",
    async invoke() {
      return "ok";
    }
  };

  const FakeChatOpenAI = class {
    private called = false;
    bindTools() {
      return {
        async invoke() {
          if (this.called) {
            return new AIMessage("done");
          }
          this.called = true;
          return new AIMessage({
            content: "",
            tool_calls: [{ id: "c1", type: "tool_call", name: "default_tool", args: { val: 1 } } as any]
          } as any);
        }
      };
    }
  };

  const oddToolNode = {
    async invoke() {
      return "unexpected";
    }
  };

  const { buildGraph } = await import("../lib/agent?odd-toolnode");
  const graph = buildGraph({
    recordKeeper: keeper as any,
    turnId: "turn-odd",
    conversationId: "conv-odd",
    requestId: "req-odd",
    token: "tok",
    model: "model-odd"
  }, { tools: [defaultTool as any], ChatOpenAI: FakeChatOpenAI as any, toolNode: oddToolNode as any });

  const result = await graph.invoke({ messages: [new HumanMessage("hi")] });
  assert.ok(result.messages.length >= 2);
});

test("records token usage from response_metadata path", async () => {
  const keeper = noopRecordKeeper();
  const defaultTool = {
    name: "default_tool",
    description: "noop",
    async invoke() {
      return "ok";
    }
  };

  const FakeChatOpenAI = class {
    bindTools() {
      return {
        async invoke() {
          return new AIMessage({
            content: "done",
            response_metadata: { token_usage: { prompt_tokens: 4, completion_tokens: 2 } }
          } as any);
        }
      };
    }
  };

  const { buildGraph } = await import("../lib/agent?response-usage");
  await buildGraph(
    {
      recordKeeper: keeper as any,
      turnId: "turn-usage",
      conversationId: "conv-usage",
      requestId: "req-usage",
      token: "tok",
      model: "model-usage"
    },
    { tools: [defaultTool as any], ChatOpenAI: FakeChatOpenAI as any }
  ).invoke({ messages: [new HumanMessage("hi")] });

  assert.equal(keeper.modelResults[0][2].tokensIn, 4);
  assert.equal(keeper.modelResults[0][2].tokensOut, 2);
});

test("test hooks cover edge branches", async () => {
  const { __agentTestHooks, mapOpenAIToMessages, buildGraph } = await import("../lib/agent?hooks");

  assert.equal(__agentTestHooks.classifyError(new Error("429 boom")), "rate_limit");
  assert.equal(__agentTestHooks.classifyError(new Error("timeout exceeded")), "timeout");
  assert.equal(__agentTestHooks.classifyError(new Error("auth missing")), "auth");
  assert.equal(__agentTestHooks.classifyError("unknown"), "other");

  const noTool = new AIMessage({ content: "", tool_calls: [] as any });
  assert.equal(__agentTestHooks.hasToolCall([noTool]), false);

  const usageEmpty = __agentTestHooks.extractTokenUsage(null);
  assert.deepEqual(usageEmpty, {});
  const usageEmptyObject = __agentTestHooks.extractTokenUsage({});
  assert.deepEqual(usageEmptyObject, {});

  assert.throws(
    () => mapOpenAIToMessages([{ role: "userX", content: "bad" } as any]),
    /Unsupported role/
  );

  const toolInputs: unknown[] = [];
  const ctx = {
    recordKeeper: {
      async recordToolResult() {},
      async recordOpenRouterResult() {}
    },
    turnId: "t",
    conversationId: "c",
    requestId: "r",
    token: "tok",
    model: "m"
  } as any;

  const [wrapped] = __agentTestHooks.instrumentTools(ctx, [
    {
      name: "inline",
      description: "captures args",
      async invoke(input: unknown) {
        toolInputs.push(input);
        return "ok";
      }
    }
  ] as any);

  await wrapped.invoke({}, { toolCall: { args: { fromRunOpts: true } } });
  assert.deepEqual(toolInputs.pop(), { fromRunOpts: true });
  await wrapped.invoke({}, { toolCall: { function: { arguments: '{"via":"function"}' } } });
  assert.deepEqual(toolInputs.pop(), { via: "function" });

  const keeper = noopRecordKeeper();
  const FakeChatOpenAI = class {
    bindTools() {
      return { invoke: async () => new AIMessage("done") };
    }
  };
  await buildGraph(
    {
      recordKeeper: keeper as any,
      turnId: "turn-hooks",
      conversationId: "conv-hooks",
      requestId: "req-hooks",
      token: "tok",
      model: "model-hooks"
    },
    { tools: [], ChatOpenAI: FakeChatOpenAI as any }
  ).invoke({ messages: [new HumanMessage("hi")] });
});

