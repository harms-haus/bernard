import type { AgentOutputItem, StreamingChunk, OpenAIStreamingChunk, BernardTraceChunk } from "./types";

export type TransformOptions = {
    model: string;
    requestId: string;
    conversationId: string;
};

/**
 * Transforms a stream of AgentOutputItems into StreamingChunks (OpenAI + Bernard trace format).
 */
export async function* transformAgentOutputToChunks(
    stream: AsyncIterable<AgentOutputItem>,
    options: TransformOptions
): AsyncGenerator<StreamingChunk> {
    const { model, requestId, conversationId } = options;
    const created = Math.floor(Date.now() / 1000);
    const chunkBaseId = requestId || `chatcmpl-${conversationId}`;
    let chunkId = 0;
    let sentRole = false;

    for await (const item of stream) {
        // 1. Trace chunks for internal events
        if (
            item.type === "llm_call" ||
            item.type === "llm_call_complete" ||
            item.type === "tool_call" ||
            item.type === "tool_call_complete" ||
            item.type === "recollection" ||
            item.type === "error" ||
            item.type === "status"
        ) {
            const traceChunk: BernardTraceChunk = {
                id: `${chunkBaseId}-${++chunkId}`,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [],
                bernard: {
                    type: "trace",
                    data: item,
                },
            };
            yield traceChunk;
        }

        // 2. OpenAI-compatible chunks for deltas
        if (item.type === "delta") {
            const delta: { role?: "assistant"; content?: string } = {};
            if (!sentRole) {
                delta.role = "assistant";
                sentRole = true;
            }
            if (item.delta !== undefined) {
                delta.content = item.delta;
            }

            const deltaChunk: OpenAIStreamingChunk = {
                id: `${chunkBaseId}-${++chunkId}`,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [
                    {
                        index: 0,
                        delta,
                        finish_reason: item.finishReason || null,
                    },
                ],
            };
            yield deltaChunk;
        }
    }
}
