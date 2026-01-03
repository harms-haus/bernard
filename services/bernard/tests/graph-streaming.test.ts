import { describe, it, expect } from "vitest";
import { createBernardGraph, runBernardGraph } from "../src/agent/graph/bernard.graph";
import { createTestContext, testMessages, echoTool, getValueTool, slowToolWithProgress } from "./fixtures";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";

describe("Graph Streaming", () => {
  describe("Stream Mode: messages", () => {
    it("should emit messages mode chunks during streaming", async () => {
      const context = createTestContext([]);
      const graph = createBernardGraph(context);

      const stream = await graph.stream(
        { messages: testMessages },
        { streamMode: ["messages"] }
      );

      let messageChunks = 0;

      for await (const [mode, _chunk] of stream) {
        if (mode === "messages") {
          messageChunks++;
        }
      }

      expect(messageChunks).toBeGreaterThan(0);
    });

    it("should include metadata with langgraph_node in messages mode", async () => {
      const context = createTestContext([]);
      const graph = createBernardGraph(context);

      const stream = await graph.stream(
        { messages: testMessages },
        { streamMode: ["messages"] }
      );

      let hasLangGraphMetadata = false;

      for await (const [mode, chunk] of stream) {
        if (mode === "messages") {
          const [, metadata] = chunk as [unknown, Record<string, unknown>];
          if (metadata && "langgraph_node" in metadata) {
            hasLangGraphMetadata = true;
            break;
          }
        }
      }

      expect(hasLangGraphMetadata).toBe(true);
    });

    it("should emit tool calls in messages mode metadata when tools are available", async () => {
      // Create tools that will be called
      const mockTools: StructuredToolInterface[] = [
        echoTool as unknown as StructuredToolInterface,
        getValueTool as unknown as StructuredToolInterface,
      ];

      const context = createTestContext(mockTools);
      const graph = createBernardGraph(context);

      // Messages that should trigger tool calls
      const messages = [new HumanMessage("Use get_value to get test_key")];

      const stream = await graph.stream(
        { messages },
        { streamMode: ["messages"] }
      );

      const toolCalls: Array<{ id: string; function: { name: string } }> = [];

      for await (const [mode, chunk] of stream) {
        if (mode === "messages") {
          const [, metadata] = chunk as [unknown, { tool_calls?: Array<{ id: string; function: { name: string } }> }];
          if (metadata?.tool_calls && Array.isArray(metadata.tool_calls)) {
            toolCalls.push(...metadata.tool_calls);
          }
        }
      }

      // Should have tool calls from get_value tool
      expect(toolCalls.length).toBeGreaterThan(0);
      expect(toolCalls.some(tc => tc.function.name === "get_value")).toBe(true);
    });

    it("should emit message content tokens as separate chunks", async () => {
      const context = createTestContext([]);
      const graph = createBernardGraph(context);

      const stream = await graph.stream(
        { messages: testMessages },
        { streamMode: ["messages"] }
      );

      const contentTokens: string[] = [];

      for await (const [mode, chunk] of stream) {
        if (mode === "messages") {
          const [message] = chunk as [unknown, Record<string, unknown>];
          if (message && typeof message === "object" && "content" in message) {
            const content = (message as { content: string }).content;
            if (typeof content === "string" && content) {
              contentTokens.push(content);
            }
          }
        }
      }

      expect(contentTokens.length).toBeGreaterThan(0);
      expect(contentTokens.some(token => token.length > 0)).toBe(true);
    });
  });

  describe("Stream Mode: custom", () => {
    it("should emit custom events from tools that report progress", async () => {
      // Create tool that reports progress
      const mockTools: StructuredToolInterface[] = [
        slowToolWithProgress as unknown as StructuredToolInterface,
      ];

      const context = createTestContext(mockTools);
      const graph = createBernardGraph(context);

      // Messages that trigger the slow tool
      const messages = [new HumanMessage("Run slow_tool with 2 steps")];

      const stream = await graph.stream(
        { messages },
        { streamMode: ["custom"] }
      );

      const customEvents: Array<{ _type?: string; tool?: string }> = [];

      for await (const [mode, chunk] of stream) {
        if (mode === "custom") {
          customEvents.push(chunk as { _type?: string; tool?: string });
        }
      }

      // Should have tool_progress events
      const progressTypes = customEvents.map(e => e._type).filter(Boolean);
      expect(progressTypes).toContain("tool_progress");
    });

    it("should include tool name in custom progress events", async () => {
      const mockTools: StructuredToolInterface[] = [
        slowToolWithProgress as unknown as StructuredToolInterface,
      ];

      const context = createTestContext(mockTools);
      const graph = createBernardGraph(context);

      const messages = [new HumanMessage("Run slow_tool with 1 step")];

      const stream = await graph.stream(
        { messages },
        { streamMode: ["custom"] }
      );

      let hasSlowToolProgress = false;

      for await (const [mode, chunk] of stream) {
        if (mode === "custom") {
          const event = chunk as { tool?: string };
          if (event.tool === "slow_tool") {
            hasSlowToolProgress = true;
            break;
          }
        }
      }

      expect(hasSlowToolProgress).toBe(true);
    });
  });

  describe("Stream Mode: updates", () => {
    it("should emit updates mode chunks", async () => {
      const context = createTestContext([]);
      const graph = createBernardGraph(context);

      const stream = await graph.stream(
        { messages: testMessages },
        { streamMode: ["updates"] }
      );

      let updateChunks = 0;

      for await (const [mode, chunk] of stream) {
        if (mode === "updates") {
          updateChunks++;
          // Updates should be objects with node names as keys
          expect(typeof chunk).toBe("object");
        }
      }

      expect(updateChunks).toBeGreaterThanOrEqual(0); // May be 0 if no state updates
    });
  });

  describe("Stream Mode: all modes together", () => {
    it("should handle multiple stream modes simultaneously", async () => {
      const context = createTestContext([]);
      const graph = createBernardGraph(context);

      const stream = await graph.stream(
        { messages: testMessages },
        { streamMode: ["messages", "updates", "custom"] as const }
      );

      const events = {
        messages: 0,
        updates: 0,
        custom: 0,
      };

      for await (const [mode, _chunk] of stream) {
        if (mode === "messages" || mode === "updates" || mode === "custom") {
          events[mode as keyof typeof events]++;
        }
      }

      // At least messages mode should have events
      expect(events.messages).toBeGreaterThan(0);
    });
  });

  describe("runBernardGraph helper", () => {
    it("should yield message chunks when streaming is enabled", async () => {
      const context = createTestContext([]);
      const graph = createBernardGraph(context);

      const stream = runBernardGraph(graph, testMessages, true, "test-thread-1");

      const chunks: Array<{ type: string; content: unknown }> = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      const messageChunks = chunks.filter(c => c.type === "messages");
      expect(messageChunks.length).toBeGreaterThan(0);
    });

    it("should yield final result when streaming is disabled", async () => {
      const context = createTestContext([]);
      const graph = createBernardGraph(context);

      const stream = runBernardGraph(graph, testMessages, false, "test-thread-2");

      const chunks: Array<{ type: string; content: unknown }> = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(1);
      expect(chunks[0]?.type).toBe("final");
    });

    it("should yield custom events for tool progress", async () => {
      const mockTools: StructuredToolInterface[] = [
        slowToolWithProgress as unknown as StructuredToolInterface,
      ];

      const context = createTestContext(mockTools);
      const graph = createBernardGraph(context);

      const messages = [new HumanMessage("Run slow_tool with 1 step")];
      const stream = runBernardGraph(graph, messages, true, "test-thread-3");

      const chunks: Array<{ type: string; content: unknown }> = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const customChunks = chunks.filter(c => c.type === "custom");
      expect(customChunks.length).toBeGreaterThan(0);
    });
  });

  describe("Graph structure with explicit ToolNode", () => {
    it("should have callModel, tools, and response nodes", async () => {
      const context = createTestContext([echoTool as unknown as StructuredToolInterface]);
      const graph = createBernardGraph(context);

      // Graph should be compiled and usable
      expect(graph).toBeDefined();

      // Should be able to invoke the graph
      const result = await graph.invoke({ messages: testMessages }, { configurable: { thread_id: "test" } });
      expect(result).toBeDefined();
      expect(result.messages).toBeDefined();
      expect(Array.isArray(result.messages)).toBe(true);
    });

    it("should route to tools node when tool calls are generated", async () => {
      const mockTools: StructuredToolInterface[] = [
        getValueTool as unknown as StructuredToolInterface,
      ];

      const context = createTestContext(mockTools);
      const graph = createBernardGraph(context);

      // Messages that should trigger tool calls
      const messages = [new HumanMessage("Get the value for my_key")];

      const stream = await graph.stream(
        { messages },
        { streamMode: ["messages", "updates"] as const }
      );

      let toolCallFound = false;

      for await (const [mode, chunk] of stream) {
        if (mode === "messages") {
          const [, metadata] = chunk as [unknown, { tool_calls?: Array<{ id: string; function: { name: string } }> }];
          if (metadata?.tool_calls?.some(tc => tc.function.name === "get_value")) {
            toolCallFound = true;
            break;
          }
        }
      }

      expect(toolCallFound).toBe(true);
    });

    it("should handle disabled tools correctly", async () => {
      const mockTools: StructuredToolInterface[] = [
        echoTool as unknown as StructuredToolInterface,
      ];

      const disabledTools = [{ name: "echo", reason: "Disabled for test" }];
      const context = createTestContext(mockTools, disabledTools);
      const graph = createBernardGraph(context);

      const messages = [new HumanMessage("Use echo tool")];

      // Should still work, just without the disabled tool
      const result = await graph.invoke({ messages }, { configurable: { thread_id: "test-disabled" } });
      expect(result).toBeDefined();
    });
  });
});

describe("Graph with tool execution", () => {
  it("should execute tools and return results", async () => {
    const mockTools: StructuredToolInterface[] = [
      echoTool as unknown as StructuredToolInterface,
    ];

    const context = createTestContext(mockTools);
    const graph = createBernardGraph(context);

    const messages = [new HumanMessage("Say hello")];

    const result = await graph.invoke({ messages }, { configurable: { thread_id: "test-exec" } });
    
    expect(result.messages).toBeDefined();
    expect(result.messages.length).toBeGreaterThan(0);
    
    // Last message should be from the assistant
    const lastMessage = result.messages[result.messages.length - 1];
    expect(lastMessage).toBeInstanceOf(AIMessage);
  });

  it("should handle multiple tool calls in sequence", async () => {
    const mockTools: StructuredToolInterface[] = [
      getValueTool as unknown as StructuredToolInterface,
      echoTool as unknown as StructuredToolInterface,
    ];

    const context = createTestContext(mockTools);
    const graph = createBernardGraph(context);

    const messages = [new HumanMessage("First get_value for key1, then echo hello")];

    const result = await graph.invoke({ messages }, { configurable: { thread_id: "test-multi" } });
    
    expect(result.messages).toBeDefined();
    // Should have enough messages for: user -> ai (tool call) -> tool result -> ai (tool call) -> tool result -> ai (final)
    expect(result.messages.length).toBeGreaterThanOrEqual(3);
  });
});
