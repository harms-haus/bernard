import assert from "node:assert/strict";
import test from "node:test";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

import { mapOpenAIToMessages } from "../lib/agent";

test("mapOpenAIToMessages converts OpenAI-style messages", () => {
  const input = [
    { role: "system", content: "You are helpful" },
    { role: "user", content: "Hello" },
    {
      role: "assistant",
      content: "Hi",
      tool_calls: [{ id: "1", type: "function", function: { name: "noop", arguments: "{}" } }]
    }
  ];

  const output = mapOpenAIToMessages(input as any);
  assert.equal(output.length, 3);
  assert.ok(output[0] instanceof SystemMessage);
  assert.ok(output[1] instanceof HumanMessage);
  assert.ok(output[2] instanceof AIMessage);
  assert.equal((output[2] as AIMessage).tool_calls?.length, 1);
});

