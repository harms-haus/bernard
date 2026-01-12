import { describe, it, expect } from "vitest";
import {
  parseCheckpointKey,
  formatCheckpointKey,
  toStorageSafeId,
  fromStorageSafeId,
  toStorageSafeNs,
  fromStorageSafeNs,
} from "../redis-key.js";

describe("redis-key", () => {
  describe("formatCheckpointKey/parseCheckpointKey round-trip", () => {
    it("should handle basic thread_id without special characters", () => {
      const threadId = "thread-123";
      const checkpointNs = "";
      const checkpointId = "1ef4f797-8335-6428-8001-8a1503f9b875";

      const key = formatCheckpointKey(threadId, checkpointNs, checkpointId);
      const parsed = parseCheckpointKey(key);

      expect(parsed.threadId).toBe(threadId);
      expect(parsed.checkpointNs).toBe(checkpointNs);
      expect(parsed.checkpointId).toBe(checkpointId);
      expect(parsed.namespace).toBe("checkpoint");
    });

    it("should handle empty namespace", () => {
      const threadId = "my-thread";
      const checkpointNs = "";
      const checkpointId = "abc123";

      const key = formatCheckpointKey(threadId, checkpointNs, checkpointId);
      const parsed = parseCheckpointKey(key);

      expect(parsed.threadId).toBe(threadId);
      expect(parsed.checkpointNs).toBe("");
      expect(parsed.checkpointId).toBe(checkpointId);
    });

    it("should escape and unescape colons in namespace", () => {
      const threadId = "thread-1";
      const checkpointNs = "ns:with:colons";
      const checkpointId = "cp-456";

      const key = formatCheckpointKey(threadId, checkpointNs, checkpointId);
      expect(key).toBe("checkpoint:thread-1:ns\\:with\\:colons:cp-456");

      const parsed = parseCheckpointKey(key);
      expect(parsed.checkpointNs).toBe(checkpointNs);
      expect(parsed.threadId).toBe(threadId);
      expect(parsed.checkpointId).toBe(checkpointId);
    });

    it("should escape and unescape colons in thread_id", () => {
      const threadId = "thread:id:with:colons";
      const checkpointNs = "";
      const checkpointId = "cp-123";

      const key = formatCheckpointKey(threadId, checkpointNs, checkpointId);
      // With empty namespace, format is checkpoint:{escaped_threadId}::{escaped_checkpointId}
      expect(key).toBe("checkpoint:thread\\:id\\:with\\:colons::cp-123");

      const parsed = parseCheckpointKey(key);
      expect(parsed.threadId).toBe(threadId);
      expect(parsed.checkpointNs).toBe(checkpointNs);
      expect(parsed.checkpointId).toBe(checkpointId);
    });

    it("should escape and unescape colons in checkpoint_id", () => {
      const threadId = "thread-1";
      const checkpointNs = "";
      const checkpointId = "cp:id:456";

      const key = formatCheckpointKey(threadId, checkpointNs, checkpointId);
      // With empty namespace, format is checkpoint:{escaped_threadId}::{escaped_checkpointId}
      expect(key).toBe("checkpoint:thread-1::cp\\:id\\:456");

      const parsed = parseCheckpointKey(key);
      expect(parsed.threadId).toBe(threadId);
      expect(parsed.checkpointNs).toBe(checkpointNs);
      expect(parsed.checkpointId).toBe(checkpointId);
    });

    it("should handle backslashes in IDs (not escaped)", () => {
      const threadId = "thread\\with\\backslash";
      const checkpointNs = "";
      const checkpointId = "cp\\123";

      const key = formatCheckpointKey(threadId, checkpointNs, checkpointId);
      // Backslashes are escaped to preserve them through parsing
      expect(key).toBe("checkpoint:thread\\\\with\\\\backslash::cp\\\\123");

      const parsed = parseCheckpointKey(key);
      expect(parsed.threadId).toBe(threadId);
      expect(parsed.checkpointId).toBe(checkpointId);
    });

    it("should handle complex namespace with multiple special chars", () => {
      const threadId = "session-abc";
      const checkpointNs = "subgraph:nested:deep";
      const checkpointId = "checkpoint-xyz";

      const key = formatCheckpointKey(threadId, checkpointNs, checkpointId);
      expect(key).toBe("checkpoint:session-abc:subgraph\\:nested\\:deep:checkpoint-xyz");

      const parsed = parseCheckpointKey(key);
      expect(parsed.threadId).toBe(threadId);
      expect(parsed.checkpointNs).toBe(checkpointNs);
      expect(parsed.checkpointId).toBe(checkpointId);
    });
  });

  describe("parseCheckpointKey", () => {
    it("should throw error for invalid key format", () => {
      expect(() => parseCheckpointKey("invalid")).toThrow();
      expect(() => parseCheckpointKey("checkpoint:one")).toThrow();
      expect(() => parseCheckpointKey("checkpoint:one:two")).toThrow();
    });

    it("should parse standard key format", () => {
      const key = "checkpoint:thread-123::1ef4f797-8335-6428-8001-8a1503f9b875";
      const parsed = parseCheckpointKey(key);

      expect(parsed.namespace).toBe("checkpoint");
      expect(parsed.threadId).toBe("thread-123");
      expect(parsed.checkpointNs).toBe("");
      expect(parsed.checkpointId).toBe("1ef4f797-8335-6428-8001-8a1503f9b875");
    });
  });

  describe("toStorageSafeId/fromStorageSafeId", () => {
    it("should escape colons", () => {
      expect(toStorageSafeId("a:b")).toBe("a\\:b");
      expect(toStorageSafeId("a:b:c")).toBe("a\\:b\\:c");
    });

    it("should unescape colons", () => {
      expect(fromStorageSafeId("a\\:b")).toBe("a:b");
      expect(fromStorageSafeId("a\\:b\\:c")).toBe("a:b:c");
    });

    it("should preserve backslashes (not escaped)", () => {
      // Backslashes are escaped to preserve them through round-trip
      // "a\\b" (JS string with single backslash) becomes "a\\\\b" when escaped
      expect(toStorageSafeId("a\\b")).toBe("a\\\\b");
      expect(fromStorageSafeId("a\\\\b")).toBe("a\\b");
    });

    it("should be idempotent for simple strings", () => {
      const simple = "simple-string-123";
      expect(fromStorageSafeId(toStorageSafeId(simple))).toBe(simple);
    });

    it("should handle empty string", () => {
      expect(toStorageSafeId("")).toBe("");
      expect(fromStorageSafeId("")).toBe("");
    });
  });

  describe("toStorageSafeNs/fromStorageSafeNs", () => {
    it("should escape colons", () => {
      expect(toStorageSafeNs("a:b")).toBe("a\\:b");
      expect(toStorageSafeNs("a:b:c")).toBe("a\\:b\\:c");
    });

    it("should unescape colons", () => {
      expect(fromStorageSafeNs("a\\:b")).toBe("a:b");
      expect(fromStorageSafeNs("a\\:b\\:c")).toBe("a:b:c");
    });

    it("should be idempotent for simple strings", () => {
      const simple = "simple-string-123";
      expect(fromStorageSafeNs(toStorageSafeNs(simple))).toBe(simple);
    });

    it("should handle empty string", () => {
      expect(toStorageSafeNs("")).toBe("");
      expect(fromStorageSafeNs("")).toBe("");
    });

    it("should not escape backslashes in namespace", () => {
      expect(toStorageSafeNs("a\\b")).toBe("a\\b");
      expect(fromStorageSafeNs("a\\b")).toBe("a\\b");
    });
  });
});
