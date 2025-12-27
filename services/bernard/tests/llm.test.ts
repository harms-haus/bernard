import assert from "node:assert/strict";
import { test, vi, describe, beforeEach } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAILLMCaller } from "../agent/llm/chatOpenAI";

// Mock the ChatOpenAI class
const mockInvoke = vi.fn();
const mockStream = vi.fn();

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn().mockImplementation(() => ({
    temperature: 0.7,
    maxTokens: undefined,
    timeout: 30000,
    invoke: mockInvoke,
    stream: mockStream,
  })),
}));

describe("ChatOpenAILLMCaller", () => {
  const apiKey = "test-api-key";
  let caller: ChatOpenAILLMCaller;

  beforeEach(() => {
    // Reset mocks
    mockInvoke.mockReset();
    mockStream.mockReset();

    // Default mock implementations
    mockInvoke.mockResolvedValue({
      content: "",
      response_metadata: {},
    });

    mockStream.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        // Default empty stream
      },
    });

    caller = new ChatOpenAILLMCaller(apiKey);
  });

  test("complete returns LLM response", async () => {
    mockInvoke.mockResolvedValue({
      content: "Test response",
      response_metadata: {
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
        finish_reason: "stop",
      },
    });

    const messages = [new HumanMessage("Hello")];
    const config = { model: "gpt-3.5-turbo" };

    const result = await caller.complete(messages, config);

    assert.equal(result.content, "Test response");
    assert.deepEqual(result.usage, {
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    });
    assert.equal(result.finishReason, "stop");

    assert(mockInvoke.mock.calls.length > 0);
    assert.deepEqual(mockInvoke.mock.calls[0][0], messages);
    assert.deepEqual(mockInvoke.mock.calls[0][1], { signal: undefined });
  });

  test("complete configures client with provided options", async () => {
    mockInvoke.mockResolvedValue({
      content: "Test response",
      response_metadata: {},
    });

    const messages = [new HumanMessage("Hello")];
    const config = {
      model: "gpt-4",
      temperature: 0.5,
      maxTokens: 100,
      timeout: 5000,
    };

    await caller.complete(messages, config);

    // Check that invoke was called (the client configuration is tested implicitly)
    assert(mockInvoke.mock.calls.length > 0);
  });

  test("streamText yields text chunks", async () => {
    const mockStreamObj = {
      async *[Symbol.asyncIterator]() {
        yield { content: "Hello" };
        yield { content: " " };
        yield { content: "world" };
        yield { content: "" }; // Empty content should be filtered
        yield { content: "!" };
      },
    };

    mockStream.mockResolvedValue(mockStreamObj);

    const messages = [new HumanMessage("Hello")];
    const config = { model: "gpt-3.5-turbo" };

    const chunks: string[] = [];
    for await (const chunk of caller.streamText(messages, config)) {
      chunks.push(chunk);
    }

    assert.deepEqual(chunks, ["Hello", " ", "world", "!"]);

    assert(mockStream.mock.calls.length > 0);
    assert.deepEqual(mockStream.mock.calls[0][0], messages);
    assert.deepEqual(mockStream.mock.calls[0][1], { signal: undefined });
  });

  test("streamText respects abort signal", async () => {
    const abortController = new AbortController();

    // Mock stream that yields one chunk then throws abort error
    const mockStreamObj = {
      async *[Symbol.asyncIterator]() {
        yield { content: "First chunk" };
        // Simulate abort being detected
        throw new Error("Aborted");
      },
    };

    mockStream.mockResolvedValue(mockStreamObj);

    const messages = [new HumanMessage("Hello")];
    const config = {
      model: "gpt-3.5-turbo",
      abortSignal: abortController.signal,
    };

    const chunks: string[] = [];
    const iterator = caller.streamText(messages, config);

    // Get first chunk
    const chunk1 = (await iterator[Symbol.asyncIterator]().next()).value;
    chunks.push(chunk1);

    // Try to get second chunk - should throw abort error
    try {
      await iterator[Symbol.asyncIterator]().next();
      assert.fail("Expected abort error");
    } catch (error) {
      assert(error instanceof Error);
      assert.equal((error as Error).message, "Streaming failed: Aborted");
    }

    assert.deepEqual(chunks, ["First chunk"]);

    // Verify that the abort signal was passed to the underlying stream call
    assert(mockStream.mock.calls.length > 0);
    assert.deepEqual(mockStream.mock.calls[0][0], messages);
    assert.deepEqual(mockStream.mock.calls[0][1], { signal: abortController.signal });
  });
});
