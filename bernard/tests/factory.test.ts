import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "vitest";

import { AIMessage, HumanMessage } from "@langchain/core/messages";

import { ChatModelCaller, createOrchestrator, makeCaller, toToolCalls } from "../agent/orchestrator/factory";
import type { LLMCallConfig, LLMCaller, LLMResponse } from "../agent/harness/lib/types";
import type { OrchestratorConfigInput } from "../agent/orchestrator/config";
import type { RecordKeeper } from "@/lib/conversation/recordKeeper";

const originalConsole = { error: console.error, warn: console.warn, info: console.info };

beforeAll(() => {
  console.error = () => {};
  console.warn = () => {};
  console.info = () => {};
});

afterAll(() => {
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
});

class ResolvingClient {
  public boundTools?: unknown[];
  constructor(private readonly message: unknown) {}
  bindTools(tools?: unknown[]) {
    this.boundTools = tools;
    return this;
  }
  async invoke() {
    return this.message;
  }
}

class HangingClient {
  bindTools() {
    return this;
  }
  async invoke(_: unknown, opts?: { signal?: AbortSignal }) {
    return new Promise((_, reject) => {
      opts?.signal?.addEventListener("abort", () => reject(opts.signal?.reason ?? new Error("aborted")));
    });
  }
}

test("toToolCalls normalizes common shapes and preserves arguments", () => {
  const toolCalls = toToolCalls({
    tool_calls: [
      { id: "a", function: { name: "fnA", arguments: '{"foo":1}' } },
      { name: "fnB", args: "call-args", type: "function" },
      { id: "c", parameters: { nested: true } },
      { function: { name: "fnC", args: "fn-args" }, args: "call-args-should-not-win" }
    ]
  });

  assert.equal(toolCalls.length, 4);
  assert.equal(toolCalls[0]?.id, "a");
  assert.equal(toolCalls[0]?.name, "fnA");
  assert.equal(toolCalls[1]?.name, "fnB");
  assert.equal(toolCalls[2]?.arguments?.nested, true);
  assert.equal(toolCalls[3]?.arguments, "fn-args");
});

test("ChatModelCaller returns response and records when enabled", { timeout: 500 }, async () => {
  const message = new AIMessage({
    content: "hello",
    response_metadata: { token_usage: { prompt_tokens: 3, completion_tokens: 2, cache_read_input_tokens: 1 } },
    tool_calls: [{ id: "tc-1", function: { name: "tool", arguments: "{}" } }] as any
  } as any);
  const client = new ResolvingClient(message);
  const caller = new ChatModelCaller("test-model", client);
  const recorded: any[] = [];

  const response = await caller.call({
    messages: [new HumanMessage("hi")],
    tools: [{ name: "tool" } as any],
    meta: {
      conversationId: "conv-1",
      recordKeeper: {
        // @ts-expect-error minimal mock for test
        async recordLLMCall(id: string, payload: unknown) {
          recorded.push({ id, payload });
        }
      } as RecordKeeper,
      requestId: "req-1",
      traceName: "trace"
    }
  } as LLMCallConfig);

  assert.equal(response.text, "hello");
  assert.equal(response.toolCalls[0]?.name, "tool");
  assert.equal(response.usage.in, 3);
  assert.equal(response.usage.out, 2);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0]?.id, "conv-1");
  assert.equal((recorded[0]?.payload as { tools?: unknown[] })?.tools?.length, 1);
  assert.deepEqual(client.boundTools, [{ name: "tool" }]);
});

test("ChatModelCaller aborts after timeout with clear error", { timeout: 200 }, async () => {
  const caller = new ChatModelCaller("slow-model", new HangingClient(), 20);
  await assert.rejects(
    () => caller.call({ messages: [], meta: {} } as LLMCallConfig),
    /timed out after 20ms/
  );
});

test("makeCaller uses injected client when provided", () => {
  const client = new ResolvingClient(new AIMessage("ok"));
  const caller = makeCaller("model-x", 0.2, { maxTokens: 10 }, client as any);
  assert.ok(caller);
});

test("createOrchestrator uses dependency overrides and returns config", async () => {
  const resolvedModels: string[] = [];
  const callerArgs: Array<{ model: string; temperature: number; opts?: unknown }> = [];
  const config = {
    intentModel: "intent-x",
    responseModel: "response-y",
    memoryModel: "memory-z",
    maxIntentIterations: 3,
    timeoutsMs: { intent: 1, memory: 2, respond: 3 }
  };

  const result = await createOrchestrator(
    null,
    { intentModel: "ignored" } as OrchestratorConfigInput,
    {
      buildConfig: async () => config,
      resolveModelFn: async (category: any) => {
        resolvedModels.push(category);
        return { id: `${category}-model`, options: { apiKey: `${category}-key` } };
      },
      makeCallerFn: (model: string, temperature: number, opts?: any) => {
        callerArgs.push({ model, temperature, opts });
        return { call: async () => ({ message: new AIMessage("ok") } as LLMResponse) } as unknown as LLMCaller;
      }
    }
  );

  assert.equal(resolvedModels.includes("intent"), true);
  assert.equal(resolvedModels.includes("response"), true);
  assert.equal(result.config, config);
  assert.equal(callerArgs.length, 2);
  assert.equal(callerArgs[0]?.opts?.maxTokens, 750);
});
