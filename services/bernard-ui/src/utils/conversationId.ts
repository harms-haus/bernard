/**
 * Conversation ID management utilities
 * Handles generating, storing, and retrieving conversation IDs from localStorage
 */

/**
 * Generate a UUID v4 using the browser's crypto API
 */
export function generateConversationId(): string {
  return crypto.randomUUID();
}

/**
 * Storage key for conversation ID
 */
const CONVERSATION_ID_KEY = 'bernard_conversation_id';

/**
 * Get current conversation ID from localStorage
 */
export function getStoredConversationId(): string | null {
  return localStorage.getItem(CONVERSATION_ID_KEY);
}

/**
 * Set conversation ID in localStorage
 */
export function setStoredConversationId(id: string): void {
  localStorage.setItem(CONVERSATION_ID_KEY, id);
}

/**
 * Clear conversation ID from localStorage
 */
export function clearStoredConversationId(): void {
  localStorage.removeItem(CONVERSATION_ID_KEY);
}
