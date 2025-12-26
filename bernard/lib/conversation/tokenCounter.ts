import { getEncoding, type TiktokenEncoding } from "js-tiktoken";
import type { BaseMessage } from "@langchain/core/messages";

/**
 * Default encoding for GPT models (compatible with GPT-4, GPT-3.5-turbo)
 */
export const DEFAULT_ENCODING = "cl100k_base";

/**
 * Get the default encoding for token counting
 */
export function getDefaultEncoding(): string {
  return DEFAULT_ENCODING;
}

/**
 * Serialize a BaseMessage to a string for token counting
 */
function serializeMessage(message: BaseMessage): string {
  const role = message.getType();
  const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content);

  // Format similar to how messages are sent to APIs
  let serialized = "";

  // Add role if it's not system (system messages often don't have explicit role prefixes)
  if (role !== "system") {
    serialized += `${role}: `;
  }

  serialized += content;

  // Add tool call information if present
  if ("tool_calls" in message && message.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    serialized += "\nTool calls: " + JSON.stringify(message.tool_calls);
  }

  // Add tool call ID if present
  if ("tool_call_id" in message && message.tool_call_id) {
    serialized += "\nTool call ID: " + JSON.stringify(message.tool_call_id);
  }

  return serialized;
}

/**
 * Count tokens in an array of BaseMessage objects
 * @param messages - Array of BaseMessage objects to count tokens for
 * @param encoding - Optional encoding to use (defaults to cl100k_base)
 * @returns Total token count across all messages
 */
export function countTokens(messages: BaseMessage[], encoding: TiktokenEncoding = DEFAULT_ENCODING): number {
  try {
    const enc = getEncoding(encoding);

    let totalTokens = 0;

    for (const message of messages) {
      const serialized = serializeMessage(message);
      const tokens = enc.encode(serialized);
      totalTokens += tokens.length;
    }

    // Note: js-tiktoken doesn't have a free() method in newer versions
    return totalTokens;
  } catch (error) {
    console.error("Error counting tokens:", error instanceof Error ? error.message : String(error));
    // Fallback to approximate character-based counting (rough approximation)
    const totalChars = messages.reduce((sum, msg) => {
      const serialized = serializeMessage(msg);
      return sum + serialized.length;
    }, 0);

    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(totalChars / 4);
  }
}

/**
 * Count tokens in a plain text string
 * @param text - Plain text string to count tokens for
 * @param encoding - Optional encoding to use (defaults to cl100k_base)
 * @returns Token count
 */
export function countTokensInText(text: string, encoding: TiktokenEncoding = DEFAULT_ENCODING): number {
  try {
    const enc = getEncoding(encoding);
    const tokens = enc.encode(text);
    return tokens.length;
  } catch (error) {
    console.error("Error counting tokens in text:", error instanceof Error ? error.message : String(error));
    // Fallback to approximate character-based counting (rough approximation)
    return Math.ceil(text.length / 4);
  }
}

/**
 * Slice a text string by token boundaries
 * @param text - Plain text string to slice
 * @param startTokens - Starting token position (0-based)
 * @param readTokens - Number of tokens to read from start position
 * @param encoding - Optional encoding to use (defaults to cl100k_base)
 * @returns Sliced text content
 */
export function sliceTokensFromText(
  text: string,
  startTokens: number,
  readTokens: number,
  encoding: TiktokenEncoding = DEFAULT_ENCODING
): string {
  try {
    const enc = getEncoding(encoding);
    const tokens = enc.encode(text);

    // Calculate slice bounds
    const startIndex = Math.max(0, startTokens);
    const endIndex = Math.min(tokens.length, startIndex + readTokens);

    // Slice and decode
    const slicedTokens = tokens.slice(startIndex, endIndex);
    return enc.decode(slicedTokens);
  } catch (error) {
    console.error("Error slicing tokens from text:", error instanceof Error ? error.message : String(error));
    // Fallback to whitespace/punctuation splitting
    const fallbackTokens = text.split(/\s+/).filter(t => t.length > 0);
    const startIndex = Math.max(0, startTokens);
    const endIndex = Math.min(fallbackTokens.length, startIndex + readTokens);
    return fallbackTokens.slice(startIndex, endIndex).join(' ');
  }
}
