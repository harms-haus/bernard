import assert from "node:assert/strict";
import test from "node:test";

import { AIMessage, HumanMessage } from "@langchain/core/messages";

import { buildGraph } from "../lib/agent";

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


