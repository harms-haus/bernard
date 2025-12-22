import type { BaseMessage } from "@langchain/core/messages";
import type { MessageRecord } from "./types";

/**
 * Create a unique fingerprint for a message based on its content and role
 */
export function createMessageFingerprint(message: BaseMessage | MessageRecord): string {
  const content = message.content ?? "";
  const role = (message as { role?: string }).role ?? (message as { type?: string }).type ?? "unknown";
  const name = (message as { name?: string }).name ?? "";

  // Create a stable fingerprint that ignores formatting differences
  const contentString = typeof content === "string"
    ? content.trim().toLowerCase()
    : JSON.stringify(content).toLowerCase();

  // Include tool calls and tool call ID for deeper uniqueness
  const toolCalls = (message as any).tool_calls;
  const toolCallsString = toolCalls ? JSON.stringify(toolCalls) : "";
  const toolCallId = (message as any).tool_call_id || "";

  return `${role}:${name}:${contentString}:${toolCallsString}:${toolCallId}`;
}

/**
 * Deduplicate messages by removing exact duplicates
 */
export function deduplicateMessages(messages: BaseMessage[]): BaseMessage[] {
  const seen = new Set<string>();
  const result: BaseMessage[] = [];

  for (const message of messages) {
    const fingerprint = createMessageFingerprint(message);
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      result.push(message);
    }
  }

  return result;
}

/**
 * Deduplicate message records by removing exact duplicates
 */
export function deduplicateMessageRecords(records: MessageRecord[]): MessageRecord[] {
  const seen = new Set<string>();
  const result: MessageRecord[] = [];

  for (const record of records) {
    const fingerprint = createMessageFingerprint(record);
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      result.push(record);
    }
  }

  return result;
}

/**
 * Check if two messages have the same content (ignoring formatting)
 */
export function messagesHaveSameContent(
  a: BaseMessage | MessageRecord,
  b: BaseMessage | MessageRecord
): boolean {
  return createMessageFingerprint(a) === createMessageFingerprint(b);
}