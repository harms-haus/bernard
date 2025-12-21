import type { BaseMessage, AIMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";

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

  /**
   * Complete a prompt with tool binding support, returning the full AIMessage.
   * This is used by the router harness to extract tool_calls.
   */
  completeWithTools(
    messages: BaseMessage[],
    config: LLMConfig,
    tools?: StructuredToolInterface[]
  ): Promise<AIMessage>;
}

