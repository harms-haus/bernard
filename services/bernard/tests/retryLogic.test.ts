import { describe, test, assert } from "vitest";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { callLLMWithRetry } from "../agent/harness/router/routerHarness";
import type { LLMCaller, LLMConfig } from "../agent/llm/llm";

// Mock LLM caller that can simulate different behaviors
class MockLLMCaller implements LLMCaller {
  private responses: Array<AIMessage | Error> = [];
  private callCount = 0;

  setResponses(responses: Array<AIMessage | Error>) {
    this.responses = responses;
    this.callCount = 0;
  }

  async complete(_messages: BaseMessage[], _config: LLMConfig): Promise<LLMResponse> {
    throw new Error("Not implemented");
  }

  async *streamText(_messages: BaseMessage[], _config: LLMConfig): AsyncIterable<string> {
    yield* []; // Not implemented
  }

  async completeWithTools(_messages: BaseMessage[], _config: LLMConfig, _tools?: any[]): Promise<AIMessage> {
    this.callCount++;
    const response = this.responses[this.callCount - 1];

    if (response instanceof Error) {
      throw response;
    }

    return response;
  }

  getCallCount(): number {
    return this.callCount;
  }
}

describe("LLM Retry Logic", () => {
  test("succeeds on first valid response", async () => {
    const mockCaller = new MockLLMCaller();
    const validResponse = new AIMessage({
      content: "",
      tool_calls: [{
        id: "call_1",
        name: "respond",
        args: { message: "Hello" }
      }]
    });
    mockCaller.setResponses([validResponse]);

    const messages = [new SystemMessage("Test prompt")];
    const config: LLMConfig = { model: "test", temperature: 0 };
    const availableTools = ["respond"];

    const result = await callLLMWithRetry(mockCaller, messages, config, [], availableTools);

    assert.equal(mockCaller.getCallCount(), 1);
    assert.equal(result.errorEvents.length, 0);
    assert.equal(result.aiMessage, validResponse);
  });

  test("retries on invalid tool name", async () => {
    const mockCaller = new MockLLMCaller();
    const invalidResponse = new AIMessage({
      content: "",
      tool_calls: [{
        id: "call_1",
        name: "invalid_tool",
        args: { param: "value" }
      }]
    });
    const validResponse = new AIMessage({
      content: "",
      tool_calls: [{
        id: "call_2",
        name: "respond",
        args: { message: "Hello" }
      }]
    });
    mockCaller.setResponses([invalidResponse, validResponse]);

    const messages = [new SystemMessage("Test prompt")];
    const config: LLMConfig = { model: "test", temperature: 0 };
    const availableTools = ["respond"];

    const result = await callLLMWithRetry(mockCaller, messages, config, [], availableTools);

    assert.equal(mockCaller.getCallCount(), 2);
    assert.equal(result.errorEvents.length, 1);
    assert.equal(result.errorEvents[0].type, "error");
    assert.match(result.errorEvents[0].error, /Invalid tool name/);
    assert.equal(result.aiMessage, validResponse);
    // Check that error message was added to context
    assert.equal(messages.length, 2);
    assert.equal(messages[1].content, "Error: Invalid tool name: invalid_tool. Available tools: respond");
  });

  test("retries on invalid JSON parameters", async () => {
    const mockCaller = new MockLLMCaller();
    const invalidResponse = new AIMessage({
      content: "",
      tool_calls: [{
        id: "call_1",
        name: "respond",
        args: "invalid json"
      }]
    });
    const validResponse = new AIMessage({
      content: "",
      tool_calls: [{
        id: "call_2",
        name: "respond",
        args: { message: "Hello" }
      }]
    });
    mockCaller.setResponses([invalidResponse, validResponse]);

    const messages = [new SystemMessage("Test prompt")];
    const config: LLMConfig = { model: "test", temperature: 0 };
    const availableTools = ["respond"];

    const result = await callLLMWithRetry(mockCaller, messages, config, [], availableTools);

    assert.equal(mockCaller.getCallCount(), 2);
    assert.equal(result.errorEvents.length, 1);
    assert.equal(result.errorEvents[0].type, "error");
    assert.match(result.errorEvents[0].error, /Invalid JSON parameters/);
    assert.equal(result.aiMessage, validResponse);
  });

  test("retries on rate limit error", async () => {
    const mockCaller = new MockLLMCaller();
    const rateLimitError = new Error("429 Too Many Requests");
    const validResponse = new AIMessage({
      content: "",
      tool_calls: [{
        id: "call_1",
        name: "respond",
        args: { message: "Hello" }
      }]
    });
    mockCaller.setResponses([rateLimitError, validResponse]);

    const messages = [new SystemMessage("Test prompt")];
    const config: LLMConfig = { model: "test", temperature: 0 };
    const availableTools = ["respond"];

    // Mock setTimeout to avoid actual delays in tests
    const originalSetTimeout = global.setTimeout;
    let timeoutCalled = false;
    global.setTimeout = ((callback: () => void, _delay: number) => {
      timeoutCalled = true;
      // Call immediately to avoid test timeout
      callback();
      return {} as any;
    }) as any;

    try {
      const result = await callLLMWithRetry(mockCaller, messages, config, [], availableTools);

      assert.equal(mockCaller.getCallCount(), 2);
      assert.equal(result.errorEvents.length, 1);
      assert.equal(result.errorEvents[0].type, "error");
      assert.match(result.errorEvents[0].error, /429 Too Many Requests/);
      assert.equal(result.aiMessage, validResponse);
      assert.isTrue(timeoutCalled, "setTimeout should have been called for rate limit backoff");
    } finally {
      global.setTimeout = originalSetTimeout;
    }
  });

  test("does not retry on auth errors", async () => {
    const mockCaller = new MockLLMCaller();
    const authError = new Error("401 Unauthorized");
    mockCaller.setResponses([authError]);

    const messages = [new SystemMessage("Test prompt")];
    const config: LLMConfig = { model: "test", temperature: 0 };
    const availableTools = ["respond"];

    try {
      await callLLMWithRetry(mockCaller, messages, config, [], availableTools);
      assert.fail("Should have thrown auth error");
    } catch (error) {
      assert.equal(mockCaller.getCallCount(), 1);
      assert.equal(error, authError);
    }
  });

  test("does not retry on abort signal", async () => {
    const mockCaller = new MockLLMCaller();
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    mockCaller.setResponses([abortError]);

    const messages = [new SystemMessage("Test prompt")];
    const config: LLMConfig = { model: "test", temperature: 0 };
    const abortController = new AbortController();
    config.abortSignal = abortController.signal;
    const availableTools = ["respond"];

    try {
      await callLLMWithRetry(mockCaller, messages, config, [], availableTools);
      assert.fail("Should have thrown abort error");
    } catch (error) {
      assert.equal(mockCaller.getCallCount(), 1);
      assert.equal(error, abortError);
    }
  });

  test("gives up after max retries", async () => {
    const mockCaller = new MockLLMCaller();
    const networkError = new Error("Network timeout");
    mockCaller.setResponses([networkError, networkError, networkError]);

    const messages = [new SystemMessage("Test prompt")];
    const config: LLMConfig = { model: "test", temperature: 0 };
    const availableTools = ["respond"];

    try {
      await callLLMWithRetry(mockCaller, messages, config, [], availableTools);
      assert.fail("Should have thrown after max retries");
    } catch (error) {
      assert.equal(mockCaller.getCallCount(), 3);
      assert.equal(error, networkError);
    }
  });
});
