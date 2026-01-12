/**
 * Key parsing and formatting utilities for Redis checkpoint keys.
 * 
 * Handles the format: checkpoint:{thread_id}:{checkpoint_ns}:{checkpoint_id}
 * with proper escaping of colons in namespace to prevent parsing errors.
 */

import type { CheckpointKey } from "./types.js";

/**
 * Parse a Redis checkpoint key into its components.
 * Handles escaped delimiters in namespace.
 * 
 * @param key - Full Redis key like "checkpoint:thread-123::1ef4f797-8335-6428-8001-8a1503f9b875"
 * @returns CheckpointKey object with parsed components
 */
export function parseCheckpointKey(key: string): CheckpointKey {
  // Key format: checkpoint:{thread_id}:{checkpoint_ns}:{checkpoint_id}
  // checkpoint_ns may contain escaped colons
  // Split on unescaped colons only (colons not preceded by backslash)
  const parts = key.split(/(?<!\\):/);
  if (parts.length < 4) {
    throw new Error(`Invalid checkpoint key format: ${key}`);
  }
  
  const namespace = parts[0];
  const threadId = fromStorageSafeId(parts[1]);
  // Checkpoint_ns is everything between threadId and checkpointId
  const checkpointId = fromStorageSafeId(parts[parts.length - 1]);
  const checkpointNs = fromStorageSafeNs(parts.slice(2, -1).join(":"));
  
  return {
    namespace,
    threadId,
    checkpointNs,
    checkpointId,
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
  const escapedNs = checkpointNs.replace(/:/g, "\\:");
  return `checkpoint:${toStorageSafeId(threadId)}:${escapedNs}:${toStorageSafeId(checkpointId)}`;
}

/**
 * Convert to storage-safe string for IDs (thread_id, checkpoint_id).
 * Escapes colons which could interfere with key parsing.
 * 
 * @param id - The ID to make safe for storage
 * @returns Storage-safe string
 */
export function toStorageSafeId(id: string): string {
  // Escape backslashes first, then colons
  return id.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
}

/**
 * Convert from storage-safe string for IDs.
 * 
 * @param id - The storage-safe ID
 * @returns Original ID
 */
export function fromStorageSafeId(id: string): string {
  // Unescape colons first, then backslashes
  return id.replace(/\\:/g, ":").replace(/\\\\/g, "\\");
}

/**
 * Convert to storage-safe string for namespaces.
 * Namespaces can contain colons but we escape them for key parsing.
 * 
 * @param ns - The namespace to make safe for storage
 * @returns Storage-safe namespace string
 */
export function toStorageSafeNs(ns: string): string {
  return ns.replace(/:/g, "\\:");
}

/**
 * Convert from storage-safe string for namespaces.
 * 
 * @param ns - The storage-safe namespace
 * @returns Original namespace
 */
export function fromStorageSafeNs(ns: string): string {
  return ns.replace(/\\:/g, ":");
}
