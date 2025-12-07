import assert from "node:assert/strict";
import test from "node:test";

import { AIMessage } from "@langchain/core/messages";

import { __agentRouteTestHooks } from "../app/api/agent/route";

test("extractMessagesFromChunk captures top-level messages", () => {
  const message = new AIMessage("hello");
  const chunk = { messages: [message] };

  const result = __agentRouteTestHooks.extractMessagesFromChunk(chunk);

  assert.ok(Array.isArray(result));
  assert.equal(result?.length, 1);
  assert.equal(result?.[0], message);
});


