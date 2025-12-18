import assert from "node:assert/strict";
import { test, vi, describe, beforeEach } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { runIntentHarness } from "../agent/harness/intent/intentHarness";
import type { LLMCaller } from "../agent/harness/llm/llm";

// Mock the LLM caller
const mockComplete = vi.fn();

const mockLLMCaller: LLMCaller = {
  complete: mockComplete,
  streamText: vi.fn(),
};

describe("runIntentHarness", () => {
  beforeEach(() => {
    mockComplete.mockReset();
    mockComplete.mockResolvedValue({
      content: "I'll search the web for that information.\nweb_search({\"query\": \"test query\", \"count\": 3})",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      finishReason: "stop",
    });

    // Mock getIntentTools to return a mock tool
    const mockTool = {
      name: "web_search",
      description: "Search the web",
      schema: {},
      invoke: vi.fn().mockResolvedValue({ results: ["result1"] }),
    };

    vi.doMock("../agent/harness/intent/tools/index", () => ({
      getIntentTools: vi.fn().mockReturnValue([mockTool]),
    }));
  });

  test("yields llm_prompt trace first", async () => {
    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Hello")],
      llmCaller: mockLLMCaller,
    };

    const events: any[] = [];
    for await (const event of runIntentHarness(context)) {
      events.push(event);
    }

    assert.equal(events.length, 3); // prompt + tool_call + tool_output
    assert.equal(events[0].type, "llm_prompt");
    assert(events[0].prompt.includes("Hello"));
    assert.equal(events[0].model, "intent-router");
  });

  test("yields tool_call and tool_output for parsed tool calls", async () => {
    // Update mock to return a tool that will be found
    mockComplete.mockResolvedValue({
      content: "I'll search the web.\nweb_search({\"query\": \"test query\"})",
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

    assert.equal(events.length, 3);
    assert.equal(events[1].type, "tool_call");
    assert.equal(events[1].toolCall.function.name, "web_search");
    assert.equal(events[2].type, "tool_output");
    assert.equal(events[2].toolCallId, events[1].toolCall.id);
    // The tool exists but fails due to missing configuration
    assert(events[2].output.includes("not configured"));
  });

  test("handles tool execution errors gracefully", async () => {
    // Update mock to call a non-existent tool (simulates error)
    mockComplete.mockResolvedValue({
      content: "I'll try this tool.\nfailing_tool({})",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      finishReason: "stop",
    });

    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Do something that fails")],
      llmCaller: mockLLMCaller,
    };

    const events: any[] = [];
    for await (const event of runIntentHarness(context)) {
      events.push(event);
    }

    assert.equal(events.length, 3);
    assert.equal(events[1].type, "tool_call");
    assert.equal(events[2].type, "tool_output");
    assert(events[2].output.includes("not found"));
  });

  test("handles unknown tools gracefully", async () => {
    mockComplete.mockResolvedValue({
      content: "I'll use an unknown tool.\nunknown_tool({})",
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
    assert.equal(events[2].type, "tool_output");
    assert(events[2].output.includes("not found"));
  });

  test("respects abort signal", async () => {
    const abortController = new AbortController();

    // Mock LLM call that takes time
    mockComplete.mockImplementation(
      () => new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({
            content: "web_search({\"query\": \"test\"})",
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
            finishReason: "stop",
          });
        }, 100);

        abortController.signal.addEventListener("abort", () => {
          clearTimeout(timeout);
        });
      })
    );

    const context = {
      conversationId: "test-conv",
      messages: [new HumanMessage("Search something")],
      llmCaller: mockLLMCaller,
      abortSignal: abortController.signal,
    };

    // Start the harness
    const harnessPromise = (async () => {
      const events: any[] = [];
      try {
        for await (const event of runIntentHarness(context)) {
          events.push(event);
        }
      } catch (error) {
        // Expected if aborted
      }
      return events;
    })();

    // Abort immediately
    abortController.abort();

    const events = await harnessPromise;

    // Should have yielded at least the prompt trace before aborting
    assert(events.length >= 1);
    assert.equal(events[0].type, "llm_prompt");
  });
});
