import { BaseMessage, MessageStructure } from "@langchain/core/messages";


/**
 * OpenAI-compatible streaming chunk format.
 * This maintains backward compatibility with existing UI clients.
 */
export type OpenAIStreamingChunk = {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: "assistant";
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: "stop" | "length" | "tool_calls" | "content_filter" | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

/**
 * Bernard-specific trace chunks for internal debugging.
 * These are emitted alongside OpenAI chunks but with empty choices array
 * and a bernard field for trace information.
 */
export type BernardTraceChunk = {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: [];
  bernard: {
    type: "trace";
    data: AgentOutputItem;
  };
};

/**
 * Union type for all possible streaming chunks.
 */
export type StreamingChunk = OpenAIStreamingChunk | BernardTraceChunk;

export type MessageEventType = "llm_call" | "llm_call_complete" | "tool_call" | "tool_call_complete" | "delta" | "error";

export type LLMCallEvent = {
  type: "llm_call";
  model?: string;
  context: BaseMessage<MessageStructure, MessageEventType>[];
  tools?: string[];
  totalContextTokens?: number;
}

export type LLMCallCompleteEvent = {
  type: "llm_call_complete";
  context: BaseMessage<MessageStructure, MessageEventType>[];
  result: BaseMessage<MessageStructure, MessageEventType>;
  actualTokens?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs?: number;
}

export type ToolCallEvent = {
  type: "tool_call";
  toolCall: {
    id: string;
    function: {
      name: string;
      arguments: string;
    };
  };
}

export type ToolCallCompleteEvent = {
  type: "tool_call_complete";
  toolCall: {
    id: string;
    function: {
      name: string;
      arguments: string;
    };
  };
  result: string;
  latencyMs?: number;
}

export type DeltaEvent = {
  type: "delta";
  messageId: string;
  delta: string;
  finishReason?: "stop" | "length" | "content_filter";
}

export type ErrorEvent<D = unknown> = {
  type: "error";
  data?: D;
  error: string;
}
/**
 * Agent output items that harnesses yield to be streamed to the client.
 * These represent the granular events that occur during agent execution.
 */
export type AgentOutputItem = LLMCallEvent | LLMCallCompleteEvent | ToolCallEvent | ToolCallCompleteEvent | DeltaEvent | ErrorEvent;
