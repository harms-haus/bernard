import assert from "node:assert/strict";
import test from "node:test";

import { SystemMessage } from "@langchain/core/messages";

import { TOOL_FORMAT_INSTRUCTIONS } from "../lib/agentRunner";
import { buildSystemPrompts, MAX_PARALLEL_TOOL_CALLS } from "../lib/systemPrompt";
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
  const { intentSystemPrompt } = buildSystemPrompts(new Date("2025-01-01T12:00:00Z"));
  const messages = [
    new SystemMessage(TOOL_FORMAT_INSTRUCTIONS),
    new SystemMessage(intentSystemPrompt),
    new SystemMessage("keep-me")
  ] as any;

  const filtered = stripIntentOnlySystemMessages(messages, TOOL_FORMAT_INSTRUCTIONS, intentSystemPrompt);
  assert.equal(filtered.length, 1);
  assert.equal((filtered[0] as any).content, "keep-me");
});

test("validateToolCalls rejects duplicate parallel calls when uniqueness enforced", () => {
  const allowed = new Set(["echo"]);
  const { valid, invalid } = validateToolCalls(
    [
      { id: "echo_1", name: "echo", arguments: '{"x":1}' } as any,
      { id: "echo_2", name: "echo", arguments: '{"x":1}' } as any
    ],
    allowed,
    { enforceUniqueParallelCalls: true }
  );

  assert.equal(valid.length, 1);
  assert.equal(invalid.length, 1);
  assert.ok(invalid[0]?.reason.toLowerCase().includes("unique"));
});

test("validateToolCalls enforces maximum parallel calls", () => {
  const allowed = new Set(["a", "b", "c", "d"]);
  const { valid, invalid } = validateToolCalls(
    [
      { id: "1", name: "a", arguments: '{"k":1}' } as any,
      { id: "2", name: "b", arguments: '{"k":2}' } as any,
      { id: "3", name: "c", arguments: '{"k":3}' } as any,
      { id: "4", name: "d", arguments: '{"k":4}' } as any
    ],
    allowed,
    { maxParallelCalls: MAX_PARALLEL_TOOL_CALLS }
  );

  assert.equal(valid.length, MAX_PARALLEL_TOOL_CALLS);
  assert.equal(invalid.length, 1);
  assert.ok(invalid[0]?.reason.includes(String(MAX_PARALLEL_TOOL_CALLS)));
});


