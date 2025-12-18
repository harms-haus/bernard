import assert from "node:assert/strict";
import { test, vi, describe, beforeEach } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { runResponseHarness } from "../agent/harness/respond/responseHarness";
import type { LLMCaller } from "../agent/harness/llm/llm";

// Mock the LLM caller
const mockStreamText = vi.fn();

const mockLLMCaller: LLMCaller = {
  complete: vi.fn(),
  streamText: mockStreamText,
};

describe("runResponseHarness", () => {
  beforeEach(() => {
    mockStreamText.mockReset();
    mockStreamText.mockImplementation(async function* () {
      yield "Hello";
      yield " ";
      yield "world";
      yield "!";
    });
  });

  test("yields delta events for each token", async () => {
    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Hello there")],
      llmCaller: mockLLMCaller,
    };

    const events: any[] = [];
    for await (const event of runResponseHarness(context)) {
      events.push(event);
    }

    assert.equal(events.length, 5); // 4 tokens + 1 finish
    assert.equal(events[0].type, "delta");
    assert.equal(events[0].content, "Hello");
    assert.equal(events[1].type, "delta");
    assert.equal(events[1].content, " ");
    assert.equal(events[2].type, "delta");
    assert.equal(events[2].content, "world");
    assert.equal(events[3].type, "delta");
    assert.equal(events[3].content, "!");
    assert.equal(events[4].type, "delta");
    assert.equal(events[4].content, "");
    assert.equal(events[4].finishReason, "stop");
  });

  test("includes conversation messages in prompt", async () => {
    const context = {
      conversationId: "test-conv",
      messages: [
        new HumanMessage("Hello"),
        new AIMessage("Hi there!"),
        new HumanMessage("How are you?"),
      ],
      llmCaller: mockLLMCaller,
    };

    const events: any[] = [];
    for await (const event of runResponseHarness(context)) {
      events.push(event);
    }

    // Verify that streamText was called with the correct messages
    assert(mockStreamText.mock.calls.length > 0);
    const [messages] = mockStreamText.mock.calls[0];
    assert.equal(messages.length, 4); // system + 3 conversation messages
    assert.equal(messages[0].content.includes("Bernard:"), true); // system prompt
    assert.equal(messages[1].content, "Hello");
    assert.equal(messages[2].content, "Hi there!");
    assert.equal(messages[3].content, "How are you?");
  });

  test("handles abort signal gracefully", async () => {
    const abortController = new AbortController();

    // Mock stream that throws abort error
    mockStreamText.mockImplementation(async function* () {
      yield "First";
      if (abortController.signal.aborted) {
        const error = new Error("Aborted");
        (error as any).name = "AbortError";
        throw error;
      }
      yield "Second";
    });

    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Test")],
      llmCaller: mockLLMCaller,
      abortSignal: abortController.signal,
    };

    const events: any[] = [];
    const harnessPromise = (async () => {
      for await (const event of runResponseHarness(context)) {
        events.push(event);
        if (events.length === 1) {
          // Abort after first token
          abortController.abort();
        }
      }
    })();

    await harnessPromise;

    // Should yield first token + finish event
    assert.equal(events.length, 2);
    assert.equal(events[0].type, "delta");
    assert.equal(events[0].content, "First");
    assert.equal(events[1].type, "delta");
    assert.equal(events[1].content, "");
    assert.equal(events[1].finishReason, "stop");
  });

  test("handles LLM errors gracefully", async () => {
    mockStreamText.mockImplementation(async function* () {
      yield "Start";
      throw new Error("LLM failed");
    });

    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Test")],
      llmCaller: mockLLMCaller,
    };

    const events: any[] = [];
    for await (const event of runResponseHarness(context)) {
      events.push(event);
    }

    // Should yield the token received before error + finish event
    assert.equal(events.length, 2);
    assert.equal(events[0].type, "delta");
    assert.equal(events[0].content, "Start");
    assert.equal(events[1].type, "delta");
    assert.equal(events[1].content, "");
    assert.equal(events[1].finishReason, "stop");
  });

  test("passes correct config to LLM", async () => {
    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Test")],
      llmCaller: mockLLMCaller,
    };

    const events: any[] = [];
    for await (const event of runResponseHarness(context)) {
      events.push(event);
    }

    // Verify the config passed to streamText
    assert(mockStreamText.mock.calls.length > 0);
    const [, config] = mockStreamText.mock.calls[0];
    assert.equal(config.model, "response-generator");
    assert.equal(config.temperature, 0.7);
    assert.equal(config.maxTokens, 1000);
  });
});
