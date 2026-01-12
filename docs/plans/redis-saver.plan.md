# RedisSaver Implementation Plan

## Overview

Create a corrected RedisSaver implementation in the Bernard repository that fixes the known bugs in `@langchain/langgraph-checkpoint-redis` that cause read/write mismatch failures.

## Current State Analysis

### Existing Implementation
- **Location**: `core/src/agents/bernard/bernard.agent.ts`
- **Current Usage**: Lines 3, 38 import and instantiate `RedisSaver` from `@langchain/langgraph-checkpoint-redis`
- **Pattern**: `await RedisSaver.fromUrl(redisUrl)` initialized with Redis URL from settings
- **Dependencies**: Already has `@langchain/langgraph-checkpoint-redis` installed in `core/`

### No Custom Checkpoint Code
- No existing custom checkpoint implementation
- Direct dependency on the buggy library
- All checkpoint logic delegated to the external library

## Bug Analysis

### Bug #1: Missing Serialization on Write (THE PRIMARY BUG)
**Source**: GitHub Issue #5074, GitHub langchain-ai/langgraphjs repository

**Root Cause**: The `@langchain/langgraph-checkpoint-redis` library has a **systematic asymmetry** between how it writes and reads checkpoints:

| Operation | RedisSaver Does | Other Savers (SQLite, PostgreSQL) Do |
|-----------|-----------------|-------------------------------------|
| **Write checkpoint** | Stores raw JSON object | `serde.dumpsTyped()` → special serialized format |
| **Write writes** | Stores raw JSON object | `serde.dumpsTyped()` → special serialized format |
| **Read checkpoint** | `serde.loadsTyped()` → expects special format | `serde.loadsTyped()` ✓ |
| **Read writes** | `serde.loadsTyped()` → expects special format | `serde.loadsTyped()` ✓ |

**Evidence from source** (`libs/checkpoint-redis/src/index.ts`):

**Write Path (Line 232)**:
```typescript
// Current (WRONG):
await this.client.json.set(key, "$", jsonDoc as any);
// jsonDoc.checkpoint is stored as raw object, NOT serialized
```

**Read Path (Lines 749-753)**:
```typescript
// Current (expects serialized format):
const checkpoint: Checkpoint = await this.serde.loadsTyped(
  "json",
  JSON.stringify(jsonDoc.checkpoint)  // ← Double stringify!
);
```

**Other savers (SQLite, Line 435-436)**:
```typescript
// Correct approach:
const [[type1, serializedCheckpoint], [type2, serializedMetadata]] =
  await Promise.all([
    this.serde.dumpsTyped(preparedCheckpoint),  // ✅ USES dumpsTyped
    this.serde.dumpsTyped(metadata),         // ✅ USES dumpsTyped
  ]);
```

### Impact of Missing Serialization

1. **MESSAGE_COERCION_FAILURE**
   - When `HumanMessage` objects are stored:
     - **Write**: Stores `{lc: 1, type: 'constructor', id: [...], kwargs: {...}}` as raw JSON
     - **Read**: `serde.loadsTyped()` expects `lc: 2` format, not `lc: 1`
     - **Result**: Objects remain in "constructor" format, not deserialized to `HumanMessage` instances
   - **Error**: `Message dict must contain 'role' and 'content' keys`

2. **Type Corruption**
   - `Set`, `Map`, `RegExp`, `Error` objects not properly serialized
   - Custom LangChain objects lose their prototype chain
   - Complex nested objects fail to round-trip

### Bug #2: Key Parsing Error
**Source**: GitHub Issue #2712

**Issue**:
- **Write**: Stores checkpoint keys with format: `checkpoint:{thread_id}:{checkpoint_ns}:{checkpoint_id}`
- **Read**: Parses key by splitting on `:` expecting exactly 4 parts
- **Result**: When `checkpoint_ns` contains `:` characters, split produces 5+ parts
- **Error**: `ValueError: too many values to unpack (expected 4)`

### Bug #3: RediSearch Field Query Issues
From the Python library research (Issue #5074):

1. **Wrong Field Name**
   - Uses `"blob"` instead of `"$.blob"` in RediSearch query
   - Causes `AttributeError: 'Document' object has no attribute 'blob'`

2. **Wrong Data Type**
   - Returns string instead of bytes for `type` field
   - Downstream expects bytes and calls `.decode()`
   - Causes `AttributeError: 'str' object has no attribute 'decode'`

## Implementation Approach

### Strategy
Create a custom RedisSaver class that:
1. **Fixes the primary serialization bug**: Use `serde.dumpsTyped()` on write, `serde.loadsTyped()` on read
2. **Maintains full compatibility** with LangGraph's CheckpointSaver interface
3. **Preserves existing data** - can read checkpoints written by the buggy library (with degraded functionality)
4. **Uses same Redis infrastructure** - same keys, indices, and data structures
5. **Properly escapes delimiters** in namespace to prevent key parsing errors

### Key Design Decisions

#### 1. Serialization/Deserialization (CRITICAL FIX)
The most important fix - match other savers:

```typescript
// Write: Use serde.dumpsTyped() like other savers
const [[checkpointType, serializedCheckpoint], [metadataType, serializedMetadata]] =
  await Promise.all([
    this.serde.dumpsTyped(checkpoint),
    this.serde.dumpsTyped(metadata),
  ]);

// Store with type information
await this.client.json.set(key, "$", {
  thread_id,
  checkpoint_ns,
  checkpoint_id,
  parent_checkpoint_id,
  checkpoint: serializedCheckpoint,      // Serialized!
  metadata: serializedMetadata,           // Serialized!
  checkpoint_type: checkpointType,        // "json" or "bytes"
  metadata_type: metadataType,
  checkpoint_ts: Date.now(),
  has_writes: pendingWrites.length > 0 ? "true" : "false",
});

// Read: Use serde.loadsTyped() with type info
const checkpoint: Checkpoint = await this.serde.loadsTyped(
  doc.checkpoint_type ?? "json",
  doc.checkpoint
);
```

#### 2. Key Format
Use delimiter-safe format for checkpoint keys:
```
checkpoint:{thread_id}:{checkpoint_ns}:{checkpoint_id}
```
Where `{checkpoint_ns}` has `:` escaped to prevent parsing issues.

#### 3. Write Values Serialization
Same pattern for pending writes:
```typescript
const [valueType, serializedValue] = await this.serde.dumpsTyped(value);
await this.client.json.set(writeKey, "$", {
  thread_id,
  checkpoint_ns,
  checkpoint_id,
  task_id,
  idx,
  channel,
  value: serializedValue,  // Serialized!
  value_type: valueType,   // Type info
  timestamp: Date.now(),
});
```

#### 4. RediSearch Field Names
Use JSON path syntax consistently:
- Store: `$.value` as JSON field
- Query: Return `$.value` in result fields

## File Structure

```
core/src/
├── lib/
│   └── checkpoint/
│       ├── index.ts              # Barrel export
│       ├── types.ts              # TypeScript interfaces
│       ├── redis-saver.ts        # Main RedisSaver implementation
│       ├── redis-key.ts          # Key parsing/formatting utilities
│       ├── redis-schema.ts       # Redis index schema setup
│       └── redis-serde.ts        # Serialization/deserialization
└── agents/bernard/
    └── bernard.agent.ts          # Updated to use custom RedisSaver
```

## Detailed Implementation

### Phase 1: Core Types and Dependencies

#### File: `core/src/lib/checkpoint/types.ts`

```typescript
import type { Checkpoint, CheckpointTuple, BaseCheckpointSaver, CheckpointMetadata } from "@langchain/langgraph-checkpoint";
import type { JsonData } from "./redis-serde";

export interface RedisSaverConfig {
  url?: string;
  client?: RedisClientType;
  namespace?: string;
  ttl?: number; // TTL in seconds, -1 for no expiry
}

export interface CheckpointKey {
  namespace: string;
  threadId: string;
  checkpointNs: string;
  checkpointId: string;
}

export interface SerializedCheckpoint {
  checkpoint: Uint8Array;     // Serialized via serde.dumpsTyped()
  metadata: Uint8Array;       // Serialized via serde.dumpsTyped()
  pendingWrites: Array<[string, Uint8Array]>; // [channel, serialized_value]
}

export interface RedisCheckpointDoc {
  thread_id: string;
  checkpoint_ns: string;
  checkpoint_id: string;
  parent_checkpoint_id: string | null;
  checkpoint: Uint8Array;     // Serialized checkpoint data
  metadata: Uint8Array;       // Serialized metadata
  checkpoint_type: string;    // "json" or "bytes"
  metadata_type: string;      // "json" or "bytes"
  checkpoint_ts: number;
  has_writes: string;         // "true" or "false"
  source?: string;            // For RediSearch indexing
  step?: number;              // For RediSearch indexing
}

export interface RedisWriteDoc {
  thread_id: string;
  checkpoint_ns: string;
  checkpoint_id: string;
  task_id: string;
  idx: number;
  channel: string;
  value: Uint8Array;          // Serialized value
  value_type: string;         // "json" or "bytes"
  timestamp: number;
  global_idx: number;
}
```

#### File: `core/src/lib/checkpoint/serde.ts`

**CRITICAL**: This is where we replicate LangGraph's serialization logic.

```typescript
import { JsonPlusSerializer } from "@langchain/langgraph-checkpoint/serde/jsonplus";

/**
 * Replicate LangGraph's JsonPlusSerializer for consistent serialization.
 * This ensures checkpoints written by our RedisSaver can be read back correctly.
 */
export const serde = new JsonPlusSerializer();

/**
 * Serialize a value using LangGraph's serde.
 * Returns [type, serialized_data] tuple matching dumpsTyped() output.
 */
export async function dumpsTyped<T>(obj: T): Promise<[string, Uint8Array]> {
  return await serde.dumpsTyped(obj) as [string, Uint8Array];
}

/**
 * Deserialize a value using LangGraph's serde.
 * Takes type and serialized data, returns original object.
 */
export async function loadsTyped<T>(type: string, data: Uint8Array | string): Promise<T> {
  return await serde.loadsTyped(type, data) as T;
}

/**
 * Check if data appears to be in the old unserialized format.
 * Used for backward compatibility with buggy library's data.
 */
export function isUnserialized(data: unknown): boolean {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  // Check for unserialized format: has lc, type, id, kwargs fields
  return "lc" in obj && "type" in obj && "id" in obj && "kwargs" in obj;
}
```

#### File: `core/src/lib/checkpoint/redis-key.ts`

```typescript
import { toStorageSafeId } from "./utils";

/**
 * Parse a Redis checkpoint key into its components.
 * Handles escaped delimiters in namespace.
 * 
 * @param key - Full Redis key like "checkpoint:thread-123::checkpoint-abc"
 * @returns CheckpointKey object
 */
export function parseCheckpointKey(key: string): CheckpointKey {
  // Key format: checkpoint:{thread_id}:{checkpoint_ns}:{checkpoint_id}
  // checkpoint_ns may contain escaped colons
  const parts = key.split(":");
  if (parts.length < 4) {
    throw new Error(`Invalid checkpoint key format: ${key}`);
  }
  
  const namespace = parts[0]; // "checkpoint"
  const threadId = parts[1];
  // Checkpoint_ns is everything between threadId and checkpointId
  const checkpointId = parts[parts.length - 1];
  const checkpointNs = parts.slice(2, -1).join(":");
  
  return {
    namespace,
    threadId: fromStorageSafeId(threadId),
    checkpointNs: fromStorageSafeNs(checkpointNs),
    checkpointId: fromStorageSafeId(checkpointId),
  };
}

/**
 * Format checkpoint components into a Redis key.
 * Escapes colons in checkpoint_ns to prevent parsing issues.
 * 
 * @param threadId - Thread identifier
 * @param checkpointNs - Checkpoint namespace (may contain special chars)
 * @param checkpointId - Checkpoint identifier
 * @returns Formatted Redis key
 */
export function formatCheckpointKey(
  threadId: string,
  checkpointNs: string,
  checkpointId: string
): string {
  // Escape colons in checkpoint_ns
  const escapedNs = checkpointNs.replace(/:/g, "\\:");
  return `checkpoint:${toStorageSafeId(threadId)}:${escapedNs}:${toStorageSafeId(checkpointId)}`;
}

/**
 * Convert to storage-safe string for IDs (thread_id, checkpoint_id).
 * Handles special characters like colons and backslashes.
 */
export function toStorageSafeId(id: string): string {
  return id.replace(/[:\\]/g, "\\");
}

/**
 * Convert from storage-safe string for IDs.
 */
export function fromStorageSafeId(id: string): string {
  return id.replace(/\\([:\\])/g, "$1");
}

/**
 * Convert to storage-safe string for namespaces.
 * Namespaces can contain colons but we escape them for key parsing.
 */
export function toStorageSafeNs(ns: string): string {
  return ns.replace(/:/g, "\\:");
}

/**
 * Convert from storage-safe string for namespaces.
 */
export function fromStorageSafeNs(ns: string): string {
  return ns.replace(/\\:/g, ":");
}
```

### Phase 2: Serialization/Deserialization

#### File: `core/src/lib/checkpoint/redis-serde.ts`

```typescript
import type { Checkpoint, CheckpointMetadata } from "@langchain/langgraph-checkpoint";
import type { SerializedCheckpoint } from "./types";

/**
 * Serialize checkpoint for Redis storage.
 * Converts complex objects to storable format.
 */
export function serializeCheckpoint(
  checkpoint: Checkpoint,
  metadata: CheckpointMetadata,
  pendingWrites: Array<[string, unknown]>
): SerializedCheckpoint {
  return {
    checkpoint,
    metadata,
    pendingWrites: pendingWrites.map(([channel, value]) => [
      channel,
      serializeValue(value),
    ]),
  };
}

/**
 * Deserialize checkpoint from Redis storage.
 */
export function deserializeCheckpoint(data: SerializedCheckpoint): {
  checkpoint: Checkpoint;
  metadata: CheckpointMetadata;
  pendingWrites: Array<[string, unknown]>;
} {
  return {
    checkpoint: data.checkpoint,
    metadata: data.metadata,
    pendingWrites: data.pendingWrites.map(([channel, value]) => [
      channel,
      deserializeValue(value),
    ]),
  };
}

/**
 * Serialize a value for Redis storage.
 * - Buffers → Base64 string
 * - Objects → JSON string
 * - Arrays → JSON string
 * - Primitives → as-is (with type tag for deserialization)
 */
function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  
  if (Buffer.isBuffer(value)) {
    return {
      __type__: "buffer",
      __data__: value.toString("base64"),
    };
  }
  
  if (typeof value === "object") {
    return {
      __type__: "json",
      __data__: JSON.stringify(value),
    };
  }
  
  // Primitive types: string, number, boolean
  return value;
}

/**
 * Deserialize a value from Redis storage.
 */
function deserializeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  
  if (typeof value === "object" && value !== null) {
    const typed = value as { __type__?: string; __data__?: string };
    
    if (typed.__type__ === "buffer" && typeof typed.__data__ === "string") {
      return Buffer.from(typed.__data__, "base64");
    }
    
    if (typed.__type__ === "json" && typeof typed.__data__ === "string") {
      return JSON.parse(typed.__data__);
    }
  }
  
  return value;
}

/**
 * Serialize for RediSearch JSON storage.
 * Returns bytes for the blob field.
 */
export function serializeForBlob(value: unknown): Buffer {
  const serialized = serializeCheckpointData(value);
  return Buffer.from(JSON.stringify(serialized), "utf-8");
}

/**
 * Deserialize from RediSearch JSON blob.
 */
export function deserializeFromBlob(buffer: Buffer): unknown {
  const data = JSON.parse(buffer.toString("utf-8"));
  return deserializeCheckpointData(data);
}

function serializeCheckpointData(value: unknown): unknown {
  // Simplified serialization for checkpoint data
  return value;
}

function deserializeCheckpointData(data: unknown): unknown {
  return data;
}
```

### Phase 2: Main RedisSaver Implementation

#### File: `core/src/lib/checkpoint/redis-saver.ts`

```typescript
import { createClient, RedisClientType } from "redis";
import type {
  Checkpoint,
  CheckpointTuple,
  CheckpointMetadata,
  BaseCheckpointSaver,
} from "@langchain/langgraph-checkpoint";
import { dumpsTyped, loadsTyped, isUnserialized } from "./serde";
import { parseCheckpointKey, formatCheckpointKey, toStorageSafeId, fromStorageSafeId } from "./redis-key";
import type { RedisSaverConfig, RedisCheckpointDoc, RedisWriteDoc } from "./types";

export class RedisSaver implements BaseCheckpointSaver {
  private client: RedisClientType;
  private url?: string;
  private namespace: string;
  private ttl?: number;

  constructor(config: RedisSaverConfig = {}) {
    this.url = config.url;
    this.namespace = config.namespace || "checkpoint";
    this.ttl = config.ttl;
    this.client = config.client || createClient({ url: config.url });
  }

  /**
   * Create RedisSaver from connection URL.
   */
  static async fromUrl(url: string, config: Omit<RedisSaverConfig, "url"> = {}): Promise<RedisSaver> {
    const saver = new RedisSaver({ ...config, url });
    await saver.connect();
    return saver;
  }

  /**
   * Connect to Redis and verify connection.
   */
  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
    await this.client.ping();
  }

  /**
   * Close Redis connection.
   */
  async close(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  /**
   * Get the Redis client (for advanced usage).
   */
  getClient(): RedisClientType {
    return this.client;
  }

  /**
   * Store a checkpoint.
   * 
   * CRITICAL FIX: Use serde.dumpsTyped() like other savers (SQLite, PostgreSQL)
   * instead of storing raw objects. This ensures proper deserialization on read.
   */
  async put(
    config: { configurable: { thread_id: string; checkpoint_ns?: string; checkpoint_id?: string } },
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    pendingWrites: Array<[string, unknown]>
  ): Promise<{ configurable: { thread_id: string; checkpoint_ns: string; checkpoint_id: string } }> {
    const threadId = config.configurable.thread_id;
    const checkpointNs = config.configurable.checkpoint_ns || "";
    const checkpointId = checkpoint.id;

    const key = formatCheckpointKey(threadId, checkpointNs, checkpointId);

    // CRITICAL FIX: Serialize checkpoint and metadata using serde
    // This matches the behavior of SQLiteSaver, PostgreSQLSaver, etc.
    const [[checkpointType, serializedCheckpoint], [metadataType, serializedMetadata]] =
      await Promise.all([
        dumpsTyped(checkpoint),
        dumpsTyped(metadata),
      ]);

    // Store main checkpoint data
    await this.client.json.set(key, "$", {
      thread_id: threadId,
      checkpoint_ns: checkpointNs,
      checkpoint_id: checkpointId,
      parent_checkpoint_id: checkpoint.parent_checkpoint_id ?? null,
      checkpoint: serializedCheckpoint,
      metadata: serializedMetadata,
      checkpoint_type: checkpointType,
      metadata_type: metadataType,
      checkpoint_ts: new Date(checkpoint.ts).getTime(),
      has_writes: pendingWrites.length > 0 ? "true" : "false",
      source: (metadata as Record<string, unknown>).source as string | undefined,
      step: (metadata as Record<string, unknown>).step as number | undefined,
    } as RedisCheckpointDoc);

    // Store pending writes in separate keys
    if (pendingWrites.length > 0) {
      await this.putPendingWrites(key, pendingWrites);
    }

    // Apply TTL if configured
    if (this.ttl !== undefined && this.ttl > 0) {
      await this.client.expire(key, this.ttl);
      // TTL for pending writes handled in putPendingWrites
    }

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpointId,
      },
    };
  }

  /**
   * Store pending writes for a checkpoint.
   */
  private async putPendingWrites(checkpointKey: string, writes: Array<[string, unknown]>): Promise<void> {
    for (const [idx, [channel, value]] of writes.entries()) {
      const [valueType, serializedValue] = await dumpsTyped(value);
      
      const writeKey = `${checkpointKey}:write:${idx}`;
      await this.client.json.set(writeKey, "$", {
        thread_id: fromStorageSafeId(checkpointKey.split(":")[1]),
        checkpoint_ns: this.parseNsFromKey(checkpointKey),
        checkpoint_id: checkpointKey.split(":").pop()!,
        task_id: "", // Will be filled by caller
        idx,
        channel,
        value: serializedValue,
        value_type: valueType,
        timestamp: Date.now(),
        global_idx: idx,
      } as RedisWriteDoc);

      // Apply TTL
      if (this.ttl !== undefined && this.ttl > 0) {
        await this.client.expire(writeKey, this.ttl);
      }
    }
  }

  /**
   * Retrieve a checkpoint.
   * 
   * CRITICAL FIX: Use serde.loadsTyped() with type info from stored document.
   */
  async get(
    config: { configurable: { thread_id: string; checkpoint_ns?: string; checkpoint_id?: string } }
  ): Promise<CheckpointTuple | null> {
    const threadId = config.configurable.thread_id;
    const checkpointNs = config.configurable.checkpoint_ns || "";
    const checkpointId = config.configurable.checkpoint_id;

    if (!checkpointId) {
      // Get latest checkpoint for thread/ns
      const latestKey = await this.getLatestCheckpointKey(threadId, checkpointNs);
      if (!latestKey) {
        return null;
      }
      return this.loadCheckpointTuple(latestKey);
    }

    const key = formatCheckpointKey(threadId, checkpointNs, checkpointId);
    return this.loadCheckpointTuple(key);
  }

  /**
   * List all checkpoints for a thread.
   */
  async list(
    config: { configurable: { thread_id: string; checkpoint_ns?: string } }
  ): Promise<CheckpointTuple[]> {
    const threadId = config.configurable.thread_id;
    const checkpointNs = config.configurable.checkpoint_ns || "";

    // List all checkpoint keys for this thread
    const pattern = `checkpoint:${toStorageSafeId(threadId)}:*`;
    const keys = await this.client.keys(pattern);

    const tuples: CheckpointTuple[] = [];
    for (const key of keys) {
      // Skip non-checkpoint keys (pending writes)
      if (key.includes(":write:")) {
        continue;
      }

      // Filter by namespace if specified
      if (checkpointNs && !key.includes(`:${toStorageSafeNs(checkpointNs)}:`)) {
        continue;
      }

      const tuple = await this.loadCheckpointTuple(key);
      if (tuple) {
        tuples.push(tuple);
      }
    }

    // Sort by checkpoint timestamp descending
    tuples.sort((a, b) => {
      const tsA = new Date(a.checkpoint.ts).getTime();
      const tsB = new Date(b.checkpoint.ts).getTime();
      return tsB - tsA;
    });

    return tuples;
  }

  /**
   * Get pending writes for a checkpoint.
   */
  async getPendingWrites(
    config: { configurable: { thread_id: string; checkpoint_ns?: string; checkpoint_id: string } }
  ): Promise<Array<[string, unknown]>> {
    const threadId = config.configurable.thread_id;
    const checkpointNs = config.configurable.checkpoint_ns || "";
    const checkpointId = config.configurable.checkpoint_id;

    const key = formatCheckpointKey(threadId, checkpointNs, checkpointId);
    const pattern = `${key}:write:*`;
    const writeKeys = await this.client.keys(pattern);

    const writes: Array<[string, unknown]> = [];
    for (const writeKey of writeKeys.sort((a, b) => {
      // Sort by index in key
      const idxA = parseInt(a.split(":").pop()!, 10);
      const idxB = parseInt(b.split(":").pop()!, 10);
      return idxA - idxB;
    })) {
      const writeData = await this.client.json.get(writeKey) as RedisWriteDoc;
      if (writeData) {
        const value = await loadsTyped(writeData.value_type, writeData.value);
        writes.push([writeData.channel, value]);
      }
    }

    return writes;
  }

  /**
   * Delete all checkpoints for a thread.
   */
  async deleteThread(threadId: string): Promise<void> {
    const pattern = `checkpoint:${toStorageSafeId(threadId)}:*`;
    const keys = await this.client.keys(pattern);
    
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }

  /**
   * Get the latest checkpoint key for a thread/ns.
   */
  private async getLatestCheckpointKey(threadId: string, checkpointNs: string): Promise<string | null> {
    const pattern = `checkpoint:${toStorageSafeId(threadId)}:${toStorageSafeNs(checkpointNs)}:*`;
    const keys = await this.client.keys(pattern);

    if (keys.length === 0) {
      return null;
    }

    // Find the latest by timestamp in the key
    let latestKey = keys[0];
    let latestTs = 0;

    for (const key of keys) {
      // Skip non-checkpoint keys
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
        // Invalid key format, skip
        continue;
      }
    }

    return latestKey;
  }

  /**
   * Load a checkpoint tuple from a Redis key.
   * 
   * CRITICAL: Properly deserialize using serde.loadsTyped() with type info.
   */
  private async loadCheckpointTuple(key: string): Promise<CheckpointTuple | null> {
    const data = await this.client.json.get(key) as RedisCheckpointDoc | null;
    if (!data) {
      return null;
    }

    try {
      const parsed = parseCheckpointKey(key);

      // CRITICAL FIX: Use type info from stored document
      const checkpoint = await loadsTyped<Checkpoint>(
        data.checkpoint_type ?? "json",
        data.checkpoint
      );

      const metadata = await loadsTyped<CheckpointMetadata>(
        data.metadata_type ?? "json",
        data.metadata
      );

      // Load pending writes
      const pendingWrites = await this.getPendingWrites({
        configurable: {
          thread_id: parsed.threadId,
          checkpoint_ns: parsed.checkpointNs,
          checkpoint_id: parsed.checkpointId,
        },
      });

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
      console.error(`Error loading checkpoint from ${key}:`, error);
      return null;
    }
  }

  /**
   * Parse namespace from checkpoint key.
   */
  private parseNsFromKey(key: string): string {
    const parts = key.split(":");
    if (parts.length < 4) {
      return "";
    }
    // checkpoint:{thread_id}:{checkpoint_ns}:{checkpoint_id}
    return parts.slice(2, -1).join(":").replace(/\\:/g, ":");
  }
}

// Helper functions
function toStorageSafeNs(ns: string): string {
  return ns.replace(/:/g, "\\:");
}

function parseCheckpointTimestamp(checkpointId: string): number {
  try {
    // Parse as ULID timestamp (first 6 chars = 48-bit timestamp)
    return parseInt(checkpointId.substring(0, 8), 16);
  } catch {
    return new Date(checkpointId).getTime();
  }
}

export async function createRedisSaver(config: RedisSaverConfig = {}): Promise<RedisSaver> {
  const saver = new RedisSaver(config);
  await saver.connect();
  return saver;
}
```

### Phase 4: Barrel Export

#### File: `core/src/lib/checkpoint/index.ts`

```typescript
export { RedisSaver, createRedisSaver } from "./redis-saver";
export * from "./types";
export * from "./redis-key";
export * from "./serde";
```

#### File: `core/src/lib/checkpoint/redis-key.ts`

```typescript
/**
 * Parse a Redis checkpoint key into its components.
 * Handles escaped delimiters in namespace.
 * 
 * @param key - Full Redis key like "checkpoint:thread-123::checkpoint-abc"
 * @returns CheckpointKey object
 */
export function parseCheckpointKey(key: string): CheckpointKey {
  const parts = key.split(":");
  if (parts.length < 4) {
    throw new Error(`Invalid checkpoint key format: ${key}`);
  }
  
  const namespace = parts[0];
  const threadId = fromStorageSafeId(parts[1]);
  const checkpointId = parts[parts.length - 1];
  const checkpointNs = fromStorageSafeNs(parts.slice(2, -1).join(":"));
  
  return { namespace, threadId, checkpointNs, checkpointId };
}

/**
 * Format checkpoint components into a Redis key.
 * Escapes colons in checkpoint_ns to prevent parsing issues.
 */
export function formatCheckpointKey(
  threadId: string,
  checkpointNs: string,
  checkpointId: string
): string {
  const escapedNs = checkpointNs.replace(/:/g, "\\:");
  return `checkpoint:${toStorageSafeId(threadId)}:${escapedNs}:${toStorageSafeId(checkpointId)}`;
}

/**
 * Convert to storage-safe string for IDs.
 */
export function toStorageSafeId(id: string): string {
  return id.replace(/[:\\]/g, "\\");
}

/**
 * Convert from storage-safe string for IDs.
 */
export function fromStorageSafeId(id: string): string {
  return id.replace(/\\([:\\])/g, "$1");
}

/**
 * Convert to storage-safe string for namespaces.
 */
export function toStorageSafeNs(ns: string): string {
  return ns.replace(/:/g, "\\:");
}

/**
 * Convert from storage-safe string for namespaces.
 */
export function fromStorageSafeNs(ns: string): string {
  return ns.replace(/\\:/g, ":");
}
```

### Phase 5: Update Bernard Agent

#### File: `core/src/agents/bernard/bernard.agent.ts`

```typescript
// BEFORE (buggy library):
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";

// AFTER (custom fixed implementation):
import { RedisSaver } from "@/lib/checkpoint";

// Update instantiation (line 38)
const redisUrl = settings.services?.infrastructure?.redisUrl ?? "redis://localhost:6379";
const checkpointer = await RedisSaver.fromUrl(redisUrl);
```

## Redis Data Format

### Checkpoint Key
```
checkpoint:{thread_id}:{checkpoint_ns}:{checkpoint_id}
```

**Example**:
```
checkpoint:thread-123::1ef4f797-8335-6428-8001-8a1503f9b875
```

### Checkpoint Value (Redis JSON)
```json
{
  "thread_id": "thread-123",
  "checkpoint_ns": "",
  "checkpoint_id": "1ef4f797-8335-6428-8001-8a1503f9b875",
  "parent_checkpoint_id": null,
  "checkpoint": "<Uint8Array from serde.dumpsTyped()>",
  "metadata": "<Uint8Array from serde.dumpsTyped()>",
  "checkpoint_type": "json",
  "metadata_type": "json",
  "checkpoint_ts": 1690848859804,
  "has_writes": "false",
  "source": "input",
  "step": 1
}
```

### Pending Write Keys
```
checkpoint:{thread_id}:{checkpoint_ns}:{checkpoint_id}:write:{idx}
```

**Example**:
```
checkpoint:thread-123::1ef4f797-8335-6428-8001-8a1503f9b875:write:0
```

### Pending Write Value (Redis JSON)
```json
{
  "thread_id": "thread-123",
  "checkpoint_ns": "",
  "checkpoint_id": "1ef4f797-8335-6428-8001-8a1503f9b875",
  "task_id": "task-abc",
  "idx": 0,
  "channel": "messages",
  "value": "<Uint8Array from serde.dumpsTyped()>",
  "value_type": "json",
  "timestamp": 1690848859805,
  "global_idx": 0
}
```

### Key Differences from Buggy Library

| Aspect | Buggy Library | Our Implementation |
|--------|--------------|-------------------|
| checkpoint field | Raw object | `serde.dumpsTyped()` output |
| metadata field | Raw object | `serde.dumpsTyped()` output |
| value field (writes) | Raw value | `serde.dumpsTyped()` output |
| Type information | None stored | Stored in `*_type` fields |
| Key parsing | Simple split | Escaped delimiters |

## Testing Strategy

### Unit Tests
1. **Serialization Tests** (CRITICAL)
   - Test that `dumpsTyped()` → `loadsTyped()` round-trip works for complex objects
   - Test `HumanMessage` objects (primary failure case)
   - Test `Set`, `Map`, `RegExp`, `Error` objects
   - Test nested objects with multiple levels

2. **Key Parsing Tests**
   - Round-trip: format → parse → format
   - Special characters in thread_id
   - Special characters in checkpoint_ns
   - Empty namespace handling
   - Namespaces containing colons

3. **Integration Tests**
   - Put/get cycle with serialized data
   - List checkpoints
   - Pending writes serialization
   - TTL behavior
   - Multiple threads and namespaces

### Test Files
```
core/src/lib/checkpoint/
├── __tests__/
│   ├── serde.test.ts          // Test serialization round-trips
│   ├── redis-key.test.ts      // Test key parsing/formatting
│   └── redis-saver.test.ts    // Full integration tests
```

### Critical Test Cases

```typescript
// Test 1: HumanMessage round-trip (the primary failure case)
test("should serialize and deserialize HumanMessage correctly", async () => {
  const message = new HumanMessage({ content: "Hello", additional_kwargs: { key: "value" } });
  const [type, serialized] = await dumpsTyped(message);
  const deserialized = await loadsTyped<HumanMessage>(type, serialized);
  
  expect(deserialized.content).toBe("Hello");
  expect(deserialized.additional_kwargs).toEqual({ key: "value" });
  expect(deserialized).toBeInstanceOf(HumanMessage);
});

// Test 2: Complex nested object
test("should serialize nested objects with special types", async () => {
  const obj = {
    messages: [new HumanMessage({ content: "Hi" })],
    data: new Map([["key", new Set([1, 2, 3])]]),
    regex: /test/gi,
  };
  
  const [type, serialized] = await dumpsTyped(obj);
  const deserialized = await loadsTyped<typeof obj>(type, serialized);
  
  expect(deserialized.messages[0]).toBeInstanceOf(HumanMessage);
  expect(deserialized.data.get("key")).toEqual(new Set([1, 2, 3]));
  expect(deserialized.regex.toString()).toBe("/test/gi");
});

// Test 3: Key with special characters
test("should handle colons in namespace", async () => {
  const threadId = "thread:123";
  const checkpointNs = "ns:with:colons";
  const checkpointId = "cp:456";
  
  const key = formatCheckpointKey(threadId, checkpointNs, checkpointId);
  const parsed = parseCheckpointKey(key);
  
  expect(parsed.threadId).toBe(threadId);
  expect(parsed.checkpointNs).toBe(checkpointNs);
  expect(parsed.checkpointId).toBe(checkpointId);
});
```

## Migration Plan

### Step 1: Create New Implementation
1. Create `core/src/lib/checkpoint/` directory structure
2. Implement types, utilities, and main class
3. Add comprehensive tests

### Step 2: Update Bernard Agent
1. Change import in `bernard.agent.ts`
2. Test with existing Redis data
3. Verify checkpoint functionality works

### Step 3: Backward Compatibility
1. The new implementation can read checkpoints written by the old library
2. Old implementation cannot read checkpoints written by new library (bug fix)
3. Consider migration script if existing data needs conversion

### Step 4: Documentation
1. Update AGENTS.md with new implementation details
2. Document the bug fixes
3. Add troubleshooting guide for common issues

## Success Criteria

- [ ] All checkpoints can be written and read back successfully
- [ ] Subgraph checkpoints load correctly with `get_state(..., subgraphs=True)`
- [ ] Checkpoint history loading works without key parsing errors
- [ ] HIL workflows resume correctly after interruption
- [ ] TTL behavior works as expected
- [ ] All tests pass with 100% coverage on new code
- [ ] No regressions in existing functionality

## Timeline Estimate

| Phase | Effort |
|-------|--------|
| Phase 1: Core Types & Utilities | 2-3 hours |
| Phase 2: Serialization/Deserialization | 1-2 hours |
| Phase 3: Main Implementation | 3-4 hours |
| Phase 4: Export & Integration | 30 minutes |
| Phase 5: Testing | 2-3 hours |
| **Total** | **8-12 hours** |

## References

- **Bug Source (Primary)**: GitHub Issue #5074 - AsyncRedisSaver._aload_pending_sends fails during HIL workflow resumption
- **Bug Source (Secondary)**: GitHub Issue #2712 - Get redis key split error on official document about the RedisSaver
- **Python Bug**: GitHub Issue #6393 - Read checkpoint_pending_writes from Redis
- **Message Coercion Failure**: LangChain Forum post about MESSAGE_COERCION_FAILURE Using Redis Checkpointer
- **LangGraph Source**: [langchain-ai/langgraphjs](https://github.com/langchain-ai/langgraphjs) repository
- **Package**: `@langchain/langgraph-checkpoint-redis@1.0.1`
- **Main File**: `libs/checkpoint-redis/src/index.ts` (958 lines)
- **Serialization Source**: `libs/checkpoint/src/serde/jsonplus.ts` - JsonPlusSerializer implementation
- **Other Saver References**:
  - SQLiteSaver: `libs/checkpoint-sqlite/src/index.ts`
  - PostgreSQLSaver: `libs/checkpoint-postgres/src/index.ts`
- **LangGraph Checkpoint Interface**: `@langchain/langgraph-checkpoint` types
- **Redis Client**: `redis` npm package (v5+)
- **RediSearch**: Used for complex queries (if needed)

## Key Code References

| File | Line | Relevance |
|------|------|-----------|
| `libs/checkpoint-redis/src/index.ts` | 232 | Bug: Missing serde.dumpsTyped() on write |
| `libs/checkpoint-redis/src/index.ts` | 749-753 | Bug: serde.loadsTyped() expects serialized format |
| `libs/checkpoint-redis/src/index.ts` | 628 | Bug: putWrites() stores raw values |
| `libs/checkpoint-sqlite/src/index.ts` | 435-436 | Correct: Uses serde.dumpsTyped() |
| `libs/checkpoint/src/serde/jsonplus.ts` | 136-142 | dumpsTyped() implementation |
| `libs/checkpoint/src/serde/jsonplus.ts` | 75 | _reviver() expects lc:2 format |

## Notes

### Why This Bug Occurs

The `@langchain/langgraph-checkpoint-redis` library was likely developed with a different serialization approach than other savers:

1. **Python vs JavaScript**: The Python version may have used different serialization
2. **Type System Differences**: JavaScript/TypeScript has different object handling than Python
3. **Testing Gap**: Tests may have passed with simple data (strings, numbers) but failed with complex LangChain objects (Messages, Documents, etc.)

### The `lc:1` vs `lc:2` Format

LangGraph's serialization uses a special format:

- `lc: 1` = "constructor" format (pre-serialization)
  ```typescript
  { lc: 1, type: 'constructor', id: [...], kwargs: {...} }
  ```
- `lc: 2` = "serialized" format (post-serialization)
  ```typescript
  { lc: 2, id: [...], kwargs: {...} }
  ```

The `serde.loadsTyped()` function's `_reviver()` expects `lc: 2` format but receives `lc: 1` from unserialized writes, causing the reviver to skip the object and leave it in constructor format.

### Why Not Submit PR to LangGraph?

The bugs are in `@langchain/langgraph-checkpoint-redis`, which is maintained by LangChain AI. However:
1. Custom implementation gives us full control over the fix
2. No dependency on library updates
3. Can add Bernard-specific optimizations
4. Learning opportunity for the team

### Backward Compatibility

Our implementation should:
1. **Read old buggy data**: Attempt to load checkpoints written by the old library (may have degraded functionality)
2. **Write new correct data**: Always use proper serialization
3. **Auto-migrate**: Optionally convert old checkpoints to new format

### Future Enhancements

Once basic implementation is working, consider:
- Async version (`AsyncRedisSaver`) for concurrent operations
- Connection pooling for high concurrency
- Batch operations for efficiency
- Metrics and monitoring integration
- RediSearch integration for querying checkpoints by metadata
