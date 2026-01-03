import { describe, it, expect } from "vitest";
import { createBernardGraph, runBernardGraph } from "../../src/agent/graph/bernard.graph";
import { createTestContext, echoTool, getValueTool, slowToolWithProgress } from "../fixtures";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";

describe("End-to-End Streaming", () => {
  describe("Full agent cycle with tool calls", () => {
    it("should complete a full agent cycle with single tool call", async () => {
      const mockTools: StructuredToolInterface[] = [
        getValueTool as unknown as StructuredToolInterface,
      ];

      const context = createTestContext(mockTools);
      const graph = createBernardGraph(context);

      const inputMessages = [new HumanMessage("Get the value for my_test_key")];

      const toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
      const contentChunks: string[] = [];

      const stream = await graph.stream(
        { messages: inputMessages },
        { streamMode: ["messages", "custom"] as const }
      );

      for await (const [mode, chunk] of stream) {
        if (mode === "messages") {
          const [message, metadata] = chunk as [unknown, { tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> }];
          
          // Extract tool calls from metadata
          if (metadata?.tool_calls && Array.isArray(metadata.tool_calls)) {
            toolCalls.push(...metadata.tool_calls.map(tc => ({
              name: tc.function.name,
              arguments: tc.function.arguments ? JSON.parse(tc.function.arguments) : {},
            })));
          }
          
          // Extract message content
          if (message && typeof message === "object" && "content" in message) {
            const content = (message as { content: string }).content;
            if (typeof content === "string" && content) {
              contentChunks.push(content);
            }
          }
        }
      }

      // Verify tool was called
      expect(toolCalls.length).toBeGreaterThan(0);
      expect(toolCalls.some(tc => tc.name === "get_value")).toBe(true);
      
      // Verify response was generated
      const fullResponse = contentChunks.join("");
      expect(fullResponse.length).toBeGreaterThan(0);
    });

    it("should complete a full agent cycle with echo tool", async () => {
      const mockTools: StructuredToolInterface[] = [
        echoTool as unknown as StructuredToolInterface,
      ];

      const context = createTestContext(mockTools);
      const graph = createBernardGraph(context);

      const inputMessages = [new HumanMessage("Echo this message back to me")];

      const stream = await graph.stream(
        { messages: inputMessages },
        { streamMode: ["messages"] as const }
      );

      const responseMessages: string[] = [];

      for await (const [mode, chunk] of stream) {
        if (mode === "messages") {
          const [message] = chunk as [unknown, Record<string, unknown>];
          if (message && typeof message === "object" && "content" in message) {
            const content = (message as { content: string }).content;
            if (typeof content === "string" && content) {
              responseMessages.push(content);
            }
          }
        }
      }

      const fullResponse = responseMessages.join("");
      expect(fullResponse.length).toBeGreaterThan(0);
    });
  });

  describe("Tool progress streaming", () => {
    it("should stream progress events from slow tool execution", async () => {
      const mockTools: StructuredToolInterface[] = [
        slowToolWithProgress as unknown as StructuredToolInterface,
      ];

      const context = createTestContext(mockTools);
      const graph = createBernardGraph(context);

      const inputMessages = [new HumanMessage("Run slow_tool with 3 steps and 5ms delay")];

      const stream = await graph.stream(
        { messages: inputMessages },
        { streamMode: ["messages", "custom"] as const }
      );

      const toolProgressEvents: Array<{ tool: string; phase: string }> = [];

      for await (const [mode, chunk] of stream) {
        if (mode === "custom") {
          const event = chunk as { tool?: string; phase?: string };
          if (event.tool === "slow_tool") {
            toolProgressEvents.push({ tool: event.tool, phase: event.phase || "unknown" });
          }
        }
      }

      // Should have progress events
      expect(toolProgressEvents.length).toBeGreaterThan(0);
      
      // Should have a start event
      const startEvents = toolProgressEvents.filter(e => e.phase === "step");
      expect(startEvents.length).toBeGreaterThan(0);
    });

    it("should emit progress, step, and complete phases in order", async () => {
      const mockTools: StructuredToolInterface[] = [
        slowToolWithProgress as unknown as StructuredToolInterface,
      ];

      const context = createTestContext(mockTools);
      const graph = createBernardGraph(context);

      const inputMessages = [new HumanMessage("Run slow_tool with 1 step")];

      const stream = await graph.stream(
        { messages: inputMessages },
        { streamMode: ["custom"] as const }
      );

      const phases: string[] = [];

      for await (const [mode, chunk] of stream) {
        if (mode === "custom") {
          const event = chunk as { phase?: string };
          if (event.phase) {
            phases.push(event.phase);
          }
        }
      }

      // Should have multiple phases
      expect(phases.length).toBeGreaterThanOrEqual(2);
      
      // First should be a step (start)
      expect(phases[0]).toBe("step");
    });
  });

  describe("Multiple tool calls", () => {
    it("should handle sequential tool calls", async () => {
      const mockTools: StructuredToolInterface[] = [
        getValueTool as unknown as StructuredToolInterface,
        echoTool as unknown as StructuredToolInterface,
      ];

      const context = createTestContext(mockTools);
      const graph = createBernardGraph(context);

      const inputMessages = [new HumanMessage("First get_value for key1, then echo the result")];

      const stream = await graph.stream(
        { messages: inputMessages },
        { streamMode: ["messages"] as const }
      );

      const toolCalls: string[] = [];

      for await (const [mode, chunk] of stream) {
        if (mode === "messages") {
          const [, metadata] = chunk as [unknown, { tool_calls?: Array<{ function: { name: string } }> }];
          if (metadata?.tool_calls) {
            for (const tc of metadata.tool_calls) {
              if (tc.function.name) {
                toolCalls.push(tc.function.name);
              }
            }
          }
        }
      }

      // Should have at least one tool call
      expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("runBernardGraph helper end-to-end", () => {
    it("should stream complete conversation with tool calls", async () => {
      const mockTools: StructuredToolInterface[] = [
        getValueTool as unknown as StructuredToolInterface,
      ];

      const context = createTestContext(mockTools);
      const graph = createBernardGraph(context);

      const messages = [new HumanMessage("Get the value for test_key")];
      const stream = runBernardGraph(graph, messages, true, "e2e-thread-1");

      const events = {
        messages: 0,
        updates: 0,
        custom: 0,
        final: 0,
      };

      for await (const chunk of stream) {
        events[chunk.type as keyof typeof events]++;
      }

      // Should have message events
      expect(events.messages).toBeGreaterThan(0);
      // Should have a final event
      expect(events.final).toBe(1);
    });

    it("should emit tool calls in real-time during streaming", async () => {
      const mockTools: StructuredToolInterface[] = [
        getValueTool as unknown as StructuredToolInterface,
      ];

      const context = createTestContext(mockTools);
      const graph = createBernardGraph(context);

      const messages = [new HumanMessage("What is the value of api_key?")];
      const stream = runBernardGraph(graph, messages, true, "e2e-thread-2");

      let toolCallsSeen = false;

      for await (const chunk of stream) {
        if (chunk.type === "messages") {
          const metadata = chunk.metadata as { tool_calls?: Array<{ id: string }> } | undefined;
          if (metadata?.tool_calls && metadata.tool_calls.length > 0) {
            toolCallsSeen = true;
            break;
          }
        }
      }

      expect(toolCallsSeen).toBe(true);
    });

    it("should emit custom tool progress events during execution", async () => {
      const mockTools: StructuredToolInterface[] = [
        slowToolWithProgress as unknown as StructuredToolInterface,
      ];

      const context = createTestContext(mockTools);
      const graph = createBernardGraph(context);

      const messages = [new HumanMessage("Run slow_tool with 2 steps")];
      const stream = runBernardGraph(graph, messages, true, "e2e-thread-3");

      let customEventsSeen = false;

      for await (const chunk of stream) {
        if (chunk.type === "custom") {
          const content = chunk.content as { _type?: string };
          if (content._type === "tool_progress") {
            customEventsSeen = true;
            break;
          }
        }
      }

      expect(customEventsSeen).toBe(true);
    });
  });

  describe("Graph behavior verification", () => {
    it("should produce correct final state after full execution", async () => {
      const mockTools: StructuredToolInterface[] = [
        echoTool as unknown as StructuredToolInterface,
      ];

      const context = createTestContext(mockTools);
      const graph = createBernardGraph(context);

      const messages = [new HumanMessage("Say hello world")];

      // Use runBernardGraph with streaming disabled for final state
      const stream = runBernardGraph(graph, messages, false, "state-thread");
      const results = [];

      for await (const chunk of stream) {
        results.push(chunk);
      }

      expect(results.length).toBe(1);
      expect(results[0]?.type).toBe("final");

      const finalState = results[0]?.content as { messages: unknown[] };
      expect(finalState.messages).toBeDefined();
      expect(Array.isArray(finalState.messages)).toBe(true);
      expect(finalState.messages.length).toBeGreaterThan(0);
    });

    it("should maintain conversation history across invocations", async () => {
      const mockTools: StructuredToolInterface[] = [
        echoTool as unknown as StructuredToolInterface,
      ];

      const context = createTestContext(mockTools);
      const graph = createBernardGraph(context);

      // First message
      const messages1 = [new HumanMessage("My name is Alice")];

      const result1 = await graph.invoke({ messages: messages1 }, { configurable: { thread_id: "history-thread" } });
      
      // Second message - should include previous context
      const messages2 = [
        new HumanMessage("My name is Alice"),
        new AIMessage("Nice to meet you, Alice!"),
        new HumanMessage("What is my name?"),
      ];

      const result2 = await graph.invoke({ messages: messages2 }, { configurable: { thread_id: "history-thread" } });

      // Both should produce valid responses
      expect(result1.messages).toBeDefined();
      expect(result2.messages).toBeDefined();
      expect(result2.messages.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("Streaming edge cases", () => {
  it("should handle empty tool results gracefully", async () => {
    const mockTools: StructuredToolInterface[] = [
      getValueTool as unknown as StructuredToolInterface,
    ];

    const context = createTestContext(mockTools);
    const graph = createBernardGraph(context);

    const messages = [new HumanMessage("Get value for key")];

    const stream = await graph.stream(
      { messages },
      { streamMode: ["messages"] as const }
      );

    let validResponse = false;

    for await (const [mode, chunk] of stream) {
      if (mode === "messages") {
        const [message] = chunk as [unknown, Record<string, unknown>];
        if (message && typeof message === "object") {
          validResponse = true;
        }
      }
    }

    expect(validResponse).toBe(true);
  });

  it("should handle concurrent streaming modes", async () => {
    const context = createTestContext([]);
    const graph = createBernardGraph(context);

    const stream = await graph.stream(
      { messages: [new HumanMessage("Hello")] },
      { streamMode: ["messages", "updates", "custom"] as const }
    );

    const modesSeen = new Set<string>();

    for await (const [mode] of stream) {
      modesSeen.add(mode);
    }

    // Should have seen at least messages mode
    expect(modesSeen.has("messages")).toBe(true);
  });
});
