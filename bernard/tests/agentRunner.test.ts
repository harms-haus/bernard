import assert from "node:assert/strict";
import test from "node:test";

import { AIMessage, HumanMessage } from "@langchain/core/messages";

import { buildGraph } from "../lib/agent";
import { bernardSystemPromptBase } from "../lib/systemPrompt";

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
          return new AIMessage({
            content: "",
            tool_calls: [
              {
                id: "respond_1",
                type: "tool_call",
                function: { name: "respond", arguments: "{}" }
              } as any
            ]
          });
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


