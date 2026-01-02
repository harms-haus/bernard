import { describe, it, expect, beforeEach, afterEach, assert } from "vitest";
import {
  AIMessage,
  ToolMessage,
  HumanMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { MistralAdapter } from "../mistral.adapter";
import { adapterRegistry } from "../registry";
import type { LLMResponse } from "../../llm";
import type { ModelAdapter } from "../adapter.interface";

describe("MistralAdapter", () => {
  beforeEach(() => {
    adapterRegistry.clear();
  });

  afterEach(() => {
    adapterRegistry.clear();
  });

  describe("appliesTo", () => {
    it("should return true for mistral model names", () => {
      const adapter = new MistralAdapter();
      expect(adapter.appliesTo("mistral-large")).toBe(true);
      expect(adapter.appliesTo("mistral-small")).toBe(true);
      expect(adapter.appliesTo("mistral-medium")).toBe(true);
      expect(adapter.appliesTo("open-mistral-7b")).toBe(true);
      expect(adapter.appliesTo("open-mistral-nemo-2407")).toBe(true);
      expect(adapter.appliesTo("mixtral-8x7b")).toBe(true);
    });

    it("should return true for case-insensitive model names", () => {
      const adapter = new MistralAdapter();
      expect(adapter.appliesTo("MISTRAL-LARGE")).toBe(true);
      expect(adapter.appliesTo("Mistral-Small")).toBe(true);
      expect(adapter.appliesTo("MiXTrAl")).toBe(true);
    });

    it("should return false for non-mistral model names", () => {
      const adapter = new MistralAdapter();
      expect(adapter.appliesTo("gpt-4o")).toBe(false);
      expect(adapter.appliesTo("claude-3-opus")).toBe(false);
      expect(adapter.appliesTo("llama3")).toBe(false);
    });
  });

  describe("adapt", () => {
    it("should compress long tool call IDs to 9 characters", () => {
      const adapter = new MistralAdapter();
      const longId = "call_abc123def456ghi789";

      const messages = [
        new AIMessage({
          content: "I need to call a tool",
          tool_calls: [
            {
              id: longId,
              name: "test_tool",
              args: { param: "value" },
            },
          ],
        }),
        new ToolMessage({
          content: "tool result",
          tool_call_id: longId,
          name: "test_tool",
        }),
      ];

      const result = adapter.adapt({ messages, config: { model: "mistral-large" } });

      const adaptedMessage = result.messages[0] as AIMessage;
      const toolCall = adaptedMessage.tool_calls?.[0];
      assert(toolCall != null, "toolCall should be defined");
      assert(toolCall.id != null, "toolCall.id should be defined");
      expect(toolCall.id.length).toBe(9);
      expect(toolCall.id).not.toBe(longId);
    });

    it("should maintain bi-directional mapping", () => {
      const adapter = new MistralAdapter();
      const longId = "call_very_long_tool_id_12345";

      const messages = [
        new AIMessage({
          content: "Calling tool",
          tool_calls: [
            {
              id: longId,
              name: "test_tool",
              args: {},
            },
          ],
        }),
        new ToolMessage({
          content: "tool result",
          tool_call_id: longId,
          name: "test_tool",
        }),
      ];

      const result = adapter.adapt({ messages, config: { model: "mistral-large" } });
      const adaptedMessage = result.messages[0] as AIMessage;
      const adaptedToolCall = adaptedMessage.tool_calls?.[0];
      assert(adaptedToolCall != null, "adaptedToolCall should be defined");
      const adaptedId = adaptedToolCall.id;
      assert(adaptedId != null, "adaptedToolCall.id should be defined");

      const response = new AIMessage({
        content: "Tool result",
        tool_calls: [{ id: adaptedId, name: "test_tool", args: {} }],
      });

      const adaptedBack = adapter.adaptBack(response) as AIMessage;
      const adaptedIdBack = adaptedBack.tool_calls?.[0]?.id;
      expect(adaptedIdBack).toBe(longId);
    });

    it("should handle multiple tool calls with matching responses", () => {
      const adapter = new MistralAdapter();

      const messages = [
        new AIMessage({
          content: "Calling multiple tools",
          tool_calls: [
            { id: "tool_call_1_very_long_id", name: "tool1", args: {} },
            { id: "tool_call_2_another_long_id", name: "tool2", args: {} },
            { id: "tool_call_3_yet_another_one", name: "tool3", args: {} },
          ],
        }),
        new ToolMessage({
          content: "result1",
          tool_call_id: "tool_call_1_very_long_id",
          name: "tool1",
        }),
        new ToolMessage({
          content: "result2",
          tool_call_id: "tool_call_2_another_long_id",
          name: "tool2",
        }),
        new ToolMessage({
          content: "result3",
          tool_call_id: "tool_call_3_yet_another_one",
          name: "tool3",
        }),
      ];

      const result = adapter.adapt({ messages, config: { model: "mistral-large" } });

      const adaptedMessage = result.messages[0] as AIMessage;
      expect(adaptedMessage.tool_calls).toHaveLength(3);
      const toolCalls = adaptedMessage.tool_calls;
      assert(toolCalls != null, "tool_calls should be defined");
      for (const tc of toolCalls) {
        assert(tc.id != null, "tc.id should be defined");
        expect(tc.id.length).toBe(9);
      }
    });

    it("should handle ToolMessage with tool_call_id", () => {
      const adapter = new MistralAdapter();

      const messages = [
        new AIMessage({
          content: "Calling tool",
          tool_calls: [{ id: "very_long_tool_call_id_12345", name: "test_tool", args: {} }],
        }),
        new ToolMessage({
          content: "tool result here",
          tool_call_id: "very_long_tool_call_id_12345",
          name: "test_tool",
        }),
      ];

      const result = adapter.adapt({ messages, config: { model: "mistral-large" } });

      const adaptedMessage = result.messages[1] as ToolMessage;
      expect(adaptedMessage.tool_call_id.length).toBe(9);
    });

    it("should preserve non-tool messages unchanged", () => {
      const adapter = new MistralAdapter();

      const messages = [
        { role: "user", content: "Hello" } as unknown as BaseMessage,
        new AIMessage({ content: "Hi there" }),
      ];

      const result = adapter.adapt({ messages, config: { model: "mistral-large" } });

      expect(result.messages).toHaveLength(2);
      const secondMsg = result.messages[1];
      assert(secondMsg != null, "second message should be defined");
      expect(secondMsg.content).toBe("Hi there");
    });
  });

  describe("adaptBack", () => {
    it("should re-inflate compressed IDs back to originals", () => {
      const adapter = new MistralAdapter();
      const originalId = "call_very_long_id_12345678";

      const messages = [
        new AIMessage({
          content: "test",
          tool_calls: [{ id: originalId, name: "tool", args: {} }],
        }),
        new ToolMessage({
          content: "tool result",
          tool_call_id: originalId,
          name: "tool",
        }),
      ];

      adapter.adapt({ messages, config: { model: "mistral-large" } });

      const state = adapter.getStateForTest<Record<string, string>>("originalToCompressed");
      const compressedId = state?.[originalId];
      assert(compressedId != null, "compressedId should be defined");
      expect(compressedId.length).toBe(9);

      const response = new AIMessage({
        content: "result",
        tool_calls: [{ id: compressedId, name: "tool", args: {} }],
      });

      const adaptedBack = adapter.adaptBack(response) as AIMessage;
      const adaptedIdBack = adaptedBack.tool_calls?.[0]?.id;
      expect(adaptedIdBack).toBe(originalId);
    });

    it("should handle LLMResponse without tool calls", () => {
      const adapter = new MistralAdapter();

      const response: LLMResponse = {
        content: "Hello, world!",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      };

      const result = adapter.adaptBack(response);
      expect(result).toEqual(response);
    });
  });

  describe("message ordering", () => {
    it("should remove orphaned tool calls without matching responses", () => {
      const adapter = new MistralAdapter();

      const messages = [
        new AIMessage({
          content: "I need to call a tool",
          tool_calls: [{ id: "tool_call_1", name: "test_tool", args: { param: "value" } }],
        }),
      ];

      const result = adapter.adapt({ messages, config: { model: "mistral-large" } });

      // The orphaned tool call should be removed
      expect(result.messages).toHaveLength(0);
    });

    it("should remove orphaned tool responses without matching calls", () => {
      const adapter = new MistralAdapter();

      const messages = [
        new ToolMessage({
          content: "tool result here",
          tool_call_id: "orphan_call",
          name: "test_tool",
        }),
      ];

      const result = adapter.adapt({ messages, config: { model: "mistral-large" } });

      // The orphaned tool response should be removed
      expect(result.messages).toHaveLength(0);
    });

    it("should keep valid tool call + response pairs", () => {
      const adapter = new MistralAdapter();

      const messages = [
        new AIMessage({
          content: "I need to call a tool",
          tool_calls: [{ id: "tool_call_1", name: "test_tool", args: { param: "value" } }],
        }),
        new ToolMessage({
          content: "tool result here",
          tool_call_id: "tool_call_1",
          name: "test_tool",
        }),
      ];

      const result = adapter.adapt({ messages, config: { model: "mistral-large" } });

      // Both messages should be kept
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toBeInstanceOf(AIMessage);
      expect(result.messages[1]).toBeInstanceOf(ToolMessage);
    });

    it("should handle multiple tool calls with matching responses", () => {
      const adapter = new MistralAdapter();

      const messages = [
        new AIMessage({
          content: "Calling multiple tools",
          tool_calls: [
            { id: "tool_call_1", name: "tool1", args: {} },
            { id: "tool_call_2", name: "tool2", args: {} },
          ],
        }),
        new ToolMessage({
          content: "result1",
          tool_call_id: "tool_call_1",
          name: "tool1",
        }),
        new ToolMessage({
          content: "result2",
          tool_call_id: "tool_call_2",
          name: "tool2",
        }),
      ];

      const result = adapter.adapt({ messages, config: { model: "mistral-large" } });

      // All messages should be kept
      expect(result.messages).toHaveLength(3);
    });

    it("should filter out orphaned calls but keep subsequent valid sequences", () => {
      const adapter = new MistralAdapter();

      const messages = [
        // First, an orphaned tool call (no response)
        new AIMessage({
          content: "Orphaned call",
          tool_calls: [{ id: "orphan_call", name: "orphan_tool", args: {} }],
        }),
        // Then a valid sequence
        new AIMessage({
          content: "Valid call",
          tool_calls: [{ id: "valid_call", name: "valid_tool", args: {} }],
        }),
        new ToolMessage({
          content: "valid result",
          tool_call_id: "valid_call",
          name: "valid_tool",
        }),
      ];

      const result = adapter.adapt({ messages, config: { model: "mistral-large" } });

      // Only the valid sequence should be kept (orphaned call is filtered out)
      expect(result.messages).toHaveLength(2);
      const adaptedMessage = result.messages[0] as AIMessage;
      expect(adaptedMessage.tool_calls?.[0]?.id).toBeDefined();
      // The ID will be compressed, so we just check it's 9 characters
      expect(adaptedMessage.tool_calls?.[0]?.id?.length).toBe(9);
    });

    it("should preserve non-tool messages", () => {
      const adapter = new MistralAdapter();

      const messages = [
        new HumanMessage({ content: "Hello" }),
        new AIMessage({ content: "Hi there" }),
        new HumanMessage({ content: "How are you?" }),
      ];

      const result = adapter.adapt({ messages, config: { model: "mistral-large" } });

      expect(result.messages).toHaveLength(3);
    });

    it("should handle interleaved valid and invalid sequences", () => {
      const adapter = new MistralAdapter();

      const messages = [
        // Valid sequence
        new AIMessage({
          content: "Call 1",
          tool_calls: [{ id: "call_1", name: "tool1", args: {} }],
        }),
        new ToolMessage({
          content: "result1",
          tool_call_id: "call_1",
          name: "tool1",
        }),
        // Orphaned call
        new AIMessage({
          content: "Orphaned",
          tool_calls: [{ id: "orphan", name: "orphan_tool", args: {} }],
        }),
        // Regular message
        new AIMessage({ content: "Regular message" }),
        // Valid sequence
        new AIMessage({
          content: "Call 2",
          tool_calls: [{ id: "call_2", name: "tool2", args: {} }],
        }),
        new ToolMessage({
          content: "result2",
          tool_call_id: "call_2",
          name: "tool2",
        }),
      ];

      const result = adapter.adapt({ messages, config: { model: "mistral-large" } });

      // Should have: valid sequence 1 + regular message + valid sequence 2 = 5 messages
      expect(result.messages).toHaveLength(5);
    });
  });

  describe("collision handling", () => {
    it("should generate unique IDs when hash collisions occur", () => {
      const adapter = new MistralAdapter();

      const messages = [
        new AIMessage({
          content: "tools",
          tool_calls: [
            { id: "aaaaaaaaaaaaaaaa", name: "tool1", args: {} },
            { id: "bbbbbbbbbbbbbbbb", name: "tool2", args: {} },
          ],
        }),
        new ToolMessage({
          content: "result1",
          tool_call_id: "aaaaaaaaaaaaaaaa",
          name: "tool1",
        }),
        new ToolMessage({
          content: "result2",
          tool_call_id: "bbbbbbbbbbbbbbbb",
          name: "tool2",
        }),
      ];

      const result = adapter.adapt({ messages, config: { model: "mistral-large" } });
      const adaptedMessage = result.messages[0] as AIMessage;

      const toolCalls = adaptedMessage.tool_calls;
      assert(toolCalls != null, "tool_calls should be defined");
      const ids = toolCalls.map((tc) => {
        assert(tc.id != null, "tc.id should be defined");
        return tc.id;
      });
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});

describe("MistralAdapter auto-registration", () => {
  it("should be findable for mistral models", () => {
    const adapters = adapterRegistry.all();
    const mistralAdapter = adapters.find((a: ModelAdapter) => a.name === "mistral");
    expect(mistralAdapter).toBeDefined();

    expect(mistralAdapter!.appliesTo("mistral-large")).toBe(true);
    expect(mistralAdapter!.appliesTo("open-mistral-7b")).toBe(true);
    expect(mistralAdapter!.appliesTo("mixtral-8x7b")).toBe(true);
  });
});
