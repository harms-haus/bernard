import type { StreamingChunk } from "./types";

/**
 * Encodes a streaming chunk as Server-Sent Events format.
 * @param chunk The streaming chunk to encode
 * @returns SSE-formatted string
 */
export function encodeSSE(chunk: StreamingChunk): string {
  const data = JSON.stringify(chunk);
  return `data: ${data}\n\n`;
}

/**
 * Creates a ReadableStream that encodes streaming chunks as SSE.
 * @param chunks Async iterable of streaming chunks
 * @returns ReadableStream for SSE
 */
export function createSSEStream(chunks: AsyncIterable<StreamingChunk>): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of chunks) {
          const sseData = encodeSSE(chunk);
          const encoded = new TextEncoder().encode(sseData);
          controller.enqueue(encoded);
        }
        // Send final empty data to signal end
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      } catch (error) {
        console.error("Error in SSE stream:", error);
        controller.error(error);
      } finally {
        controller.close();
      }
    },
  });
}
