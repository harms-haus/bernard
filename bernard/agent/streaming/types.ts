/**
 * Agent output items that harnesses yield to be streamed to the client.
 * These represent the granular events that occur during agent execution.
 */
export type AgentOutputItem =
  | {
    type: "llm_prompt";
    prompt: string;
    model: string;
  }
  | {
    type: "tool_call";
    toolCall: {
      id: string;
      function: {
        name: string;
        arguments: string;
      };
    };
  }
  | {
    type: "tool_output";
    toolCallId: string;
    output: string;
  }
  | {
    type: "delta";
    content: string;
    finishReason?: "stop" | "length" | "content_filter";
  }
  | {
    type: "error";
    error: string;
  }
  | {
    type: "context_update";
    context: any[]; // Use any[] to avoid complex import cycles here, will be BaseMessage[] in practice
  };

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
