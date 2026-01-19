/**
 * Redis-based checkpoint saver for LangGraph.
 * 
 * Implements BaseCheckpointSaver interface using Redis for persistence.
 * Fixes the serialization bugs in @langchain/langgraph-checkpoint-redis by
 * properly using serde.dumpsTyped() on write and serde.loadsTyped() on read.
 */

import { createClient, RedisClientType } from "redis";
import {
  Checkpoint,
  CheckpointTuple,
  CheckpointMetadata,
  BaseCheckpointSaver,
  ChannelVersions,
  CheckpointListOptions,
  PendingWrite,
} from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";
import { dumpsTyped, loadsTyped, isUnserialized, deserializeUnserialized } from "./serde.js";
import { parseCheckpointKey, formatCheckpointKey, toStorageSafeId, toStorageSafeNs } from "./redis-key.js";
import type { RedisSaverConfig } from "./types.js";
import { logger } from '@/lib/logging/logger';

/**
 * Convert Uint8Array to a JSON-compatible value for Redis storage.
 * Redis JSON doesn't support raw Uint8Array, so we convert to base64 string.
 */
function bufferToJsonValue(buffer: Uint8Array): string {
  // Use Buffer for proper base64 encoding in Node.js
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

/**
 * Convert base64 string back to Uint8Array after reading from Redis.
 */
function jsonValueToBuffer(base64: string): Uint8Array {
  // Use Buffer for proper base64 decoding in Node.js
  if (typeof Buffer !== "undefined") {
    return Buffer.from(base64, "base64");
  }
  // Fallback for browser environments
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * RedisSaver implements BaseCheckpointSaver for Redis persistence.
 * 
 * Key features:
 * - Proper serialization using dumpsTyped/loadsTyped (fixes the main bug)
 * - Escaped delimiters in namespace to prevent key parsing errors
 * - TTL support for automatic checkpoint expiration
 * - Backward compatibility with buggy library's data format
 */
export class RedisSaver extends BaseCheckpointSaver {
  private client: RedisClientType;
  private url?: string;
  private namespace: string;
  private ttl?: number;

  constructor(config: RedisSaverConfig = {}) {
    super(undefined);
    this.url = config.url;
    this.namespace = config.namespace || "checkpoint";
    this.ttl = config.ttl;
    this.client = config.client || createClient({ url: config.url });
  }

  static async fromUrl(url: string, config: Omit<RedisSaverConfig, "url"> = {}): Promise<RedisSaver> {
    const saver = new RedisSaver({ ...config, url });
    await saver.connect();
    return saver;
  }

  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
    await this.client.ping();
  }

  async close(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  getClient(): RedisClientType {
    return this.client;
  }

  /**
   * Async generator that uses SCAN to iterate over keys matching a pattern.
   * This is a non-blocking alternative to KEYS command.
   */
  async *scanKeys(pattern: string): AsyncGenerator<string> {
    let cursor = "0";
    do {
      const result = await this.client.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      for (const key of result.keys) {
        yield key;
      }
    } while (cursor !== "0");
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: ChannelVersions
  ): Promise<RunnableConfig> {
    const threadId = (config.configurable as Record<string, string>).thread_id;
    if (!threadId) {
      throw new Error("thread_id is required for put");
    }
    const checkpointNs = (config.configurable as Record<string, string>).checkpoint_ns || "";
    const checkpointId = checkpoint.id;

    const key = formatCheckpointKey(threadId, checkpointNs, checkpointId);

    const [[checkpointType, serializedCheckpoint], [metadataType, serializedMetadata]] =
      await Promise.all([
        dumpsTyped(checkpoint),
        dumpsTyped(metadata),
      ]);

    const metadataObj = metadata as Record<string, unknown>;
    const source = metadataObj.source as string | undefined;
    const step = metadataObj.step as number | undefined;

    await this.client.json.set(key, "$", {
      thread_id: threadId,
      checkpoint_ns: checkpointNs,
      checkpoint_id: checkpointId,
      checkpoint: bufferToJsonValue(serializedCheckpoint),
      metadata: bufferToJsonValue(serializedMetadata),
      checkpoint_type: checkpointType,
      metadata_type: metadataType,
      checkpoint_ts: new Date(checkpoint.ts).getTime(),
      has_writes: "false",
      source,
      step,
    } as any);

    if (this.ttl !== undefined && this.ttl > 0) {
      await this.client.expire(key, this.ttl);
    }

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpointId,
      },
    };
  }

  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    const threadId = (config.configurable as Record<string, string>).thread_id;
    const checkpointNs = (config.configurable as Record<string, string>).checkpoint_ns || "";
    const checkpointId = (config.configurable as Record<string, string>).checkpoint_id;

    if (!checkpointId) {
      throw new Error("checkpoint_id is required for putWrites");
    }

    const key = formatCheckpointKey(threadId, checkpointNs, checkpointId);
    
    for (const [idx, [channel, value]] of writes.entries()) {
      const [valueType, serializedValue] = await dumpsTyped(value);
      
      const writeKey = `${key}:write:${taskId}:${idx}`;
      await this.client.json.set(writeKey, "$", {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpointId,
        task_id: taskId,
        idx,
        channel,
        value: bufferToJsonValue(serializedValue),
        value_type: valueType,
        timestamp: Date.now(),
        global_idx: idx,
      } as any);

      if (this.ttl !== undefined && this.ttl > 0) {
        await this.client.expire(writeKey, this.ttl);
      }
    }

    await this.client.json.set(key, "$.has_writes", "true");
  }

  async get(config: RunnableConfig): Promise<Checkpoint | undefined> {
    const tuple = await this.getTuple(config);
    return tuple?.checkpoint;
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = (config.configurable as Record<string, string>).thread_id;
    const checkpointNs = (config.configurable as Record<string, string>).checkpoint_ns || "";
    const checkpointId = (config.configurable as Record<string, string>).checkpoint_id;

    if (!checkpointId) {
      const latestKey = await this.getLatestCheckpointKey(threadId, checkpointNs);
      if (!latestKey) {
        return undefined;
      }
      return this.loadCheckpointTuple(latestKey);
    }

    const key = formatCheckpointKey(threadId, checkpointNs, checkpointId);
    return this.loadCheckpointTuple(key);
  }

  async *list(config: RunnableConfig, options?: CheckpointListOptions): AsyncGenerator<CheckpointTuple> {
    const threadId = (config.configurable as Record<string, string>).thread_id;
    const checkpointNs = (config.configurable as Record<string, string>).checkpoint_ns || "";

    const pattern = `checkpoint:${toStorageSafeId(threadId)}:*`;
    const keys: string[] = [];
    for await (const k of this.scanKeys(pattern)) {
      keys.push(k);
    }

    const tuples: CheckpointTuple[] = [];
    for (const key of keys) {
      if (key.includes(":write:")) {
        continue;
      }

      if (checkpointNs && !key.includes(`:${toStorageSafeNs(checkpointNs)}:`)) {
        continue;
      }

      const tuple = await this.loadCheckpointTuple(key);
      if (tuple) {
        tuples.push(tuple);
      }
    }

    let filtered = tuples;
    if (options?.before) {
      const beforeId = (options.before.configurable as Record<string, string>).checkpoint_id;
      filtered = tuples.filter(t => t.checkpoint.id !== beforeId);
    }

    const limit = options?.limit ?? Infinity;
    const sorted = filtered
      .sort((a, b) => {
        const tsA = new Date(a.checkpoint.ts).getTime();
        const tsB = new Date(b.checkpoint.ts).getTime();
        return tsB - tsA;
      })
      .slice(0, limit);

    for (const tuple of sorted) {
      yield tuple;
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    const pattern = `checkpoint:${toStorageSafeId(threadId)}:*`;
    const keys: string[] = [];
    for await (const k of this.scanKeys(pattern)) {
      keys.push(k);
    }
    
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }

  private async getLatestCheckpointKey(threadId: string, checkpointNs: string): Promise<string | null> {
    const pattern = `checkpoint:${toStorageSafeId(threadId)}:${toStorageSafeNs(checkpointNs)}:*`;
    const keys = await this.client.keys(pattern);

    if (keys.length === 0) {
      return null;
    }

    let latestKey: string | null = null;
    let latestTs = 0;

    for (const key of keys) {
      if (key.includes(":write:")) {
        continue;
      }
      try {
        const parsed = parseCheckpointKey(key);
        const ts = parseCheckpointTimestamp(parsed.checkpointId);
        if (ts > latestTs) {
          latestTs = ts;
          latestKey = key;
        }
      } catch {
        continue;
      }
    }

    return latestKey;
  }

  private async loadCheckpointTuple(key: string): Promise<CheckpointTuple | undefined> {
    const data = await this.client.json.get(key) as Record<string, unknown> | null;
    if (!data) {
      return undefined;
    }

    try {
      const parsed = parseCheckpointKey(key);

      let checkpoint: Checkpoint;
      let metadata: CheckpointMetadata;

      const checkpointFieldStr = data.checkpoint as string;
      const metadataFieldStr = data.metadata as string;
      const checkpointType = data.checkpoint_type as string;
      const metadataType = data.metadata_type as string;

      if (checkpointType && checkpointFieldStr) {
        checkpoint = await loadsTyped<Checkpoint>(
          checkpointType,
          jsonValueToBuffer(checkpointFieldStr)
        );
      } else if (isUnserialized(checkpointFieldStr)) {
        checkpoint = await deserializeUnserialized<Checkpoint>(
          checkpointFieldStr as unknown as Record<string, unknown>
        );
      } else {
        throw new Error("Unknown checkpoint format");
      }

      if (metadataType && metadataFieldStr) {
        metadata = await loadsTyped<CheckpointMetadata>(
          metadataType,
          jsonValueToBuffer(metadataFieldStr)
        );
      } else if (isUnserialized(metadataFieldStr)) {
        metadata = await deserializeUnserialized<CheckpointMetadata>(
          metadataFieldStr as unknown as Record<string, unknown>
        );
      } else {
        throw new Error("Unknown metadata format");
      }

      const pendingWrites = await this.getPendingWritesFromKey(key, parsed.threadId, parsed.checkpointNs, parsed.checkpointId);

      return {
        checkpoint,
        metadata,
        pendingWrites,
        config: {
          configurable: {
            thread_id: parsed.threadId,
            checkpoint_ns: parsed.checkpointNs,
            checkpoint_id: parsed.checkpointId,
          },
        },
      };
    } catch (error) {
      logger.error({ key, error: (error as Error).message }, 'Error loading checkpoint');
      return undefined;
    }
  }

  private async getPendingWritesFromKey(
    key: string,
    threadId: string,
    checkpointNs: string,
    checkpointId: string
  ): Promise<CheckpointTuple["pendingWrites"]> {
    const pattern = `${key}:write:*`;
    const writeKeys = await this.client.keys(pattern);

    const writes: Array<[string, string, unknown]> = [];
    for (const writeKey of writeKeys.sort((a, b) => {
      const idxA = parseInt(a.split(":").pop()!, 10);
      const idxB = parseInt(b.split(":").pop()!, 10);
      return idxA - idxB;
    })) {
      const writeData = await this.client.json.get(writeKey) as Record<string, unknown> | null;
      if (writeData) {
        try {
          const valueStr = writeData.value as string;
          const value = await loadsTyped(
            writeData.value_type as string,
            jsonValueToBuffer(valueStr)
          );
          writes.push([
            writeData.task_id as string,
            writeData.channel as string,
            value,
          ]);
        } catch (error) {
          logger.error({ taskId: writeData.task_id, writeKey, error: (error as Error).message }, 'Failed to deserialize pending write');
          // Continue to next entry - corrupted entries should not abort loading all pending writes
        }
      }
    }

    return writes.length > 0 ? writes : undefined;
  }
}

function parseCheckpointTimestamp(checkpointId: string): number {
  try {
    if (/^[0-9a-f]{8}/i.test(checkpointId)) {
      return parseInt(checkpointId.substring(0, 8), 16);
    }
    return new Date(checkpointId).getTime();
  } catch {
    return 0;
  }
}

export async function createRedisSaver(config: RedisSaverConfig = {}): Promise<RedisSaver> {
  const saver = new RedisSaver(config);
  await saver.connect();
  return saver;
}
