import assert from "node:assert/strict";
import { test } from "vitest";

import type { BaseMessage } from "@langchain/core/messages";

import { NextRequest } from "next/server";

import { chunkContent, buildToolChunks } from "../lib/openai/chatChunks";
import { buildRouterLLM, buildResponseLLM } from "../lib/openai/modelBuilders";
import {
  buildUsage,
  ensureBernardModel,
  finalizeTurn,
  normalizeStop,
  parseJsonBody,
  rejectUnsupportedKeys
} from "../app/api/v1/_lib/openai/request";
import { BERNARD_MODEL_ID } from "../app/api/v1/_lib/openai";
import { resolveBaseUrl } from "../lib/config/models";

test("normalizeStop returns arrays for strings and preserves arrays", () => {
  assert.deepEqual(normalizeStop("stop"), ["stop"]);
  assert.deepEqual(normalizeStop(["a", "b"]), ["a", "b"]);
  assert.equal(normalizeStop(null), undefined);
  assert.equal(normalizeStop(undefined), undefined);
});

test("buildUsage maps input/output tokens when present", () => {
  assert.deepEqual(buildUsage({ input_tokens: 5, output_tokens: 7 }), {
    prompt_tokens: 5,
    completion_tokens: 7,
    total_tokens: 12
  });
  assert.equal(buildUsage({}), undefined);
});

test("chunkContent splits long text into multiple parts", () => {
  const chunks = chunkContent("hello world this is a longer chunk of text to split");
  assert.ok(chunks.length > 1);
  assert.equal(chunks.join("").replace(/\s+/g, " ").trim(), "hello world this is a longer chunk of text to split");
});

test("buildToolChunks groups tool calls and outputs", () => {
  const callMessage = {
    type: "ai",
    tool_calls: [{ id: "call-1", function: { name: "lookup", arguments: "{}" } }]
  } as unknown as BaseMessage;
  const outputMessage = {
    type: "tool",
    tool_call_id: "call-1",
    content: "result"
  } as unknown as BaseMessage;

  const chunks = buildToolChunks([callMessage, outputMessage], 0);
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0].tool_calls[0].function.name, "lookup");
  assert.equal(chunks[0].tool_outputs[0].content, "result");
});

test("parseJsonBody returns ok on valid JSON and error on invalid", async () => {
  const validReq = new NextRequest(
    new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ foo: "bar" }) })
  );
  const valid = await parseJsonBody<{ foo: string }>(validReq);
  assert.deepEqual("ok" in valid ? valid.ok.foo : null, "bar");

  const invalidReq = new NextRequest(new Request("http://localhost/api", { method: "POST", body: "{" }));
  const invalid = await parseJsonBody<{ foo: string }>(invalidReq);
  assert.ok("error" in invalid);
  if ("error" in invalid) {
    assert.equal(invalid.error.status, 400);
  }
});

test("ensureBernardModel accepts default/bernard-v1 and rejects others", () => {
  assert.equal(ensureBernardModel(undefined), null);
  assert.equal(ensureBernardModel(BERNARD_MODEL_ID), null);
  const res = ensureBernardModel("other");
  assert.ok(res instanceof Response);
  if (res instanceof Response) {
    assert.equal(res.status, 404);
  }
});

test("rejectUnsupportedKeys blocks present unsupported keys", () => {
  const body = { a: 1, b: null } as Record<string, unknown>;
  const err = rejectUnsupportedKeys(body, ["a"]);
  assert.ok(err);
  if (err) assert.equal(err.status, 400);

  const ok = rejectUnsupportedKeys({ a: undefined }, ["a"]);
  assert.equal(ok, null);
});

test("finalizeTurn records latency and status", async () => {
  const calls: Array<{ fn: string; args: unknown[] }> = [];
  const keeper = {
    endTurn: async (...args: unknown[]) => {
      calls.push({ fn: "endTurn", args });
    },
    completeRequest: async (...args: unknown[]) => {
      calls.push({ fn: "completeRequest", args });
    }
  };
  const start = Date.now();
  const latency = await finalizeTurn({
    keeper: keeper as never,
    turnId: "turn",
    requestId: "req",
    start,
    status: "ok"
  });
  assert.ok(latency >= 0);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].fn, "endTurn");
  assert.equal(calls[1].fn, "completeRequest");
  assert.equal((calls[0].args[0] as string) ?? "", "turn");
});

test("buildResponseLLM applies request overrides and stop list", () => {
  const responseModelConfig = {
    id: "model-a",
    options: { temperature: 0.1, topP: 0.9, maxTokens: 111, apiKey: "api-key", baseUrl: "https://base" }
  };
  const llm = buildResponseLLM(responseModelConfig as never, {
    temperature: 0.7,
    top_p: 0.5,
    frequency_penalty: 0.2,
    presence_penalty: 0.3,
    max_tokens: 77,
    logit_bias: { foo: 1 },
    stop: ["x", "y"]
  });

  const anyLLM = llm as unknown as Record<string, unknown>;
  assert.equal(anyLLM.model, "model-a");
  assert.equal(anyLLM.temperature, 0.7);
  assert.equal(anyLLM.topP, 0.5);
  assert.equal(anyLLM.frequencyPenalty, 0.2);
  assert.equal(anyLLM.presencePenalty, 0.3);
  assert.equal(anyLLM.maxTokens, 77);
  assert.deepEqual(anyLLM.stop, ["x", "y"]);
  assert.deepEqual(anyLLM.logitBias, { foo: 1 });
});

test("buildRouterLLM falls back to response API key and base URL", () => {
  const routerModelConfig = { id: "router-model" };
  const responseModelConfig = { id: "resp-model", options: { apiKey: "resp-key", baseUrl: "https://resp-base" } };
  const llm = buildRouterLLM(routerModelConfig as never, responseModelConfig as never);
  const anyLLM = llm as unknown as Record<string, unknown>;
  assert.equal(anyLLM.apiKey, "resp-key");
  const clientConfig = anyLLM.clientConfig as { baseURL?: string } | undefined;
  assert.equal(clientConfig?.baseURL, resolveBaseUrl(undefined, routerModelConfig as never));
});


