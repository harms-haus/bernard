/**
 * Type definitions for Redis-based checkpoint storage.
 * 
 * This module provides TypeScript interfaces for the Redis checkpoint
 * data structures used by RedisSaver.
 */

import type { Checkpoint, CheckpointTuple, BaseCheckpointSaver, CheckpointMetadata } from "@langchain/langgraph-checkpoint";
import type { RedisClientType } from "redis";

/**
 * Configuration options for RedisSaver.
 */
export interface RedisSaverConfig {
  /** Redis connection URL (e.g., "redis://localhost:6379") */
  url?: string;
  /** Pre-configured Redis client (takes precedence over url) */
  client?: RedisClientType;
  /** Optional namespace prefix for keys (default: "checkpoint") */
  namespace?: string;
  /** TTL in seconds, -1 for no expiry (default: no expiry) */
  ttl?: number;
}

/**
 * Parsed components of a Redis checkpoint key.
 * Key format: checkpoint:{thread_id}:{checkpoint_ns}:{checkpoint_id}
 */
export interface CheckpointKey {
  /** The key prefix (typically "checkpoint") */
  namespace: string;
  /** Thread identifier */
  threadId: string;
  /** Checkpoint namespace (may be empty) */
  checkpointNs: string;
  /** Unique checkpoint identifier (typically ULID) */
  checkpointId: string;
}

/**
 * Pre-serialized checkpoint data for storage.
 * This represents the data after serde.dumpsTyped() has been applied.
 */
export interface SerializedCheckpoint {
  /** Serialized checkpoint data */
  checkpoint: Uint8Array;
  /** Serialized metadata */
  metadata: Uint8Array;
  /** Pending writes with serialized values: [channel, serialized_value] */
  pendingWrites: Array<[string, Uint8Array]>;
}

/**
 * Redis JSON document structure for checkpoint storage.
 */
export interface RedisCheckpointDoc {
  /** Thread identifier */
  thread_id: string;
  /** Checkpoint namespace */
  checkpoint_ns: string;
  /** Unique checkpoint identifier */
  checkpoint_id: string;
  /** Parent checkpoint ID (null if root) */
  parent_checkpoint_id: string | null;
  /** Serialized checkpoint data (Uint8Array from serde.dumpsTyped) */
  checkpoint: Uint8Array;
  /** Serialized metadata (Uint8Array from serde.dumpsTyped) */
  metadata: Uint8Array;
  /** Type of serialized checkpoint: "json" or "bytes" */
  checkpoint_type: string;
  /** Type of serialized metadata: "json" or "bytes" */
  metadata_type: string;
  /** Unix timestamp of checkpoint creation */
  checkpoint_ts: number;
  /** Whether this checkpoint has pending writes: "true" or "false" */
  has_writes: string;
  /** Source of the checkpoint (from metadata) - for RediSearch indexing */
  source?: string;
  /** Step number - for RediSearch indexing */
  step?: number;
}

/**
 * Redis JSON document structure for pending writes.
 */
export interface RedisWriteDoc {
  /** Thread identifier */
  thread_id: string;
  /** Checkpoint namespace */
  checkpoint_ns: string;
  /** Unique checkpoint identifier */
  checkpoint_id: string;
  /** Task ID that created this write */
  task_id: string;
  /** Index of this write within the batch */
  idx: number;
  /** Channel name (e.g., "messages") */
  channel: string;
  /** Serialized value (Uint8Array from serde.dumpsTyped) */
  value: Uint8Array;
  /** Type of serialized value: "json" or "bytes" */
  value_type: string;
  /** Unix timestamp of write */
  timestamp: number;
  /** Global index for ordering */
  global_idx: number;
}
