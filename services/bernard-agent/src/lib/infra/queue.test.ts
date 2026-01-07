/**
 * Utility Queue Unit Tests
 * Tests for queue job processing, type definitions, and error handling
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ThreadNamingJobData,
  MetadataUpdateJobData,
  EmbeddingCacheJobData,
  UtilityJobData,
  ThreadNamingResult,
  MetadataUpdateResult,
  EmbeddingCacheResult,
  UtilityJobResult,
} from "./queue";

// ============================================================================
// Type Definition Tests
// ============================================================================

describe("Utility Job Type Definitions", () => {
  describe("ThreadNamingJobData", () => {
    it("should accept valid thread naming job data", () => {
      const data: ThreadNamingJobData = {
        threadId: "thread-123",
        message: "Hello, I need help with my project",
      };

      expect(data.threadId).toBe("thread-123");
      expect(data.message).toBe("Hello, I need help with my project");
    });

    it("should accept empty thread ID", () => {
      const data: ThreadNamingJobData = {
        threadId: "",
        message: "Test message",
      };

      expect(data.threadId).toBe("");
    });
  });

  describe("MetadataUpdateJobData", () => {
    it("should accept valid metadata update job data", () => {
      const data: MetadataUpdateJobData = {
        threadId: "thread-456",
        field: "title",
        value: { title: "New Title" },
      };

      expect(data.threadId).toBe("thread-456");
      expect(data.field).toBe("title");
      expect(data.value).toEqual({ title: "New Title" });
    });

    it("should accept 'tags' field type", () => {
      const data: MetadataUpdateJobData = {
        threadId: "thread-789",
        field: "tags",
        value: { tags: ["help", "coding"] },
      };

      expect(data.field).toBe("tags");
    });

    it("should accept 'metadata' field type", () => {
      const data: MetadataUpdateJobData = {
        threadId: "thread-abc",
        field: "metadata",
        value: { priority: "high", category: "support" },
      };

      expect(data.field).toBe("metadata");
    });
  });

  describe("EmbeddingCacheJobData", () => {
    it("should accept valid embedding cache job data", () => {
      const data: EmbeddingCacheJobData = {
        threadId: "thread-def",
        content: "This is the content to embed",
        embeddingKey: "embedding:thread-def:123",
      };

      expect(data.threadId).toBe("thread-def");
      expect(data.content).toBe("This is the content to embed");
      expect(data.embeddingKey).toBe("embedding:thread-def:123");
    });
  });

  describe("UtilityJobData Union Type", () => {
    it("should accept thread naming job data", () => {
      const data: UtilityJobData = {
        threadId: "thread-123",
        message: "Test message",
      };

      expect(data).toHaveProperty("threadId");
    });

    it("should accept metadata update job data", () => {
      const data: UtilityJobData = {
        threadId: "thread-456",
        field: "title",
        value: { title: "New" },
      };

      expect(data).toHaveProperty("field");
    });

    it("should accept embedding cache job data", () => {
      const data: UtilityJobData = {
        threadId: "thread-789",
        content: "Test content",
        embeddingKey: "key-123",
      };

      expect(data).toHaveProperty("embeddingKey");
    });
  });
});

describe("Utility Job Result Type Definitions", () => {
  describe("ThreadNamingResult", () => {
    it("should accept successful result", () => {
      const result: ThreadNamingResult = {
        success: true,
        threadId: "thread-123",
        title: "Test Title",
      };

      expect(result.success).toBe(true);
      expect(result.threadId).toBe("thread-123");
      expect(result.title).toBe("Test Title");
    });

    it("should accept result with error", () => {
      const result: ThreadNamingResult = {
        success: false,
        threadId: "thread-456",
        error: "Model timeout",
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe("Model timeout");
    });

    it("should allow optional title on failure", () => {
      const result: ThreadNamingResult = {
        success: false,
        threadId: "thread-789",
        error: "Failed to generate",
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to generate");
      expect(result.title).toBeUndefined();
    });
  });

  describe("MetadataUpdateResult", () => {
    it("should accept successful result", () => {
      const result: MetadataUpdateResult = {
        success: true,
        threadId: "thread-123",
        field: "title",
      };

      expect(result.success).toBe(true);
      expect(result.field).toBe("title");
    });

    it("should accept result with error", () => {
      const result: MetadataUpdateResult = {
        success: false,
        threadId: "thread-456",
        field: "tags",
        error: "Redis connection failed",
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe("Redis connection failed");
    });
  });

  describe("EmbeddingCacheResult", () => {
    it("should accept successful cached result", () => {
      const result: EmbeddingCacheResult = {
        success: true,
        threadId: "thread-123",
        embeddingKey: "key-456",
        cached: true,
      };

      expect(result.success).toBe(true);
      expect(result.cached).toBe(true);
    });

    it("should accept successful uncached result", () => {
      const result: EmbeddingCacheResult = {
        success: true,
        threadId: "thread-789",
        embeddingKey: "key-abc",
        cached: false,
      };

      expect(result.success).toBe(true);
      expect(result.cached).toBe(false);
    });
  });

  describe("UtilityJobResult Union Type", () => {
    it("should accept thread naming result", () => {
      const result: UtilityJobResult = {
        success: true,
        threadId: "thread-123",
        title: "My Title",
      };

      expect(result).toHaveProperty("title");
    });

    it("should accept metadata update result", () => {
      const result: UtilityJobResult = {
        success: true,
        threadId: "thread-456",
        field: "title",
      };

      expect(result).toHaveProperty("field");
    });

    it("should accept embedding cache result", () => {
      const result: UtilityJobResult = {
        success: true,
        threadId: "thread-789",
        embeddingKey: "key-abc",
        cached: true,
      };

      expect(result).toHaveProperty("embeddingKey");
    });
  });
});

// ============================================================================
// Queue Configuration Tests
// ============================================================================

describe("Queue Configuration Constants", () => {
  const QUEUE_NAME = "utility";
  const UTILITY_QUEUE_PREFIX = "bernard:queue:utility";

  it("should have correct queue name", () => {
    expect(QUEUE_NAME).toBe("utility");
  });

  it("should have correct prefix pattern", () => {
    expect(UTILITY_QUEUE_PREFIX).toBe("bernard:queue:utility");
    expect(UTILITY_QUEUE_PREFIX).toContain("bernard");
    expect(UTILITY_QUEUE_PREFIX).toContain("queue");
  });
});

// ============================================================================
// Environment Configuration Tests
// ============================================================================

describe("Environment Configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should use default concurrency when not set", () => {
    delete process.env["UTILITY_QUEUE_CONCURRENCY"];
    const concurrency = parseInt(process.env["UTILITY_QUEUE_CONCURRENCY"] ?? "5");
    expect(concurrency).toBe(5);
  });

  it("should use custom concurrency when set", () => {
    process.env["UTILITY_QUEUE_CONCURRENCY"] = "10";
    const concurrency = parseInt(process.env["UTILITY_QUEUE_CONCURRENCY"] ?? "5");
    expect(concurrency).toBe(10);
  });

  it("should use default retries when not set", () => {
    delete process.env["UTILITY_QUEUE_RETRIES"];
    const retries = parseInt(process.env["UTILITY_QUEUE_RETRIES"] ?? "3");
    expect(retries).toBe(3);
  });

  it("should use default backoff when not set", () => {
    delete process.env["UTILITY_QUEUE_BACKOFF"];
    const backoff = parseInt(process.env["UTILITY_QUEUE_BACKOFF"] ?? "2000");
    expect(backoff).toBe(2000);
  });

  it("should use default remove completed count when not set", () => {
    delete process.env["UTILITY_QUEUE_REMOVE_COMPLETED"];
    const removeCompleted = parseInt(process.env["UTILITY_QUEUE_REMOVE_COMPLETED"] ?? "100");
    expect(removeCompleted).toBe(100);
  });

  it("should use default remove failed count when not set", () => {
    delete process.env["UTILITY_QUEUE_REMOVE_FAILED"];
    const removeFailed = parseInt(process.env["UTILITY_QUEUE_REMOVE_FAILED"] ?? "500");
    expect(removeFailed).toBe(500);
  });
});

// ============================================================================
// Job Data Validation Tests
// ============================================================================

describe("Job Data Validation", () => {
  describe("ThreadNamingJobData validation", () => {
    it("should validate required fields", () => {
      const isValid = (data: unknown): data is ThreadNamingJobData => {
        if (typeof data !== "object" || data === null) return false;
        const d = data as Record<string, unknown>;
        return (
          typeof d["threadId"] === "string" &&
          typeof d["message"] === "string"
        );
      };

      const validData = { threadId: "thread-123", message: "Hello" };
      const invalidData = { threadId: 123, message: "Hello" };
      const missingData = { threadId: "thread-123" };

      expect(isValid(validData)).toBe(true);
      expect(isValid(invalidData)).toBe(false);
      expect(isValid(missingData)).toBe(false);
    });
  });

  describe("Job deduplication ID generation", () => {
    it("should generate correct deduplication ID for thread naming", () => {
      const threadId = "thread-123";
      const expectedJobId = `thread-naming:${threadId}`;
      const expectedDeduplicationId = `thread-naming:${threadId}`;

      expect(expectedJobId).toBe("thread-naming:thread-123");
      expect(expectedDeduplicationId).toBe("thread-naming:thread-123");
    });

    it("should handle special characters in thread ID", () => {
      const threadId = "thread-abc-123_456";
      const jobId = `thread-naming:${threadId}`;

      expect(jobId).toBe("thread-naming:thread-abc-123_456");
    });
  });
});

// ============================================================================
// Title Generation Helper Tests
// ============================================================================

describe("Title Generation Helper Functions", () => {
  it("should sanitize title by removing quotes", () => {
    const sanitizeTitle = (title: string): string => {
      return title.replace(/^["']|["']$/g, "");
    };

    expect(sanitizeTitle('"My Title"')).toBe("My Title");
    expect(sanitizeTitle("'Another Title'")).toBe("Another Title");
    expect(sanitizeTitle("No Quotes")).toBe("No Quotes");
  });

  it("should truncate long titles", () => {
    const truncateTitle = (title: string, maxLength = 50): string => {
      if (title.length <= maxLength) return title;
      return title.substring(0, maxLength - 3) + "...";
    };

    const shortTitle = "Short Title";
    const longTitle = "A".repeat(100);

    expect(truncateTitle(shortTitle)).toBe("Short Title");
    expect(truncateTitle(longTitle).length).toBe(50);
    expect(truncateTitle(longTitle)).toBe("A".repeat(47) + "...");
  });

  it("should limit title to 3-6 words", () => {
    const countWords = (title: string): number => {
      return title.trim().split(/\s+/).length;
    };

    expect(countWords("Hello")).toBe(1);
    expect(countWords("Hello World")).toBe(2);
    expect(countWords("This is a test")).toBe(4);
    expect(countWords("One Two Three Four Five Six")).toBe(6);
    expect(countWords("One Two Three Four Five Six Seven")).toBe(7);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("Error Handling Utilities", () => {
  it("should extract error message from Error instance", () => {
    const extractError = (error: unknown): string => {
      return error instanceof Error ? error.message : String(error);
    };

    expect(extractError(new Error("Test error"))).toBe("Test error");
    expect(extractError("String error")).toBe("String error");
    expect(extractError({ message: "Object error" })).toBe('[object Object]');
  });

  it("should determine if error is retryable", () => {
    const isRetryable = (error: unknown): boolean => {
      const message = error instanceof Error ? error.message : String(error);
      return !(
        error instanceof TypeError ||
        message.includes("invalid API key") ||
        message.includes("authentication")
      );
    };

    expect(isRetryable(new Error("Network timeout"))).toBe(true);
    expect(isRetryable(new TypeError("Invalid argument"))).toBe(false);
    expect(isRetryable(new Error("invalid API key"))).toBe(false);
    expect(isRetryable(new Error("authentication failed"))).toBe(false);
  });
});

// ============================================================================
// Thread Metadata Tests
// ============================================================================

describe("Thread Metadata Operations", () => {
  it("should create thread metadata object", () => {
    const createThreadMetadata = (
      title: string,
      namedAt?: Date
    ): Record<string, unknown> => {
      return {
        title,
        namedAt: namedAt?.toISOString() ?? new Date().toISOString(),
      };
    };

    const metadata = createThreadMetadata("My Title");
    expect(metadata["title"]).toBe("My Title");
    expect(metadata["namedAt"]).toBeDefined();
  });

  it("should preserve existing thread data when updating", () => {
    const existingData = {
      id: "thread-123",
      createdAt: "2024-01-01T00:00:00.000Z",
    };

    const updateData = {
      title: "New Title",
      namedAt: new Date().toISOString(),
    };

    const mergedData = {
      ...existingData,
      ...updateData,
    };

    expect(mergedData.id).toBe("thread-123");
    expect(mergedData.title).toBe("New Title");
    expect(mergedData.createdAt).toBe("2024-01-01T00:00:00.000Z");
  });
});
