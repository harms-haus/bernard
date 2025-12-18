import assert from "node:assert/strict";
import { test, vi, describe, beforeEach } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { runChatCompletionTurn } from "../agent/loop/chatCompletionsTurn";
import type { LLMCaller } from "../agent/llm/llm";
import type { RecordKeeper } from "@/lib/conversation/recordKeeper";

// Mock dependencies
const mockComplete = vi.fn();
const mockStreamText = vi.fn();

const mockLLMCaller: LLMCaller = {
  complete: mockComplete,
  streamText: mockStreamText,
};

const mockRecordKeeper: RecordKeeper = {
  appendMessages: vi.fn(),
  recordToolCall: vi.fn(),
  recordToolResult: vi.fn(),
  getConversation: vi.fn(),
  createConversation: vi.fn(),
};

describe("runChatCompletionTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockComplete.mockResolvedValue({
      content: "web_search({\"query\": \"test query\"})",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      finishReason: "stop",
    });

    mockStreamText.mockImplementation(async function* () {
      yield "Response";
      yield " text";
    });
  });

  test("returns a readable stream and final messages", async () => {
    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Hello")],
      llmCaller: mockLLMCaller,
      recordKeeper: mockRecordKeeper,
    };

    const result = await runChatCompletionTurn(context);

    assert(result.stream instanceof ReadableStream);
    assert(Array.isArray(result.finalMessages));
    assert(result.finalMessages.length > 0);
  });

  test("creates stream without errors", async () => {
    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Hello")],
      llmCaller: mockLLMCaller,
      recordKeeper: mockRecordKeeper,
    };

    const result = await runChatCompletionTurn(context);

    // Should create a stream successfully
    assert(result.stream instanceof ReadableStream);

    // Should be able to read at least one chunk without error
    const reader = result.stream.getReader();
    const { value, done } = await reader.read();
    assert(!done); // Should not be done immediately
    assert(value instanceof Uint8Array);
    reader.releaseLock();
  });

  test("records user messages", async () => {
    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Hello world")],
      llmCaller: mockLLMCaller,
      recordKeeper: mockRecordKeeper,
    };

    await runChatCompletionTurn(context);

    assert(mockRecordKeeper.appendMessages.mock.calls.length > 0);
    assert.equal(mockRecordKeeper.appendMessages.mock.calls[0][0], "test-conv");
    assert.deepEqual(mockRecordKeeper.appendMessages.mock.calls[0][1], [new HumanMessage("Hello world")]);
  });

  test("creates turn runner without errors", async () => {
    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Hello")],
      llmCaller: mockLLMCaller,
      recordKeeper: mockRecordKeeper,
    };

    const result = await runChatCompletionTurn(context);

    // Should create turn successfully
    assert(result.stream instanceof ReadableStream);
    assert(Array.isArray(result.finalMessages));
    assert.equal(result.finalMessages.length, 1);
    assert.equal(result.finalMessages[0].content, "Hello");
  });

  test("records user input immediately", async () => {
    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Hello world")],
      llmCaller: mockLLMCaller,
      recordKeeper: mockRecordKeeper,
    };

    await runChatCompletionTurn(context);

    // Should record user input immediately
    assert(mockRecordKeeper.appendMessages.mock.calls.length > 0);
    assert.equal(mockRecordKeeper.appendMessages.mock.calls[0][0], "test-conv");
    assert.equal(mockRecordKeeper.appendMessages.mock.calls[0][1][0].content, "Hello world");
  });

  test("handles abort signal", async () => {
    const abortController = new AbortController();

    // Mock that respects abort
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
      messages: [new HumanMessage("Hello")],
      llmCaller: mockLLMCaller,
      recordKeeper: mockRecordKeeper,
      abortSignal: abortController.signal,
    };

    const result = await runChatCompletionTurn(context);

    // Should still return a stream even if aborted
    assert(result.stream instanceof ReadableStream);
  });

  test("returns readable stream", async () => {
    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Hello")],
      llmCaller: mockLLMCaller,
      recordKeeper: mockRecordKeeper,
    };

    const result = await runChatCompletionTurn(context);

    // Should return a valid readable stream
    assert(result.stream instanceof ReadableStream);
    assert(Array.isArray(result.finalMessages));
  });
});
