import type { BaseMessage } from "@langchain/core/messages";

/**
 * Configuration for LLM calls
 */
export type LLMConfig = {
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  abortSignal?: AbortSignal;
};

/**
 * Result of a non-streaming LLM completion
 */
export type LLMResponse = {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: "stop" | "length" | "content_filter";
};

/**
 * Interface for LLM callers that support both streaming and non-streaming modes
 */
export interface LLMCaller {
  /**
   * Complete a prompt non-streamingly
   */
  complete(messages: BaseMessage[], config: LLMConfig): Promise<LLMResponse>;

  /**
   * Stream text completion as an async iterable of text chunks
   */
  streamText(messages: BaseMessage[], config: LLMConfig): AsyncIterable<string>;
}
