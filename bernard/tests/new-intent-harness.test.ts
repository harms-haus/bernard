import assert from "node:assert/strict";
import { test, vi, describe, beforeEach } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { runIntentHarness } from "../agent/harness/intent/intentHarness";
import type { LLMCaller } from "../agent/llm/llm";

// Mock LLM caller
const mockComplete = vi.fn();
const mockLLMCaller: LLMCaller = {
  complete: mockComplete,
  streamText: vi.fn(),
};

describe("runIntentHarness - New Architecture Tests", () => {
  beforeEach(() => {
    mockComplete.mockReset();
    mockComplete.mockResolvedValue({
      content: "",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      finishReason: "stop",
    });
  });

  test("yields llm_prompt trace with system prompt and user messages", async () => {
    mockComplete.mockResolvedValue({
      content: "",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      finishReason: "stop",
    });

    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Hello world")],
      llmCaller: mockLLMCaller,
    };

    const events: any[] = [];
    for await (const event of runIntentHarness(context)) {
      events.push(event);
    }

    assert.equal(events.length, 1); // Only prompt trace when no tool calls
    assert.equal(events[0].type, "llm_prompt");
    assert(events[0].prompt.includes("Hello world"));
    assert(events[0].prompt.includes("You are Bernard's intent router"));
    assert.equal(events[0].model, "intent-router");
  });

  test("executes tool calls and yields tool_call and tool_output events", async () => {
    mockComplete.mockResolvedValue({
      content: "web_search({\"query\": \"test query\"})",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      finishReason: "stop",
    });

    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Search for something")],
      llmCaller: mockLLMCaller,
    };

    const events: any[] = [];
    for await (const event of runIntentHarness(context)) {
      events.push(event);
    }

    assert.equal(events.length, 3); // prompt + tool_call + tool_output
    assert.equal(events[1].type, "tool_call");
    assert.equal(events[1].toolCall.function.name, "web_search");
    assert.equal(events[1].toolCall.function.arguments, "{\"query\": \"test query\"}");
    assert.equal(events[2].type, "tool_output");
    assert.equal(events[2].toolCallId, events[1].toolCall.id);
  });

  test("handles unknown tools gracefully with error output", async () => {
    mockComplete.mockResolvedValue({
      content: "unknown_tool({\"param\": \"value\"})",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      finishReason: "stop",
    });

    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Use unknown tool")],
      llmCaller: mockLLMCaller,
    };

    const events: any[] = [];
    for await (const event of runIntentHarness(context)) {
      events.push(event);
    }

    assert.equal(events.length, 3);
    assert.equal(events[1].type, "tool_call");
    assert.equal(events[1].toolCall.function.name, "unknown_tool");
    assert.equal(events[2].type, "tool_output");
    assert(events[2].output.includes("not found"));
  });

  test("handles malformed tool arguments gracefully", async () => {
    mockComplete.mockResolvedValue({
      content: 'web_search({"query": "test", invalid})',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      finishReason: "stop",
    });

    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Search with bad args")],
      llmCaller: mockLLMCaller,
    };

    const events: any[] = [];
    for await (const event of runIntentHarness(context)) {
      events.push(event);
    }

    assert.equal(events.length, 3);
    assert.equal(events[1].type, "tool_call");
    assert.equal(events[2].type, "tool_output");
    assert(events[2].output.includes("Invalid tool arguments"));
  });

  test("respects abort signal and stops execution", async () => {
    const abortController = new AbortController();

    mockComplete.mockImplementation(
      () => new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolve({
            content: "web_search({\"query\": \"test\"})",
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
            finishReason: "stop",
          });
        }, 100);

        abortController.signal.addEventListener("abort", () => {
          clearTimeout(timeout);
          reject(new Error("Aborted"));
        });
      })
    );

    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Search something")],
      llmCaller: mockLLMCaller,
      abortSignal: abortController.signal,
    };

    setTimeout(() => abortController.abort(), 50); // Abort before LLM completes

    await assert.rejects(
      async () => {
        const events: any[] = [];
        for await (const event of runIntentHarness(context)) {
          events.push(event);
        }
      },
      /Aborted/
    );
  });

  test("handles LLM errors gracefully", async () => {
    mockComplete.mockRejectedValue(new Error("LLM service unavailable"));

    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Hello")],
      llmCaller: mockLLMCaller,
    };

    await assert.rejects(
      async () => {
        const events: any[] = [];
        for await (const event of runIntentHarness(context)) {
          events.push(event);
        }
      },
      /LLM service unavailable/
    );
  });

  test("filters out non-tool-call text from LLM response", async () => {
    mockComplete.mockResolvedValue({
      content: "I need to search the web for information.\nweb_search({\"query\": \"test query\"})\nThat should help.",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      finishReason: "stop",
    });

    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Search for info")],
      llmCaller: mockLLMCaller,
    };

    const events: any[] = [];
    for await (const event of runIntentHarness(context)) {
      events.push(event);
    }

    assert.equal(events.length, 3);
    assert.equal(events[1].type, "tool_call");
    assert.equal(events[1].toolCall.function.name, "web_search");
  });

  test("handles multiple tool calls in sequence", async () => {
    mockComplete.mockResolvedValue({
      content: "web_search({\"query\": \"first search\"})\ngeocode_search({\"query\": \"location\"})",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      finishReason: "stop",
    });

    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Do multiple things")],
      llmCaller: mockLLMCaller,
    };

    const events: any[] = [];
    for await (const event of runIntentHarness(context)) {
      events.push(event);
    }

    assert.equal(events.length, 5); // prompt + tool_call1 + tool_output1 + tool_call2 + tool_output2
    assert.equal(events[1].type, "tool_call");
    assert.equal(events[1].toolCall.function.name, "web_search");
    assert.equal(events[2].type, "tool_output");
    assert.equal(events[3].type, "tool_call");
    assert.equal(events[3].toolCall.function.name, "geocode_search");
    assert.equal(events[4].type, "tool_output");
  });

  test("parses various tool call formats correctly", async () => {
    mockComplete.mockResolvedValue({
      content: "web_search({\"query\": \"test\", \"count\": 5})",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      finishReason: "stop",
    });

    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Search with params")],
      llmCaller: mockLLMCaller,
    };

    const events: any[] = [];
    for await (const event of runIntentHarness(context)) {
      events.push(event);
    }

    assert.equal(events.length, 3);
    assert.equal(events[1].toolCall.function.arguments, "{\"query\": \"test\", \"count\": 5}");
  });
});
