/**
 * Unit tests for ConversationRecordKeeper
 */

import { describe, expect, it, beforeEach } from "vitest";
import { FakeRedis } from "./fakeRedis";
import { ConversationRecordKeeper } from "../lib/conversation/conversationRecorder";
import type { ConversationEvent } from "../lib/conversation/events";
import type Redis from "ioredis";

describe("ConversationRecordKeeper", () => {
  let fakeRedis: FakeRedis;
  let recorder: ConversationRecordKeeper;

  beforeEach(() => {
    fakeRedis = new FakeRedis();
    recorder = new ConversationRecordKeeper(fakeRedis as unknown as Redis);
  });

  describe("createConversation", () => {
    it("should create a new conversation with correct metadata", async () => {
      const conversationId = "test-conv-123";
      const userId = "user-456";
      const userName = "Test User";

      const conversation = await recorder.createConversation(
        conversationId,
        userId,
        userName
      );

      expect(conversation.id).toBe(conversationId);
      expect(conversation.userId).toBe(userId);
      expect(conversation.userName).toBe(userName);
      expect(conversation.archived).toBe(false);
      expect(conversation.messageCount).toBe(0);
      expect(conversation.toolCallCount).toBe(0);
      expect(conversation.name).toBe("");
      expect(conversation.description).toBe("");
      expect(conversation.createdAt).toBeDefined();
      expect(conversation.lastTouchedAt).toBeDefined();
    });

    it("should add conversation to user's active set", async () => {
      const conversationId = "test-conv-123";
      const userId = "user-456";

      await recorder.createConversation(conversationId, userId);

      const exists = await recorder.conversationExists(conversationId);
      expect(exists).toBe(true);
    });
  });

  describe("recordEvent", () => {
    it("should record a user message event", async () => {
      const conversationId = "test-conv-123";
      const userId = "user-456";
      await recorder.createConversation(conversationId, userId);

      const event = {
        type: "user_message",
        data: {
          messageId: "msg-1",
          content: "Hello, world!",
        },
      } satisfies Omit<ConversationEvent, "id" | "timestamp">;

      await recorder.recordEvent(conversationId, event);

      const events = await recorder.getEvents(conversationId);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe("user_message");
      const userEvent = events[0]!;
      if (userEvent.type === "user_message") {
        expect((userEvent.data as { messageId: string }).messageId).toBe("msg-1");
        expect((userEvent.data as { content: string }).content).toBe("Hello, world!");
      }
      expect(events[0]!.id).toBeDefined();
      expect(events[0]!.timestamp).toBeDefined();
    });

    it("should record multiple events in chronological order", async () => {
      const conversationId = "test-conv-123";
      const userId = "user-456";
      await recorder.createConversation(conversationId, userId);

      const userMessage = {
        type: "user_message",
        data: { messageId: "msg-1", content: "Hello" },
      } as const satisfies Omit<ConversationEvent, "id" | "timestamp">;

      const llmCall = {
        type: "llm_call",
        data: {
          messageId: "msg-1",
          stage: "router" as const,
          model: "test-model",
          context: [],
          availableTools: [],
        },
      } as const satisfies Omit<ConversationEvent, "id" | "timestamp">;

      const assistantMessage = {
        type: "assistant_message",
        data: {
          messageId: "msg-2",
          content: "Hi there!",
          totalDurationMs: 100,
          totalToolCalls: 0,
          totalLLMCalls: 1,
        },
      } as const satisfies Omit<ConversationEvent, "id" | "timestamp">;

      await recorder.recordEvent(conversationId, userMessage);
      await recorder.recordEvent(conversationId, llmCall);
      await recorder.recordEvent(conversationId, assistantMessage);

      const events = await recorder.getEvents(conversationId);
      expect(events).toHaveLength(3);
      expect(events[0]!.type).toBe("user_message");
      expect(events[1]!.type).toBe("llm_call");
      expect(events[2]!.type).toBe("assistant_message");
    });
  });

  describe("getConversation", () => {
    it("should return conversation with events", async () => {
      const conversationId = "test-conv-123";
      const userId = "user-456";
      await recorder.createConversation(conversationId, userId);

      const event = {
        type: "user_message",
        data: { messageId: "msg-1", content: "Test message" },
      } satisfies Omit<ConversationEvent, "id" | "timestamp">;
      await recorder.recordEvent(conversationId, event);

      const result = await recorder.getConversation(conversationId);

      expect(result).not.toBeNull();
      expect(result!.conversation.id).toBe(conversationId);
      expect(result!.conversation.userId).toBe(userId);
      expect(result!.events).toHaveLength(1);
    });

    it("should return null for non-existent conversation", async () => {
      const result = await recorder.getConversation("non-existent");
      expect(result).toBeNull();
    });
  });

  describe("getConversationMetadata", () => {
    it("should return only metadata without events", async () => {
      const conversationId = "test-conv-123";
      const userId = "user-456";
      await recorder.createConversation(conversationId, userId);

      const event = {
        type: "user_message",
        data: { messageId: "msg-1", content: "Test" },
      } satisfies Omit<ConversationEvent, "id" | "timestamp">;
      await recorder.recordEvent(conversationId, event);

      const metadata = await recorder.getConversationMetadata(conversationId);

      expect(metadata).not.toBeNull();
      expect(metadata!.id).toBe(conversationId);
      expect(metadata!.userId).toBe(userId);
    });
  });

  describe("archiveConversation", () => {
    it("should archive a conversation and move it to archived set", async () => {
      const conversationId = "test-conv-123";
      const userId = "user-456";
      await recorder.createConversation(conversationId, userId);

      const result = await recorder.archiveConversation(conversationId, userId);

      expect(result).toBe(true);

      const metadata = await recorder.getConversationMetadata(conversationId);
      expect(metadata?.archived).toBe(true);
      expect(metadata?.archivedAt).toBeDefined();
    });

    it("should return false for non-existent conversation", async () => {
      const result = await recorder.archiveConversation("non-existent", "user-123");
      expect(result).toBe(false);
    });

    it("should return false for unauthorized archive attempt", async () => {
      const conversationId = "test-conv-123";
      const userId = "user-456";
      await recorder.createConversation(conversationId, userId);

      const result = await recorder.archiveConversation(conversationId, "other-user");
      expect(result).toBe(false);
    });
  });

  describe("deleteConversation", () => {
    it("should permanently delete a conversation", async () => {
      const conversationId = "test-conv-123";
      const userId = "user-456";
      await recorder.createConversation(conversationId, userId);

      const result = await recorder.deleteConversation(conversationId, userId);
      expect(result).toBe(true);

      const exists = await recorder.conversationExists(conversationId);
      expect(exists).toBe(false);
    });

    it("should return false for non-existent conversation", async () => {
      const result = await recorder.deleteConversation("non-existent", "admin-123");
      expect(result).toBe(false);
    });
  });

  describe("listConversations", () => {
    it("should list user's active conversations", async () => {
      const userId = "user-456";
      await recorder.createConversation("conv-1", userId);
      await recorder.createConversation("conv-2", userId);
      await recorder.createConversation("conv-3", userId);

      const result = await recorder.listConversations(userId);

      expect(result.conversations).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(false);
    });

    it("should support pagination", async () => {
      const userId = "user-456";
      for (let i = 0; i < 5; i++) {
        await recorder.createConversation(`conv-${i}`, userId);
      }

      const result = await recorder.listConversations(userId, { limit: 2, offset: 0 });

      expect(result.conversations).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.hasMore).toBe(true);
    });

    it("should list archived conversations when requested", async () => {
      const userId = "user-456";
      await recorder.createConversation("conv-1", userId);
      await recorder.archiveConversation("conv-1", userId);

      const activeResult = await recorder.listConversations(userId, { archived: false });
      const archivedResult = await recorder.listConversations(userId, { archived: true });

      expect(activeResult.conversations).toHaveLength(0);
      expect(archivedResult.conversations).toHaveLength(1);
      expect(archivedResult.conversations[0]!.archived).toBe(true);
    });

    it("should return empty list for user with no conversations", async () => {
      const result = await recorder.listConversations("non-existent-user");
      expect(result.conversations).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe("updateConversation", () => {
    it("should update conversation name and description", async () => {
      const conversationId = "test-conv-123";
      const userId = "user-456";
      await recorder.createConversation(conversationId, userId);

      const result = await recorder.updateConversation(conversationId, {
        name: "Test Conversation",
        description: "A test conversation",
      });

      expect(result).toBe(true);

      const metadata = await recorder.getConversationMetadata(conversationId);
      expect(metadata?.name).toBe("Test Conversation");
      expect(metadata?.description).toBe("A test conversation");
    });

    it("should return false for non-existent conversation", async () => {
      const result = await recorder.updateConversation("non-existent", { name: "Test" });
      expect(result).toBe(false);
    });
  });

  describe("getUserId", () => {
    it("should return the user ID who owns the conversation", async () => {
      const conversationId = "test-conv-123";
      const userId = "user-456";
      await recorder.createConversation(conversationId, userId);

      const result = await recorder.getUserId(conversationId);
      expect(result).toBe(userId);
    });

    it("should return null for non-existent conversation", async () => {
      const result = await recorder.getUserId("non-existent");
      expect(result).toBeNull();
    });
  });

  describe("conversationExists", () => {
    it("should return true for existing conversation", async () => {
      const conversationId = "test-conv-123";
      const userId = "user-456";
      await recorder.createConversation(conversationId, userId);

      const exists = await recorder.conversationExists(conversationId);
      expect(exists).toBe(true);
    });

    it("should return false for non-existent conversation", async () => {
      const exists = await recorder.conversationExists("non-existent");
      expect(exists).toBe(false);
    });
  });
});
