import assert from "node:assert/strict";
import test from "node:test";

import { SystemMessage } from "@langchain/core/messages";

import { TOOL_FORMAT_INSTRUCTIONS } from "../lib/agentRunner";
import { intentSystemPrompt } from "../lib/systemPrompt";
import {
  buildToolValidationMessage,
  canonicalToolCalls,
  stripIntentOnlySystemMessages,
  validateToolCalls
} from "../lib/tools/toolCalls";

test("validateToolCalls surfaces invalid entries and normalizes args", () => {
  const allowed = new Set(["hello"]);
  const { valid, invalid } = validateToolCalls(
    [
      { id: "", name: "hello", arguments: '{"x":1}' } as any,
      { function: { name: "" } } as any
    ],
    allowed
  );

  assert.equal(invalid.length, 2);
  assert.ok(buildToolValidationMessage(invalid).includes("missing a valid id"));

  assert.equal(valid.length, 0);
});

test("canonicalToolCalls sorts by name and arguments for stable signatures", () => {
  const calls = [
    { name: "b", function: { name: "b", arguments: '{"k":2}' } },
    { name: "a", function: { name: "a", arguments: '{"k":1}' } }
  ] as any[];

  const signature = canonicalToolCalls(calls);
  assert.equal(
    signature,
    '[{"name":"a","args":{"k":1}},{"name":"b","args":{"k":2}}]'
  );
});

test("stripIntentOnlySystemMessages removes prompt scaffolding", () => {
  const messages = [
    new SystemMessage(TOOL_FORMAT_INSTRUCTIONS),
    new SystemMessage(intentSystemPrompt),
    new SystemMessage("keep-me")
  ] as any;

  const filtered = stripIntentOnlySystemMessages(messages, TOOL_FORMAT_INSTRUCTIONS, intentSystemPrompt);
  assert.equal(filtered.length, 1);
  assert.equal((filtered[0] as any).content, "keep-me");
});


