import assert from "node:assert/strict";
import test from "node:test";

import { AIMessage, HumanMessage } from "@langchain/core/messages";

import { __runnerTestHooks } from "../lib/agentRunner";
import { buildGraph } from "../lib/agent";
import { bernardSystemPromptBase, MAX_PARALLEL_TOOL_CALLS } from "../lib/systemPrompt";

const { shouldOmitIntentMessage, stripEmptyAssistantMessages } = __runnerTestHooks;

test("shouldOmitIntentMessage only drops empty, tool-less intent outputs", () => {
  const emptyIntent = new AIMessage({ content: "" });
  assert.equal(shouldOmitIntentMessage(emptyIntent, []), true);

  const textIntent = new AIMessage({ content: "respond directly" });
  assert.equal(shouldOmitIntentMessage(textIntent, []), false);

  const toolCall = {
    id: "call_1",
    type: "function",
    function: { name: "echo", arguments: "{}" }
  };
  const toolIntent = new AIMessage({ content: "", tool_calls: [toolCall] } as any);
  assert.equal(shouldOmitIntentMessage(toolIntent, [toolCall] as any), false);
});

test("stripEmptyAssistantMessages removes empty assistant turns but keeps tool calls", () => {
  const human = new HumanMessage("hi");
  const emptyAssistant = new AIMessage({ content: "" });
  const assistantWithText = new AIMessage({ content: "non-empty" });
  const toolCall = {
    id: "call_2",
    type: "function",
    function: { name: "echo", arguments: "{}" }
  };
  const assistantWithTool = new AIMessage({ content: "", tool_calls: [toolCall] } as any);

  const filtered = stripEmptyAssistantMessages([human, emptyAssistant, assistantWithText, assistantWithTool]);

  assert.equal(filtered.length, 3);
  assert.ok(filtered.includes(human));
  assert.ok(filtered.includes(assistantWithText));
  assert.ok(filtered.includes(assistantWithTool));
});

const makeKeeper = () => {
  const toolResults: unknown[] = [];
  return {
    toolResults,
    modelResults: [] as unknown[],
    llmCalls: [] as unknown[],
    async recordToolResult(...args: unknown[]) {
      toolResults.push(args);
    },
    async recordOpenRouterResult(..._args: unknown[]) {},
    async recordLLMCall(..._args: unknown[]) {}
  };
};

test("runner forces a respond when identical tool calls repeat", async () => {
  const keeper = makeKeeper();
  let toolInvocations = 0;

  const echoTool = {
    name: "echo",
    description: "returns ok",
    async invoke() {
      toolInvocations += 1;
      return "ok";
    }
  };

  class FakeChatOpenAI {
    constructor(_opts?: unknown) {}
    bindTools(_tools: any[]) {
      let callCount = 0;
      return {
        async invoke() {
          callCount += 1;
          return new AIMessage({
            content: "",
            tool_calls: [
              {
                id: `echo_${callCount}`,
                type: "tool_call",
                function: { name: "echo", arguments: '{"repeat":true}' }
              } as any
            ]
          });
        }
      };
    }

    async invoke() {
      return new AIMessage("done");
    }
  }

  const graph = buildGraph(
    {
      recordKeeper: keeper as any,
      turnId: "turn-repeat",
      conversationId: "conv-repeat",
      requestId: "req-repeat",
      token: "tok",
      model: "model-repeat"
    },
    { tools: [echoTool as any], ChatOpenAI: FakeChatOpenAI as any }
  );

  const result = await graph.invoke({ messages: [new HumanMessage("hi")] });
  const final = result.messages[result.messages.length - 1] as any;

  assert.equal(final.content, "done");
  // Identical tool calls are capped after a small number of repeats.
  assert.ok(toolInvocations >= 2 && toolInvocations <= 3);
  assert.ok(
    keeper.toolResults.length === toolInvocations || keeper.toolResults.length === toolInvocations + 1
  );
});

test("response context omits tool scaffolding for final model call", async () => {
  const keeper = {
    llmCalls: [] as Array<[string, Record<string, unknown>]>,
    async recordToolResult(..._args: unknown[]) {},
    async recordOpenRouterResult(..._args: unknown[]) {},
    async recordLLMCall(...args: [string, Record<string, unknown>]) {
      this.llmCalls.push(args);
    }
  };

  const responseInvocations: unknown[][] = [];
  const responseModel = {
    async invoke(messages: unknown[]) {
      responseInvocations.push(messages);
      return new AIMessage("done");
    }
  };

  let intentCalls = 0;
  const intentModel = {
    bindTools() {
      return {
        async invoke() {
          intentCalls += 1;
          if (intentCalls === 1) {
            return new AIMessage({
              content: "",
              tool_calls: [
                {
                  id: "echo_1",
                  type: "tool_call",
                  function: { name: "echo", arguments: '{"echo":"hi"}' }
                } as any
              ]
            });
          }
          return new AIMessage({ content: "" });
        }
      };
    }
  };

  const tools = [
    {
      name: "echo",
      description: "returns ok",
      verifyConfiguration: () => true,
      async invoke({ echo }: { echo?: string }) {
        return echo ?? "ok";
      }
    },
    {
      name: "broken",
      description: "always unavailable",
      verifyConfiguration: () => ({ ok: false, reason: "missing config" }),
      async invoke() {
        return "should not run";
      }
    }
  ];

  const graph = buildGraph(
    {
      recordKeeper: keeper as any,
      turnId: "turn-context",
      conversationId: "conv-context",
      requestId: "req-context",
      token: "tok",
      responseModel: "response-model"
    },
    { intentModel: intentModel as any, responseModel: responseModel as any, tools: tools as any }
  );

  const result = await graph.invoke({ messages: [new HumanMessage("hi there")] });
  const final = result.messages[result.messages.length - 1] as any;
  assert.equal(final.content, "done");

  const responseCall = keeper.llmCalls.find(([, payload]) => {
    const ctx = (payload as any).context as AIMessage[] | undefined;
    if (!Array.isArray(ctx)) return false;
    return ctx.some(
      (m: any) => m._getType?.() === "system" && typeof m.content === "string" && m.content.startsWith(bernardSystemPromptBase)
    );
  });
  assert.ok(responseCall, "expected response llm call with response prompt to be recorded");
  const responseContext = ((responseCall as [string, { context: AIMessage[] }])[1].context ?? []) as any[];

  const systemMessages = responseContext.filter((m) => (m as any)._getType?.() === "system");
  const systemContents = systemMessages.map((m) => (m as any).content) as string[];
  const responsePrompts = systemContents.filter(
    (c) => typeof c === "string" && c.startsWith(bernardSystemPromptBase)
  );
  assert.ok(responsePrompts.length >= 1, "response system prompt missing");
  assert.ok(responsePrompts.some((c) => /Current date\/time:/i.test(c)), "response prompt missing timestamp");
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timeZone) {
    assert.ok(
      responsePrompts.some((c) => c.includes(timeZone)),
      "response system prompt missing timezone"
    );
  }

  assert.ok(responseContext.some((m) => (m as any)._getType?.() === "human"), "user question should be present");
  assert.ok(
    responseContext.some(
      (m) =>
        Array.isArray((m as any).tool_calls) &&
        (m as any).tool_calls.some((tc: any) => (tc.function?.name ?? tc.name) === "echo")
    ),
    "tool call context should be present"
  );
  assert.ok(
    responseContext.some((m) => (m as any)._getType?.() === "tool" && (m as any).name === "echo"),
    "tool result should be present"
  );
  assert.ok(
    !responseContext.some(
      (m) =>
        (m as any)._getType?.() === "system" &&
        typeof (m as any).content === "string" &&
        (m as any).content.toLowerCase().includes("unavailable tools")
    ),
    "tool availability context should be omitted"
  );
  assert.ok(responseInvocations.length >= 1, "response model should be invoked");
});

test("runner blocks turns with too many parallel tool calls", async () => {
  const keeper = makeKeeper();
  let toolInvocations = 0;

  const echoTool = {
    name: "echo",
    description: "returns ok",
    async invoke() {
      toolInvocations += 1;
      return "ok";
    }
  };

  const responseModel = {
    async invoke() {
      return new AIMessage("done");
    }
  };

  const intentModel = {
    bindTools() {
      let callCount = 0;
      const overLimitCalls = Array.from({ length: MAX_PARALLEL_TOOL_CALLS + 1 }, (_value, index) => ({
        id: `echo_${index}`,
        type: "tool_call",
        function: { name: "echo", arguments: "{}" }
      })) as any[];

      return {
        async invoke() {
          callCount += 1;
          if (callCount === 1) {
            return new AIMessage({
              content: "",
              tool_calls: overLimitCalls
            });
          }
          return new AIMessage({ content: "" });
        }
      };
    }
  };

  const graph = buildGraph(
    {
      recordKeeper: keeper as any,
      turnId: "turn-too-many",
      conversationId: "conv-too-many",
      requestId: "req-too-many",
      token: "tok"
    },
    { intentModel: intentModel as any, responseModel: responseModel as any, tools: [echoTool as any] }
  );

  const result = await graph.invoke({ messages: [new HumanMessage("hi")] });
  assert.equal(toolInvocations, 0, "tool calls should not execute when over the parallel limit");
  const validationMessage = result.messages.find(
    (m: any) =>
      m?._getType?.() === "system" &&
      typeof m.content === "string" &&
      m.content.includes("Too many parallel tool calls")
  );
  assert.ok(validationMessage, "parallel limit violation should be surfaced as system feedback");
});

test("runner blocks duplicate parallel tool calls", async () => {
  const keeper = makeKeeper();
  let toolInvocations = 0;

  const echoTool = {
    name: "echo",
    description: "returns ok",
    async invoke() {
      toolInvocations += 1;
      return "ok";
    }
  };

  const responseModel = {
    async invoke() {
      return new AIMessage("done");
    }
  };

  const intentModel = {
    bindTools() {
      let callCount = 0;
      return {
        async invoke() {
          callCount += 1;
          if (callCount === 1) {
            return new AIMessage({
              content: "",
              tool_calls: [
                {
                  id: "echo_1",
                  type: "tool_call",
                  function: { name: "echo", arguments: '{"x":1}' }
                } as any,
                {
                  id: "echo_dup",
                  type: "tool_call",
                  function: { name: "echo", arguments: '{"x":1}' }
                } as any
              ]
            });
          }
          return new AIMessage({ content: "" });
        }
      };
    }
  };

  const graph = buildGraph(
    {
      recordKeeper: keeper as any,
      turnId: "turn-duplicates",
      conversationId: "conv-duplicates",
      requestId: "req-duplicates",
      token: "tok"
    },
    { intentModel: intentModel as any, responseModel: responseModel as any, tools: [echoTool as any] }
  );

  const result = await graph.invoke({ messages: [new HumanMessage("hi")] });
  assert.equal(toolInvocations, 0, "duplicate tool calls should not execute");
  const duplicateValidation = result.messages.find(
    (m: any) =>
      m?._getType?.() === "system" &&
      typeof m.content === "string" &&
      m.content.includes("Parallel tool calls must be unique")
  );
  assert.ok(duplicateValidation, "duplicate parallel calls should be surfaced as a validation failure");
});

test("intent tool calls drop response text and parse JSON-only portion", async () => {
  const keeper = {
    toolResults: [] as unknown[],
    routerResults: [] as Array<[string, string, Record<string, unknown>]>,
    llmCalls: [] as unknown[],
    async recordToolResult(...args: unknown[]) {
      this.toolResults.push(args);
    },
    async recordOpenRouterResult(...args: [string, string, Record<string, unknown>]) {
      this.routerResults.push(args);
    },
    async recordLLMCall(...args: unknown[]) {
      this.llmCalls.push(args);
    }
  };

  const echoInputs: unknown[] = [];
  const echoTool = {
    name: "echo",
    description: "returns input",
    async invoke(input: unknown) {
      echoInputs.push(input);
      return "ok";
    }
  };

  const intentModel = {
    bindTools() {
      let callCount = 0;
      return {
        async invoke() {
          callCount += 1;
          if (callCount === 1) {
            return new AIMessage({
              content:
                "I will issue a tool call now.\n```json\n{\"tool_calls\":[{\"id\":\"echo-1\",\"type\":\"function\",\"function\":{\"name\":\"echo\",\"arguments\":\"{\\\"phrase\\\":\\\"hi\\\"}\"}}]}\n```\nThe rest of this text should be discarded.",
              response_metadata: { token_usage: { prompt_tokens: 9, completion_tokens: 3 } }
            } as any);
          }
          return new AIMessage({ content: "" });
        }
      };
    }
  };

  const responseModel = {
    async invoke() {
      return new AIMessage("done");
    }
  };

  const graph = buildGraph(
    {
      recordKeeper: keeper as any,
      turnId: "turn-intent-sanitize",
      conversationId: "conv-intent-sanitize",
      requestId: "req-intent-sanitize",
      token: "tok",
      intentModel: "intent-model",
      responseModel: "response-model"
    },
    { intentModel: intentModel as any, responseModel: responseModel as any, tools: [echoTool as any] }
  );

  const result = await graph.invoke({ messages: [new HumanMessage("ping")] });

  const intentMessages = result.messages.filter(
    (m: any) => m?._getType?.() === "ai" && Array.isArray(m.tool_calls) && m.tool_calls.length
  );
  assert.equal(intentMessages.length, 1, "intent tool call message should be present");
  const intentMessage = intentMessages[0] as any;
  assert.equal(intentMessage.content, "", "intent message content should be stripped");
  assert.equal(intentMessage.tool_calls[0]?.function?.name, "echo");
  assert.equal(intentMessage.tool_calls[0]?.function?.arguments, '{"phrase":"hi"}');

  assert.equal(echoInputs.length, 1, "tool should execute once");
  assert.deepEqual(echoInputs[0], { phrase: "hi" });

  const intentMetrics = keeper.routerResults.find(([, modelName]) => modelName === "intent-model");
  assert.ok(intentMetrics, "intent model metrics should be recorded");
  const intentPayload = intentMetrics ? (intentMetrics[2] as Record<string, unknown>) : {};
  assert.equal(intentPayload["tokensIn"], 9);
  assert.equal(intentPayload["tokensOut"], 3);

  const leakedIntentText = result.messages.some(
    (m: any) => typeof m?.content === "string" && m.content.includes("I will issue a tool call")
  );
  assert.ok(!leakedIntentText, "intent response text should not appear in history");
});


