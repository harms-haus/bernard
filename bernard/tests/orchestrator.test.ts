import assert from "node:assert/strict";
import test from "node:test";

import { AIMessage, HumanMessage } from "@langchain/core/messages";

import { Orchestrator } from "../agent/orchestrator/orchestrator";
import { buildHarnessConfig } from "../agent/orchestrator/config";
import { IntentHarness } from "../agent/harness/intent/intent.harness";
import { MemoryHarness } from "../agent/harness/memory/memory.harness";
import { ResponseHarness } from "../agent/harness/respond/respond.harness";
import { UtilityHarness } from "../agent/harness/utility/utility.harness";
import type { HarnessContext, LLMCaller, LLMResponse } from "../agent/harness/lib/types";

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


