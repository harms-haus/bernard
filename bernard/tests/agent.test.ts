import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "vitest";

import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";

import { buildGraph, createOrchestrator, newInboundMessages, resolveGraphDeps } from "../lib/agent";
import { getPrimaryModel } from "../lib/config/models";

const originalConsole = { info: console.info, warn: console.warn, error: console.error };

beforeAll(() => {
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
});

afterAll(() => {
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
});

test("newInboundMessages keeps all messages when no assistant appears", () => {
  const msgs = [new HumanMessage("hi"), new ToolMessage({ content: "tool", name: "t", tool_call_id: "id" })];

  const result = newInboundMessages(msgs);

  assert.equal(result.length, msgs.length);
  assert.equal(result[0], msgs[0]);
  assert.equal(result[1], msgs[1]);
});

test("newInboundMessages drops everything up to the last assistant", () => {
  const msgs = [new HumanMessage("hi"), new AIMessage("assistant"), new HumanMessage("follow-up")];

  const result = newInboundMessages(msgs);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.content, "follow-up");
});

test("newInboundMessages tolerates messages without _getType", () => {
  const orphan: BaseMessage = { content: "orphan" } as BaseMessage;
  const msgs = [new AIMessage("prior"), orphan, new HumanMessage("next")];

  const result = newInboundMessages(msgs);

  assert.equal(result.length, 2);
  assert.equal(result[0], orphan);
  assert.equal((result[1] as HumanMessage).content, "next");
});

test("newInboundMessages returns empty array when last message is assistant", () => {
  const msgs = [new HumanMessage("hi"), new AIMessage("assistant")];

  const result = newInboundMessages(msgs);

  assert.equal(result.length, 0);
});

test("resolveGraphDeps returns defaults when no overrides are provided", () => {
  const resolved = resolveGraphDeps({});

  assert.equal(resolved.createOrchestratorFn, createOrchestrator);
  assert.equal(resolved.getPrimaryModelFn, getPrimaryModel);
  assert.equal(resolved.newInboundMessagesFn, newInboundMessages);
});

test("resolveGraphDeps favors provided overrides", () => {
  const deps = resolveGraphDeps({
    createOrchestratorFn: "co" as any,
    getPrimaryModelFn: "gm" as any,
    newInboundMessagesFn: "ni" as any
  });

  assert.equal(deps.createOrchestratorFn, "co");
  assert.equal(deps.getPrimaryModelFn, "gm");
  assert.equal(deps.newInboundMessagesFn, "ni");
});

test(
  "buildGraph resolves models, forwards context, and provides streaming output",
  { timeout: 500 },
  async () => {
    const modelCalls: Array<{ category: string; opts?: unknown }> = [];
    const orchestratorCalls: Array<Record<string, unknown>> = [];
    const newInboundInputs: BaseMessage[][] = [];
    const persistable = [new HumanMessage("persist-me")];

    const getPrimaryModelFn = async (category: string, opts?: unknown) => {
      modelCalls.push({ category, opts });
      return category === "response" ? "response-model" : "intent-model";
    };

    const orchestrator = {
      async run(input: Record<string, unknown>) {
        orchestratorCalls.push(input);
        return {
          response: { message: new AIMessage("response message") },
          intent: { transcript: [new HumanMessage("heard you")], done: true },
          memories: { notes: true }
        };
      }
    };

    const createOrchestratorFn = async (_keeper: unknown, models: unknown) => ({
      orchestrator,
      models
    });

    const graph = await buildGraph(
      {
        recordKeeper: null as any,
        conversationId: "conv-1",
        requestId: "req-1",
        token: "tok"
      },
      {
        createOrchestratorFn,
        getPrimaryModelFn,
        newInboundMessagesFn: (msgs) => {
          newInboundInputs.push(msgs);
          return persistable;
        }
      }
    );

    const incoming = [new SystemMessage("s"), new HumanMessage("hello")];
    const details = await graph.runWithDetails({ messages: incoming });

    assert.equal(modelCalls.length, 2);
    assert.equal(modelCalls[0]?.category, "response");
    assert.equal(modelCalls[1]?.opts?.fallback?.[0], "response-model");

    assert.equal(newInboundInputs.length, 1);
    assert.equal(newInboundInputs[0], incoming);

    assert.equal(orchestratorCalls.length, 1);
    assert.equal(orchestratorCalls[0]?.conversationId, "conv-1");
    assert.equal(orchestratorCalls[0]?.requestId, "req-1");
    assert.equal(orchestratorCalls[0]?.persistable, persistable);
    assert.equal(details.historyLength, 1); // system is excluded

    assert.equal(details.messages.length, 3);
    assert.equal(details.messages.at(-1)?.content, "response message");
    assert.equal(details.transcript[0]?.content, "heard you");

    const invoked = await graph.invoke({ messages: incoming });
    assert.equal(invoked.messages.length, 3);

    const chunks: Array<{ messages: BaseMessage[] }> = [];
    for await (const chunk of graph.stream({ messages: incoming })) {
      chunks.push(chunk);
    }
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]?.messages.length, 3);

    const iterator = graph.stream({ messages: incoming });
    const first = await iterator.next();
    const second = await iterator.next();
    assert.equal(first.value?.messages.length, 3);
    assert.equal(second.done, true);
  }
);

test(
  "buildGraph honors provided intent/response models without resolving defaults",
  { timeout: 500 },
  async () => {
    let modelResolved = false;
    let orchestratorBuiltWith: unknown;

    const graph = await buildGraph(
      {
        recordKeeper: null as any,
        conversationId: "conv-2",
        requestId: "req-2",
        token: "tok",
        responseModel: "given-response",
        intentModel: "given-intent"
      },
      {
        getPrimaryModelFn: async () => {
          modelResolved = true;
          return "should-not-be-used";
        },
        createOrchestratorFn: async (_rk, models) => {
          orchestratorBuiltWith = models;
          return {
            orchestrator: {
              async run() {
                return {
                  response: { message: new AIMessage("ok") },
                  intent: { transcript: [new AIMessage("ok")], done: true },
                  memories: {}
                };
              }
            }
          };
        }
      }
    );

    await graph.invoke({ messages: [new HumanMessage("hi")] });

    assert.equal(modelResolved, false);
    assert.deepEqual(orchestratorBuiltWith, { intentModel: "given-intent", responseModel: "given-response" });
  }
);

test(
  "buildGraph uses ctx.model when responseModel is absent",
  { timeout: 500 },
  async () => {
    const orchestratorCalls: Array<Record<string, unknown>> = [];
    const modelCalls: Array<{ category: string; opts?: unknown }> = [];

    const graph = await buildGraph(
      {
        recordKeeper: null as any,
        conversationId: "conv-3",
        requestId: "req-3",
        token: "tok",
        model: "ctx-model"
      },
      {
        getPrimaryModelFn: async (category, opts) => {
          modelCalls.push({ category, opts });
          return "intent-from-primary";
        },
        createOrchestratorFn: async (_rk, models) => {
          return {
            orchestrator: {
              async run(input: Record<string, unknown>) {
                orchestratorCalls.push(input);
                return {
                  response: { message: new AIMessage("done") },
                  intent: { transcript: [new AIMessage("hi")], done: true },
                  memories: {}
                };
              }
            },
            models
          };
        }
      }
    );

    const messages = [new HumanMessage("hello"), new AIMessage("prior")];
    const result = await graph.runWithDetails({ messages });

    assert.equal(modelCalls.length, 1);
    assert.equal(modelCalls[0]?.category, "intent");
    assert.equal(modelCalls[0]?.opts?.fallback?.[0], "ctx-model");
    assert.equal((result.messages.at(-1) as AIMessage).content, "done");
    assert.equal(orchestratorCalls[0]?.persistable?.length, 0);
  }
);


