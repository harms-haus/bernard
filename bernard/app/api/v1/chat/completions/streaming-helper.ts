/**
 * Streaming helper for chat completions that provides real-time chunk streaming
 * This bridges the gap between LangGraph-style streaming and OpenAI-compatible streaming
 */

import type { BaseMessage } from "@langchain/core/messages";
import type { StreamEvent } from "@/agent/harness/lib/types";
import { contentFromMessage } from "@/lib/conversation/messages";

export interface StreamingChunk {
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_outputs?: Array<{
    id: string;
    content: string;
  }>;
  finish_reason?: "stop" | "length" | "content_filter" | "function_call" | "tool_calls" | null;
}

export class StreamingHelper {
  private chunks: StreamingChunk[] = [];
  private accumulatedContent = "";
  private finalContent = "";
  private toolCallMap = new Map<string, any>();

  /**
   * Process stream events and convert them to OpenAI-compatible chunks
   */
  processStreamEvent(event: StreamEvent): StreamingChunk[] {
    const outputChunks: StreamingChunk[] = [];

    switch (event.type) {
      case "llm_call_start":
        // Start of LLM call - no immediate output
        break;

      case "llm_call_chunk":
        if (event.llmCallChunk?.content) {
          this.accumulatedContent += event.llmCallChunk.content;
          outputChunks.push({
            content: event.llmCallChunk.content
          });
        }
        break;

      case "llm_call_complete":
        // LLM call complete - send any remaining content
        if (this.accumulatedContent) {
          outputChunks.push({
            content: this.accumulatedContent
          });
          // Preserve final content before clearing accumulated buffer
          this.finalContent = this.accumulatedContent;
          this.accumulatedContent = "";
        }
        break;

      case "tool_call":
        if (event.toolCall) {
          this.toolCallMap.set(event.toolCall.id, event.toolCall);
          outputChunks.push({
            tool_calls: [{
              id: event.toolCall.id,
              type: "function",
              function: {
                name: event.toolCall.name,
                arguments: typeof event.toolCall.arguments === "string" 
                  ? event.toolCall.arguments 
                  : JSON.stringify(event.toolCall.arguments)
              }
            }]
          });
        }
        break;

      case "tool_response":
        if (event.toolResponse) {
          outputChunks.push({
            tool_outputs: [{
              id: event.toolResponse.toolCallId,
              content: event.toolResponse.content
            }]
          });
        }
        break;

      case "context_update":
        // Handle context updates if needed
        break;
    }

    return outputChunks;
  }

  /**
   * Get final accumulated content
   */
  getFinalContent(): string {
    return this.finalContent;
  }

  /**
   * Get all collected tool calls
   */
  getToolCalls(): Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }> {
    return Array.from(this.toolCallMap.values()).map(toolCall => ({
      id: toolCall.id,
      type: "function",
      function: {
        name: toolCall.name,
        arguments: typeof toolCall.arguments === "string" 
          ? toolCall.arguments 
          : JSON.stringify(toolCall.arguments)
      }
    }));
  }

  /**
   * Reset the helper state for new stream
   */
  reset(): void {
    this.chunks = [];
    this.accumulatedContent = "";
    this.finalContent = "";
    this.toolCallMap.clear();
  }
}

/**
 * Create a streaming response that mirrors LangGraph's streaming approach
 * but works with Bernard's current architecture
 */
export function createStreamingResponse(
  requestId: string,
  onStreamEvent: (eventHandler: (event: StreamEvent) => void) => void,
  onChunk: (chunk: StreamingChunk) => void
): Promise<{
  content: string;
  message: BaseMessage;
  toolCalls?: any[];
  usage?: any;
}> {
  return new Promise((resolve, reject) => {
    const helper = new StreamingHelper();
    let finalContent = "";
    let finalMessage: BaseMessage | undefined;
    let finalUsage: any;
    let isSettled = false;

    // Set up event handler to collect chunks
    const eventHandler = (event: StreamEvent) => {
      try {
        const chunks = helper.processStreamEvent(event);
        
        // Send each chunk immediately
        for (const chunk of chunks) {
          onChunk(chunk);
        }

        // Handle completion
        if (event.type === "llm_call_complete" && event.llmCallComplete) {
          finalContent = helper.getFinalContent();
          finalUsage = event.llmCallComplete.usage;
          
          // Send final chunk with finish reason
          onChunk({
            finish_reason: "stop"
          });
          
          if (!isSettled) {
            isSettled = true;
            resolve({
              content: finalContent,
              message: finalMessage || { content: finalContent } as BaseMessage,
              toolCalls: helper.getToolCalls(),
              usage: finalUsage
            });
          }
        }
      } catch (err) {
        if (!isSettled) {
          isSettled = true;
          reject(err);
        }
      }
    };

    // Wire up the event handler to the stream
    onStreamEvent(eventHandler);
  });
}