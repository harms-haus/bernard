import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";

import { Orchestrator, type OrchestratorRunInput } from "../agent/orchestrator/orchestrator";
import { buildHarnessConfig } from "../agent/orchestrator/config";
import { IntentHarness, type IntentOutput } from "../agent/harness/intent/intent.harness";
import { MemoryHarness, type MemoryOutput } from "../agent/harness/memory/memory.harness";
import { ResponseHarness, type ResponseOutput } from "../agent/harness/respond/respond.harness";
import { UtilityHarness } from "../agent/harness/utility/utility.harness";
import type {
  HarnessContext,
  HarnessResult,
  LLMCaller,
  LLMCallConfig,
  LLMResponse
} from "../agent/harness/lib/types";
import type { RecordKeeper } from "@/lib/recordKeeper";

const originalConsoleInfo = console.info;

before(() => {
  console.info = () => {};
});

after(() => {
  console.info = originalConsoleInfo;
});

type HarnessMock<TIn, TOut> = {
  lastInput?: TIn;
  lastCtx?: HarnessContext;
  result: HarnessResult<TOut>;
  run(input: TIn, ctx: HarnessContext): Promise<HarnessResult<TOut>>;
};

function createHarnessMock<TIn, TOut>(result: HarnessResult<TOut>, opts?: { throwError?: Error }): HarnessMock<TIn, TOut> {
  return {
    result,
    async run(input: TIn, ctx: HarnessContext) {
      this.lastInput = input;
      this.lastCtx = ctx;
      if (opts?.throwError) {
        throw opts.throwError;
      }
      return this.result;
    }
  };
}

function createRecordKeeperMock() {
  const calls: Array<{ conversationId: string; messages: unknown[] }> = [];
  const recordKeeper: RecordKeeper = {
    // @ts-expect-error only the needed method is mocked
    async appendMessages(conversationId: string, messages: unknown[]) {
      calls.push({ conversationId, messages });
    }
  };
  return { recordKeeper, calls };
}

function baseInput(overrides: Partial<OrchestratorRunInput> = {}): OrchestratorRunInput {
  return {
    conversationId: "conv-1",
    incoming: [new HumanMessage("hi")],
    ...overrides
  };
}

class FakeLLMCaller implements LLMCaller {
  constructor(private readonly responses: LLMResponse[]) {}
  async call(input?: LLMCallConfig): Promise<LLMResponse> {
    // record and shift without strict input requirements for tests
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

test("persists initial messages, intent deltas, and response output", { timeout: 2000 }, async () => {
  const { recordKeeper, calls } = createRecordKeeperMock();
  const intentOutput: IntentOutput = {
    transcript: [new HumanMessage("hi"), new AIMessage("tool call result")],
    toolCalls: [],
    done: true
  };
  const memoryOutput: MemoryOutput = { memories: [{ title: "note" }] };
  const responseOutput: ResponseOutput = { text: "ok", message: new AIMessage("ok") };

  const intentHarness = createHarnessMock({ output: intentOutput, done: true });
  const memoryHarness = createHarnessMock({ output: memoryOutput, done: true });
  const respondHarness = createHarnessMock({ output: responseOutput, done: true });

  const orchestrator = new Orchestrator(
    recordKeeper,
    { intentModel: "intent", responseModel: "resp" },
    intentHarness as any,
    memoryHarness as any,
    respondHarness as any,
    {} as any
  );

  const result = await orchestrator.run(baseInput());

  assert.equal(result.intent, intentOutput);
  assert.equal(result.memories, memoryOutput);
  assert.equal(result.response, responseOutput);

  assert.equal(calls.length, 3);
  assert.equal(calls[0]?.messages.length, 1); // initial persist
  assert.equal(calls[1]?.messages.length, 1); // intent delta
  assert.equal(calls[2]?.messages.length, 1); // response message
});

test("response context excludes respond tool calls and blank messages", { timeout: 2000 }, async () => {
  const { recordKeeper } = createRecordKeeperMock();
  const respondToolCall = {
    id: "call-1",
    name: "respond",
    function: { name: "respond", arguments: "{}" },
    arguments: "{}"
  };
  const intentOutput: IntentOutput = {
    transcript: [
      new HumanMessage("hi"),
      new AIMessage({ content: "" }),
      new AIMessage({ content: "should skip", tool_calls: [respondToolCall] } as any)
    ],
    toolCalls: [],
    done: true
  };
  const memoryOutput: MemoryOutput = { memories: [] };
  const responseOutput: ResponseOutput = { text: "ok", message: new AIMessage("ok") };

  const intentHarness = createHarnessMock({ output: intentOutput, done: true });
  const memoryHarness = createHarnessMock({ output: memoryOutput, done: true });
  const respondHarness = createHarnessMock({ output: responseOutput, done: true });

  const orchestrator = new Orchestrator(
    recordKeeper,
    { intentModel: "intent", responseModel: "resp" },
    intentHarness as any,
    memoryHarness as any,
    respondHarness as any,
    {} as any
  );

  await orchestrator.run(baseInput());

  const conversationTurns = respondHarness.lastCtx?.conversation.turns ?? [];
  assert.equal(conversationTurns.length, 1);
  assert.equal((conversationTurns[0] as { content?: unknown }).content, "hi");
});

test("skips initial persistence when disabled", { timeout: 2000 }, async () => {
  const { recordKeeper, calls } = createRecordKeeperMock();

  const intentOutput: IntentOutput = {
    transcript: [new HumanMessage("hi"), new AIMessage("next")],
    toolCalls: [],
    done: true
  };
  const memoryOutput: MemoryOutput = { memories: [] };
  const responseOutput: ResponseOutput = { text: "ok", message: new AIMessage("ok") };

  const orchestrator = new Orchestrator(
    recordKeeper,
    { intentModel: "intent", responseModel: "resp" },
    createHarnessMock({ output: intentOutput, done: true }) as any,
    createHarnessMock({ output: memoryOutput, done: true }) as any,
    createHarnessMock({ output: responseOutput, done: true }) as any,
    {} as any
  );

  await orchestrator.run(baseInput({ persistInitial: false }));

  assert.equal(calls.length, 2); // only intent delta + response
});

test("records error messages and rethrows", { timeout: 2000 }, async () => {
  const { recordKeeper, calls } = createRecordKeeperMock();
  const intentError = new Error("boom");

  const intentHarness = createHarnessMock<unknown, IntentOutput>(
    { output: { transcript: [], toolCalls: [], done: false }, done: false },
    { throwError: intentError }
  );
  const memoryHarness = createHarnessMock<unknown, MemoryOutput>({ output: { memories: [] }, done: true });
  const respondHarness = createHarnessMock<unknown, ResponseOutput>({
    output: { text: "ok", message: new AIMessage("ok") },
    done: true
  });

  const orchestrator = new Orchestrator(
    recordKeeper,
    { intentModel: "intent", responseModel: "resp" },
    intentHarness as any,
    memoryHarness as any,
    respondHarness as any,
    {} as any
  );

  await assert.rejects(() => orchestrator.run(baseInput({ persistInitial: false })), intentError);

  assert.equal(calls.length, 1);
  const errorMessage = calls[0]?.messages[0] as SystemMessage;
  assert.equal(errorMessage.name, "orchestrator.error");
  const metadata = (errorMessage as { response_metadata?: Record<string, unknown> }).response_metadata ?? {};
  assert.equal(metadata.traceType, "error");
  assert.equal(metadata.errorStage, "orchestrator");
});

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

test("Orchestrator removes blank/response tool messages before response prompt", async () => {
  const toolCallMessage = new AIMessage({
    content: "",
    tool_calls: [{ id: "search_call", function: { name: "search", arguments: "{}" } }] as any
  } as any);
  const toolResult = new ToolMessage({ tool_call_id: "search_call", name: "search", content: "search result" });
  const blankToolResult = new ToolMessage({ tool_call_id: "search_call", name: "search", content: "   " });
  const respondCall = new AIMessage({
    content: "",
    tool_calls: [{ id: "respond_call", function: { name: "respond", arguments: "{}" } }] as any
  } as any);
  const respondResult = new ToolMessage({
    tool_call_id: "respond_call",
    name: "respond",
    content: "Ready to hand off"
  });

  const transcript = [...baseConversation, toolCallMessage, toolResult, blankToolResult, respondCall, respondResult];
  const intentHarness = {
    async run() {
      return {
        output: { transcript, toolCalls: [], done: true },
        done: true
      };
    }
  } as unknown as IntentHarness;

  let responseCallInput: LLMCallConfig | undefined;
  const responseHarness = new ResponseHarness({
    async call(input) {
      responseCallInput = input;
      return {
        text: "ok",
        message: new AIMessage({ content: "ok" })
      };
    }
  });

  const orchestrator = new Orchestrator(
    null,
    ctxBase.config,
    intentHarness,
    new MemoryHarness(),
    responseHarness,
    new UtilityHarness()
  );

  await orchestrator.run({
    conversationId: "conv-filter",
    incoming: baseConversation
  });

  assert.ok(responseCallInput);
  const responseMessages = (responseCallInput?.messages ?? []).filter(
    (msg) => (msg as { _getType?: () => string })._getType?.() !== "system"
  );
  const contents = responseMessages.map((msg) => String((msg as { content?: unknown }).content ?? ""));

  assert.equal(responseMessages.length, 2);
  assert.ok(contents.every((content) => content.trim().length > 0));
  assert.ok(contents.some((content) => content.includes("hi orchestrator")));
  assert.ok(contents.some((content) => content.includes("search result")));

  const toolNames = responseMessages
    .filter((msg) => (msg as { _getType?: () => string })._getType?.() === "tool")
    .map((msg) => (msg as { name?: string }).name);
  assert.ok(!toolNames.includes("respond"));
});

test("Response harness falls back when model returns a blank message", async () => {
  const forecast = new ToolMessage({
    tool_call_id: "forecast_call",
    name: "get_weather_forecast",
    content: "Forecast: high 72F, low 55F with light winds."
  });
  const transcript = [...baseConversation, forecast];
  const intentHarness = {
    async run() {
      return {
        output: { transcript, toolCalls: [], done: true },
        done: true
      };
    }
  } as unknown as IntentHarness;

  const responseCall = new FakeLLMCaller([
    {
      text: "",
      message: new AIMessage({ content: "" })
    }
  ]);

  const orchestrator = new Orchestrator(
    null,
    ctxBase.config,
    intentHarness,
    new MemoryHarness(),
    new ResponseHarness(responseCall),
    new UtilityHarness()
  );

  const result = await orchestrator.run({
    conversationId: "conv-fallback",
    incoming: baseConversation
  });

  assert.ok(result.response.text.trim().length > 0);
  assert.ok(result.response.text.includes("Forecast"));
});
