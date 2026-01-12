import { describe, it, expect, vi } from "vitest";
import { RedisSaver } from "../redis-saver.js";

// Helper to convert Uint8Array to base64 string (matching redis-saver implementation)
function toBase64(buffer: Uint8Array): string {
  // Use Buffer if available for proper base64 encoding
  if (typeof Buffer !== "undefined") {
    return Buffer.from(buffer).toString("base64");
  }
  // Fallback for browser environments
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

// Mock the redis module
vi.mock("redis", () => ({
  createClient: vi.fn(() => {
    let isConnected = false;
    return {
      connect: vi.fn(async () => {
        isConnected = true;
      }),
      quit: vi.fn(async () => {
        isConnected = false;
      }),
      ping: vi.fn(async () => {
        if (!isConnected) {
          throw new Error("Connection is closed");
        }
        return "PONG";
      }),
      get isOpen() {
        return isConnected;
      },
      scan: vi.fn().mockResolvedValue({
        cursor: "0",
        keys: [],
      }),
      json: {
        set: vi.fn(),
        get: vi.fn(),
      },
      keys: vi.fn(),
      expire: vi.fn(),
      del: vi.fn(),
    };
  }),
}));

describe("RedisSaver", () => {
  describe("constructor", () => {
    it("should create instance with url", () => {
      const saver = new RedisSaver({ url: "redis://localhost:6379" });
      expect(saver).toBeInstanceOf(RedisSaver);
    });

    it("should create instance with default namespace", () => {
      const saver = new RedisSaver({ url: "redis://localhost:6379" });
      expect(saver).toBeInstanceOf(RedisSaver);
    });

    it("should create instance with custom namespace", () => {
      const saver = new RedisSaver({ url: "redis://localhost:6379", namespace: "custom" });
      expect(saver).toBeInstanceOf(RedisSaver);
    });

    it("should create instance with ttl", () => {
      const saver = new RedisSaver({ url: "redis://localhost:6379", ttl: 3600 });
      expect(saver).toBeInstanceOf(RedisSaver);
    });
  });

  describe("getClient", () => {
    it("should return the Redis client", () => {
      const saver = new RedisSaver({ url: "redis://localhost:6379" });
      const client = saver.getClient();
      expect(client).toBeDefined();
    });
  });

  describe("connect/close", () => {
    it("should connect and verify connection", async () => {
      const saver = new RedisSaver({ url: "redis://localhost:6379" });
      await saver.connect();
      const client = saver.getClient();
      expect(client.isOpen).toBe(true);
      // Verify connection with ping
      await expect(client.ping()).resolves.toBe("PONG");
    });

    it("should close connection", async () => {
      const saver = new RedisSaver({ url: "redis://localhost:6379" });
      await saver.connect(); // First connect to establish connection
      await saver.close();
      const client = saver.getClient();
      expect(client.isOpen).toBe(false);
      // Verify connection is closed by expecting ping to fail
      await expect(client.ping()).rejects.toThrow();
    });
  });

  describe("key format", () => {
    it("should format keys correctly for basic case", async () => {
      const saver = new RedisSaver({ url: "redis://localhost:6379" });
      const client = saver.getClient();
      
      const checkpoint = {
        v: 1,
        id: "test-checkpoint-id",
        ts: new Date().toISOString(),
        channel_values: {},
        channel_versions: {},
        versions_seen: {},
      };
      
      const metadata = {
        source: "input" as const,
        step: -1,
        parents: {},
      };
      
      const newVersions = {};
      
      await saver.put(
        { configurable: { thread_id: "thread-1" } } as any,
        checkpoint,
        metadata,
        newVersions
      );

      expect(client.json.set).toHaveBeenCalled();
      const setCall = (client.json.set as any).mock.calls[0];
      expect(setCall[0]).toContain("checkpoint:thread-1:");
      expect(setCall[0]).toContain(":test-checkpoint-id");
    });

    it("should format keys with namespace", async () => {
      const saver = new RedisSaver({ url: "redis://localhost:6379" });
      const client = saver.getClient();
      
      const checkpoint = {
        v: 1,
        id: "test-checkpoint-id",
        ts: new Date().toISOString(),
        channel_values: {},
        channel_versions: {},
        versions_seen: {},
      };
      
      const metadata = {
        source: "input" as const,
        step: -1,
        parents: {},
      };
      
      await saver.put(
        { configurable: { thread_id: "thread-1", checkpoint_ns: "my-namespace" } } as any,
        checkpoint,
        metadata,
        {}
      );

      expect(client.json.set).toHaveBeenCalled();
      const setCall = (client.json.set as any).mock.calls[0];
      expect(setCall[0]).toContain("my-namespace");
    });
  });

  describe("getTuple", () => {
    it("should return undefined for non-existent checkpoint", async () => {
      const saver = new RedisSaver({ url: "redis://localhost:6379" });
      const client = saver.getClient();
      
      (client.json.get as any).mockResolvedValue(null);

      const result = await saver.getTuple({
        configurable: { thread_id: "nonexistent", checkpoint_id: "cp-1" },
      } as any);

      expect(result).toBeUndefined();
    });
  });

  describe("list", () => {
    it("should yield checkpoints in reverse chronological order", async () => {
      const saver = new RedisSaver({ url: "redis://localhost:6379" });
      const client = saver.getClient();
      
      const now = new Date();
      const checkpoint1 = {
        v: 1,
        id: "cp-newest",
        ts: new Date(now.getTime() + 1000).toISOString(),
        channel_values: {},
        channel_versions: {},
        versions_seen: {},
      };
      const checkpoint2 = {
        v: 1,
        id: "cp-oldest",
        ts: new Date(now.getTime()).toISOString(),
        channel_values: {},
        channel_versions: {},
        versions_seen: {},
      };

      (client.json.get as any).mockImplementation((key: string) => {
        if (key.includes("cp-newest")) {
          return {
            checkpoint: toBase64(new TextEncoder().encode(JSON.stringify(checkpoint1))),
            metadata: toBase64(new TextEncoder().encode(JSON.stringify({ source: "loop", step: 1, parents: {} }))),
            checkpoint_type: "json",
            metadata_type: "json",
          };
        }
        if (key.includes("cp-oldest")) {
          return {
            checkpoint: toBase64(new TextEncoder().encode(JSON.stringify(checkpoint2))),
            metadata: toBase64(new TextEncoder().encode(JSON.stringify({ source: "input", step: -1, parents: {} }))),
            checkpoint_type: "json",
            metadata_type: "json",
          };
        }
        return null;
      });

      (client.scan as any).mockResolvedValue({
        cursor: "0",
        keys: [
          "checkpoint:thread-1::cp-newest",
          "checkpoint:thread-1::cp-oldest",
        ],
      });

      (client.keys as any).mockResolvedValue([]); // No pending writes

      const results: any[] = [];
      for await (const tuple of saver.list({ configurable: { thread_id: "thread-1" } } as any)) {
        results.push(tuple);
      }

      expect(results.length).toBe(2);
      expect(results[0].checkpoint.id).toBe("cp-newest");
      expect(results[1].checkpoint.id).toBe("cp-oldest");
    });

    it("should filter by namespace", async () => {
      const saver = new RedisSaver({ url: "redis://localhost:6379" });
      const client = saver.getClient();

      const checkpoint1 = {
        v: 1,
        id: "cp-1",
        ts: new Date().toISOString(),
        channel_values: {},
        channel_versions: {},
        versions_seen: {},
      };
      const checkpoint2 = {
        v: 1,
        id: "cp-2",
        ts: new Date().toISOString(),
        channel_values: {},
        channel_versions: {},
        versions_seen: {},
      };

      (client.json.get as any).mockImplementation((key: string) => {
        if (key.includes("cp-1")) {
          return {
            checkpoint: toBase64(new TextEncoder().encode(JSON.stringify(checkpoint1))),
            metadata: toBase64(new TextEncoder().encode(JSON.stringify({ source: "loop", step: 1, parents: {} }))),
            checkpoint_type: "json",
            metadata_type: "json",
          };
        }
        if (key.includes("cp-2")) {
          return {
            checkpoint: toBase64(new TextEncoder().encode(JSON.stringify(checkpoint2))),
            metadata: toBase64(new TextEncoder().encode(JSON.stringify({ source: "input", step: -1, parents: {} }))),
            checkpoint_type: "json",
            metadata_type: "json",
          };
        }
        return null;
      });

      (client.scan as any).mockResolvedValue({
        cursor: "0",
        keys: [
          "checkpoint:thread-1:ns1:cp-1",
          "checkpoint:thread-1:ns2:cp-2",
        ],
      });

      (client.keys as any).mockResolvedValue([]); // No pending writes for this test

      const results: any[] = [];
      for await (const tuple of saver.list({
        configurable: { thread_id: "thread-1", checkpoint_ns: "ns1" },
      } as any)) {
        results.push(tuple);
      }

      expect(results.length).toBe(1);
      expect(results[0].config.configurable.checkpoint_ns).toBe("ns1");
    });

    it("should apply limit", async () => {
      const saver = new RedisSaver({ url: "redis://localhost:6379" });
      const client = saver.getClient();

      const now = new Date();
      const checkpoints = Array.from({ length: 5 }, (_, i) => ({
        v: 1,
        id: `cp-${i}`,
        ts: new Date(now.getTime() + i * 1000).toISOString(),
        channel_values: {},
        channel_versions: {},
        versions_seen: {},
      }));

      (client.json.get as any).mockImplementation((key: string) => {
        const match = key.match(/cp-(\d+)/);
        if (match) {
          const idx = parseInt(match[1]);
          return {
            checkpoint: toBase64(new TextEncoder().encode(JSON.stringify(checkpoints[idx]))),
            metadata: toBase64(new TextEncoder().encode(JSON.stringify({ source: "loop", step: idx, parents: {} }))),
            checkpoint_type: "json",
            metadata_type: "json",
          };
        }
        return null;
      });

      (client.scan as any).mockResolvedValue({
        cursor: "0",
        keys: Array.from({ length: 5 }, (_, i) => `checkpoint:thread-1::cp-${i}`),
      });

      (client.keys as any).mockResolvedValue([]); // No pending writes

      const results: any[] = [];
      for await (const tuple of saver.list(
        { configurable: { thread_id: "thread-1" } } as any,
        { limit: 3 }
      )) {
        results.push(tuple);
      }

      expect(results.length).toBe(3);
    });
  });

  describe("deleteThread", () => {
    it("should delete all keys matching pattern", async () => {
      const saver = new RedisSaver({ url: "redis://localhost:6379" });
      const client = saver.getClient();

      (client.scan as any).mockResolvedValue({
        cursor: "0",
        keys: [
          "checkpoint:thread-1::cp-1",
          "checkpoint:thread-1::cp-2",
          "checkpoint:thread-1::cp-1:write:task1:0",
        ],
      });

      await saver.deleteThread("thread-1");

      expect(client.del).toHaveBeenCalled();
      const delCall = (client.del as any).mock.calls[0];
      expect(delCall[0]).toHaveLength(3);
    });

    it("should not call del if no keys found", async () => {
      const saver = new RedisSaver({ url: "redis://localhost:6379" });
      const client = saver.getClient();

      (client.scan as any).mockResolvedValue({
        cursor: "0",
        keys: [],
      });

      await saver.deleteThread("nonexistent");

      expect(client.del).not.toHaveBeenCalled();
    });
  });
});
