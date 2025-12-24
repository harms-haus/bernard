import type { Archivist, MessageRecord } from "../../../lib/conversation/types";
import { isFollowUpSuggestionMessage } from "../../../lib/conversation/followUpDetection";

// Import the chunking logic from conversationTasks.ts
// These constants and functions need to match exactly for consistent chunking
const chunkChars = parseInt(process.env["CONVERSATION_INDEX_CHARS"] ?? "1800", 10) || 1800;
const maxChunks = parseInt(process.env["CONVERSATION_INDEX_MAX_CHUNKS"] ?? "12", 10) || 12;
const messageLimit = parseInt(process.env["CONVERSATION_INDEX_MESSAGE_LIMIT"] ?? "240", 10) || 240;

function filterMessages(messages: MessageRecord[]): MessageRecord[] {
  const filtered = messages.filter((message) => {
    // Exclude follow-up suggestion messages
    if (isFollowUpSuggestionMessage(message)) {
      return false;
    }

    const traceType = (message.metadata as { traceType?: string } | undefined)?.traceType;
    const name = message.name;

    // Exclude recollection events
    if (name === "recollection" || traceType === "recollection") {
      return false;
    }

    // Exclude tool calls and results
    if (message.role === "tool") {
      return false;
    }

    // Exclude LLM calls and results
    if (traceType === "llm_call") {
      return false;
    }

    // Only include user and assistant messages
    return message.role === "user" || message.role === "assistant";
  });

  return filtered;
}

function toEntry(message: MessageRecord): string {
  const content =
    typeof message.content === "string" ? message.content : JSON.stringify(message.content, null, 2).slice(0, chunkChars);
  const entry = `[${message.role}] ${content}`;
  return entry;
}

function chunkMessages(entries: string[]): string[] {
  const chunks: string[] = [];
  let current = "";

    for (const entry of entries) {
      if (!entry) continue;
      const trimmedEntry = entry.length > chunkChars ? entry.slice(0, chunkChars) : entry;

    if ((current + "\n" + trimmedEntry).length > chunkChars && current.length) {
      const chunk = current.trim();
      chunks.push(chunk);
      current = trimmedEntry;
      continue;
    }
    current = current ? `${current}\n${trimmedEntry}` : trimmedEntry;
    if (current.length >= chunkChars) {
      const chunk = current.slice(0, chunkChars);
      chunks.push(chunk);
      current = "";
    }
  }
  if (current.trim()) {
    const chunk = current.trim();
    chunks.push(chunk);
  }

  // Return only the most recent maxChunks
  const finalChunks = chunks.slice(-maxChunks);
  return finalChunks;
}

/**
 * Map a chunk index to the range of message indices that contributed to that chunk.
 * This recreates the same chunking logic used during indexing to maintain consistency.
 */
export async function getChunkMessagePositions(
  archivist: Archivist,
  conversationId: string,
  chunkIndex: number
): Promise<{ startIndex: number; endIndex: number }> {
  try {
    // 1. Get all messages for the conversation
    const allMessages = await archivist.getMessages(conversationId);
    if (!allMessages || allMessages.length === 0) {
      console.warn(`[getChunkMessagePositions] No messages found for conversation ${conversationId}`);
      return { startIndex: 0, endIndex: 0 };
    }

    // 2. Apply the same filtering as indexing
    const filteredMessages = filterMessages(allMessages).slice(-messageLimit);

    if (filteredMessages.length === 0) {
      console.warn(`[getChunkMessagePositions] No filtered messages for conversation ${conversationId}`);
      return { startIndex: 0, endIndex: 0 };
    }

    // 3. Convert messages to entries (same as indexing)
    const entries = filteredMessages.map(toEntry);

    // 4. Create chunks (same as indexing)
    const chunks = chunkMessages(entries);

    if (chunkIndex >= chunks.length) {
      console.warn(`[getChunkMessagePositions] Chunk index ${chunkIndex} out of range for ${chunks.length} chunks in conversation ${conversationId}`);
      return { startIndex: 0, endIndex: filteredMessages.length - 1 };
    }

    // 5. Reconstruct which messages went into which chunk
    // This is complex because messages can span multiple chunks
    const messageToChunks = new Map<number, number[]>(); // messageIndex -> chunkIndices
    let currentChunkIndex = 0;
    let currentChunkContent = "";
    let chunkStartMessageIndex = 0;

    for (let messageIndex = 0; messageIndex < entries.length; messageIndex++) {
      const entry = entries[messageIndex];
      if (!entry) continue;
      const trimmedEntry = entry.length > chunkChars ? entry.slice(0, chunkChars) : entry;

      // Check if adding this entry would exceed chunk size
      if (currentChunkContent && (currentChunkContent + "\n" + trimmedEntry).length > chunkChars && currentChunkContent.length) {
        // Complete current chunk
        const chunkMessages = [];
        for (let i = chunkStartMessageIndex; i < messageIndex; i++) {
          chunkMessages.push(i);
        }
        messageToChunks.set(currentChunkIndex, chunkMessages);

        // Start new chunk
        currentChunkIndex++;
        chunkStartMessageIndex = messageIndex;
        currentChunkContent = trimmedEntry;
      } else {
        currentChunkContent = currentChunkContent ? `${currentChunkContent}\n${trimmedEntry}` : trimmedEntry;
      }

      // Check if current content exceeds chunk size
      if (currentChunkContent.length >= chunkChars) {
        // Complete current chunk
        const chunkMessages = [];
        for (let i = chunkStartMessageIndex; i <= messageIndex; i++) {
          chunkMessages.push(i);
        }
        messageToChunks.set(currentChunkIndex, chunkMessages);

        // Start new chunk
        currentChunkIndex++;
        chunkStartMessageIndex = messageIndex + 1;
        currentChunkContent = "";
      }
    }

    // Handle final chunk
    if (currentChunkContent.trim()) {
      const chunkMessages = [];
      for (let i = chunkStartMessageIndex; i < entries.length; i++) {
        chunkMessages.push(i);
      }
      messageToChunks.set(currentChunkIndex, chunkMessages);
    }

    // Apply maxChunks limit (keep only the most recent chunks)
    const totalChunks = Math.min(chunks.length, maxChunks);
    const offset = Math.max(0, chunks.length - maxChunks);
    const adjustedChunkIndex = chunkIndex + offset;

    if (adjustedChunkIndex >= totalChunks) {
      console.warn(`[getChunkMessagePositions] Adjusted chunk index ${adjustedChunkIndex} still out of range for ${totalChunks} chunks`);
      return { startIndex: 0, endIndex: Math.max(0, filteredMessages.length - 1) };
    }

    // Get the message indices for this chunk
    const chunkMessageIndices = messageToChunks.get(adjustedChunkIndex);
    if (!chunkMessageIndices || chunkMessageIndices.length === 0) {
      console.warn(`[getChunkMessagePositions] No message indices found for chunk ${adjustedChunkIndex}`);
      return { startIndex: 0, endIndex: Math.max(0, filteredMessages.length - 1) };
    }

    const startIndex = chunkMessageIndices[0] ?? 0;
    const endIndex = chunkMessageIndices[chunkMessageIndices.length - 1] ?? startIndex;

    console.log(`[getChunkMessagePositions] Mapped chunk ${chunkIndex} to messages ${startIndex}-${endIndex} in conversation ${conversationId}`);

    return { startIndex, endIndex };

  } catch (err) {
    console.error(`[getChunkMessagePositions] Failed to map chunk positions for ${conversationId}:${chunkIndex}:`, err);
    // Return a fallback range
    return { startIndex: 0, endIndex: 0 };
  }
}
