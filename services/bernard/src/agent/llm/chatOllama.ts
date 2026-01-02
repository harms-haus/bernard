import { ChatOllama } from "@langchain/ollama";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage, ToolCall as LangChainToolCall } from "@langchain/core/messages";
import type { LLMCaller, LLMConfig, LLMResponse } from "./llm";
import type { ModelAdapter } from "./adapters/adapter.interface";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { traceLogger, type ToolDefinitionTrace, type LLMRequestTrace } from "@/lib/tracing/trace.logger";
import { AdapterCallerWrapper } from "./adapters/callerWrapper";

// Type for serialized LangChain messages
interface SerializedLangChainMessage {
  lc: number;
  type: string;
  id: string[];
  kwargs?: Record<string, unknown>;
}

/**
 * Helper function to convert messages to Ollama format for request body
 */
function messagesToOllamaFormat(messages: BaseMessage[]): Array<{
  role: string;
  content: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}> {
  return messages.map((msg) => {
    const serializedMsg = msg as unknown as SerializedLangChainMessage;
    const isSerialized = serializedMsg.lc === 1 && serializedMsg.type === "constructor" && Array.isArray(serializedMsg.id) && serializedMsg.id.length >= 3 && serializedMsg.id[0] === "langchain_core" && serializedMsg.id[1] === "messages";

    let role: string;
    let content: string;

    if (isSerialized) {
      const actualType = serializedMsg.id[2] || "Unknown";
      content = (serializedMsg.kwargs?.["content"] as string) || "";
      switch (actualType) {
        case "AIMessage":
          role = "assistant";
          break;
        case "HumanMessage":
          role = "user";
          break;
        case "SystemMessage":
          role = "system";
          break;
        case "ToolMessage":
          role = "tool";
          break;
        default:
          role = "user";
      }
    } else {
      if (msg instanceof AIMessage) {
        role = "assistant";
      } else if (msg instanceof HumanMessage) {
        role = "user";
      } else if (msg instanceof SystemMessage) {
        role = "system";
      } else if (msg instanceof ToolMessage) {
        role = "tool";
      } else {
        role = "user";
      }
      content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    }

    const result: {
      role: string;
      content: string;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    } = { role, content };

    // Handle tool calls for AI messages
    const toolCalls = isSerialized
      ? (serializedMsg.kwargs?.["tool_calls"] as LangChainToolCall[] | undefined)
      : (msg as AIMessage).tool_calls;

    if (toolCalls && toolCalls.length > 0) {
      result.tool_calls = toolCalls.map((tc) => ({
        id: tc.id || `call_${Math.random().toString(36).substr(2, 9)}`,
        type: "function",
        function: {
          name: tc.name,
          arguments: typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args),
        },
      }));
    }

    return result;
  });
}

/**
 * ChatOllama-based implementation of LLMCaller
 */
export class ChatOllamaLLMCaller implements LLMCaller {
  private client: ChatOllama;
  private baseURL: string;

  constructor(baseURL?: string, model?: string) {
    if (!model) {
      throw new Error("Model must be specified for Ollama LLM caller");
    }
    this.client = new ChatOllama({
      model: model,
      ...(baseURL && { baseUrl: baseURL }),
      verbose: false,
    });
    this.baseURL = baseURL || "http://localhost:11434";
  }

  /**
   * Build the request trace object for the current call
   */
  private buildRequestTrace(
    model: string,
    messages: BaseMessage[],
    tools?: StructuredToolInterface[],
    config?: LLMConfig
  ): LLMRequestTrace {
    const ollamaMessages = messagesToOllamaFormat(messages);

    const body: LLMRequestTrace["body"] = {
      model,
      messages: ollamaMessages,
    };

    // Add optional parameters if provided
    if (config?.temperature !== undefined) {
      body.temperature = config.temperature;
    }
    if (config?.maxTokens !== undefined) {
      body.max_tokens = config.maxTokens;
    }

    return {
      url: `${this.baseURL}/api/chat`,
      method: "POST",
      headers: {},
      body,
    };
  }

  /**
   * Cleans messages to ensure they are compatible with Ollama API.
   * Maps LangChain message types to proper message classes and ensures tool_calls/IDs are consistent.
   */
  private cleanMessages(messages: BaseMessage[]): BaseMessage[] {
    return messages.map((msg, index) => {
      // Check if this is a serialized LangChain message
      const serializedMsg = msg as unknown as SerializedLangChainMessage;
      const isSerialized = serializedMsg.lc === 1 &&
                          serializedMsg.type === "constructor" &&
                          Array.isArray(serializedMsg.id) &&
                          serializedMsg.id.length >= 3 &&
                          serializedMsg.id[0] === "langchain_core" &&
                          serializedMsg.id[1] === "messages";

      let actualType: string;
      let kwargs: Record<string, unknown> = {};
      let content = msg.content;

      if (isSerialized) {
        // Extract type from serialized format
        actualType = serializedMsg.id[2] || "Unknown"; // e.g., "ToolMessage", "AIMessage", etc.
        kwargs = serializedMsg.kwargs || {};
        content = (kwargs["content"] as string | undefined) || content;
      } else {
        // Live LangChain message object - use instanceof checks
        if (msg instanceof AIMessage) {
          actualType = "AIMessage";
        } else if (msg instanceof HumanMessage) {
          actualType = "HumanMessage";
        } else if (msg instanceof SystemMessage) {
          actualType = "SystemMessage";
        } else if (msg instanceof ToolMessage) {
          actualType = "ToolMessage";
        } else {
          actualType = "Unknown";
        }
        kwargs = {};
      }

      // Ensure content is never undefined or empty array
      if (content === undefined || content === null || (Array.isArray(content) && content.length === 0)) {
        content = "";
      }

      // Convert based on actual message type
      switch (actualType) {
        case "ToolMessage": {
          let toolCallId: string;
          let name: string | undefined;

          if (isSerialized) {
            toolCallId = (kwargs["tool_call_id"] as string | undefined) || `call_tool_${index}`;
            name = kwargs["name"] as string | undefined;
          } else if (msg instanceof ToolMessage) {
            toolCallId = msg.tool_call_id;
            name = msg.name;
          } else {
            toolCallId = `call_tool_${index}`;
            name = undefined;
          }

          return new ToolMessage({
            content: typeof content === "string" ? content : JSON.stringify(content),
            tool_call_id: toolCallId,
            ...(name && { name }),
          });
        }

        case "AIMessage": {
          let toolCalls: LangChainToolCall[] | undefined;

          if (isSerialized) {
            toolCalls = kwargs["tool_calls"] as LangChainToolCall[];
          } else if (msg instanceof AIMessage) {
            toolCalls = msg.tool_calls;
          }
          let cleanedContent = typeof content === "string" ? content : JSON.stringify(content);

          // Some providers require content to be non-empty string when tool_calls are present
          if (cleanedContent === "" && Array.isArray(toolCalls) && toolCalls.length > 0) {
            cleanedContent = "";
          }

          const aiFields: { content: string; tool_calls?: LangChainToolCall[] } = { content: cleanedContent };

          if (Array.isArray(toolCalls) && toolCalls.length > 0) {
            aiFields.tool_calls = toolCalls;
          }

          return new AIMessage(aiFields);
        }

        case "SystemMessage":
          return new SystemMessage({ content: typeof content === "string" ? content : JSON.stringify(content) });

        case "HumanMessage":
          return new HumanMessage({ content: typeof content === "string" ? content : JSON.stringify(content) });

        default:
          // Fallback for unknown types - assume HumanMessage
          return new HumanMessage({ content: typeof content === "string" ? content : JSON.stringify(content) });
      }
    });
  }

  async complete(messages: BaseMessage[], config: LLMConfig): Promise<LLMResponse> {
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const cleanedMessages = this.cleanMessages(messages);
        const invokeOptions: {
          signal?: AbortSignal;
          temperature?: number;
          maxTokens?: number;
          timeout?: number;
        } = {};

        if (config.abortSignal) {
          invokeOptions.signal = config.abortSignal;
        }
        if (config.temperature !== undefined) {
          invokeOptions.temperature = config.temperature;
        }
        if (config.maxTokens !== undefined) {
          invokeOptions.maxTokens = config.maxTokens;
        }
        if (config.timeout !== undefined) {
          invokeOptions.timeout = config.timeout;
        }

        const response = await this.client.invoke(cleanedMessages, invokeOptions);

      // Extract usage information if available
      const metadata = response.response_metadata as Record<string, unknown> | undefined;
      const usage = metadata?.["usage"] as
        | { prompt_tokens: number; completion_tokens: number; total_tokens: number }
        | undefined;

      let contentStr: string;
      if (typeof response.content === 'string') {
        contentStr = response.content;
      } else if (Array.isArray(response.content)) {
        // Concatenate text parts from content array
        contentStr = response.content
          .filter((part): part is { type: 'text'; text: string } =>
            typeof part === 'object' && part !== null && 'type' in part && part.type === 'text')
          .map(part => part.text)
          .join('');
      } else {
        contentStr = String(response.content);
      }

      const result: LLMResponse = {
        content: contentStr,
      };

      if (usage) {
        result.usage = {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        };
      }

      const finishReason = metadata?.["finish_reason"] as "stop" | "length" | "content_filter" | undefined;
      if (finishReason) {
        result.finishReason = finishReason;
      }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`❌ ChatOllama API call failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error);

        // Don't retry on abort signals or the last attempt
        if (attempt === maxRetries || config.abortSignal?.aborted) {
          throw lastError;
        }

        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error("All retry attempts failed");
  }

  async *streamText(messages: BaseMessage[], config: LLMConfig): AsyncIterable<string> {
    try {
      const streamOptions: {
        signal?: AbortSignal;
        temperature?: number;
        maxTokens?: number;
        timeout?: number;
      } = {};

      if (config.abortSignal) {
        streamOptions.signal = config.abortSignal;
      }
      if (config.temperature !== undefined) {
        streamOptions.temperature = config.temperature;
      }
      if (config.maxTokens !== undefined) {
        streamOptions.maxTokens = config.maxTokens;
      }
      if (config.timeout !== undefined) {
        streamOptions.timeout = config.timeout;
      }

      const cleanedMessages = this.cleanMessages(messages);
      const stream = await this.client.stream(cleanedMessages, streamOptions);

      try {
        for await (const chunk of stream) {
          const content = typeof chunk.content === 'string'
            ? chunk.content
            : Array.isArray(chunk.content)
              ? chunk.content.filter((p): p is { type: 'text'; text: string } =>
                typeof p === 'object' && p !== null && 'type' in p && p.type === 'text')
                .map(p => p.text).join('')
              : String(chunk.content);
          if (content) {
            yield content;
          }
        }
      } catch (streamError) {
        console.error("❌ Error during Ollama stream iteration:", streamError);
        throw streamError;
      }
    } catch (error) {
      console.error("❌ ChatOllama streaming failed:", {
        error,
        messageCount: messages.length,
        config,
      });
      throw error;
    }
  }

  /**
    * Complete a prompt with tool binding support, returning the full AIMessage.
    * This is used by the router harness to extract tool_calls.
    */
  async completeWithTools(
    messages: BaseMessage[],
    config: LLMConfig,
    tools?: StructuredToolInterface[]
  ): Promise<AIMessage> {
    try {
      // Bind tools if provided
      const boundClient = tools && tools.length > 0 ? this.client.bindTools(tools) : this.client;

      const invokeOptions: {
        signal?: AbortSignal;
        temperature?: number;
        maxTokens?: number;
        timeout?: number;
      } = {};

      if (config.abortSignal) {
        invokeOptions.signal = config.abortSignal;
      }
      if (config.temperature !== undefined) {
        invokeOptions.temperature = config.temperature;
      }
      if (config.maxTokens !== undefined) {
        invokeOptions.maxTokens = config.maxTokens;
      }
      if (config.timeout !== undefined) {
        invokeOptions.timeout = config.timeout;
      }

      const cleanedMessages = this.cleanMessages(messages);

      // Build request trace before making the call
      const requestTrace = this.buildRequestTrace(config.model, cleanedMessages, tools, config);

      // Trace the router LLM call
      if (traceLogger.isActive()) {
        const messagesForTrace = cleanedMessages.map((m) => {
          const extMsg = m as { type: string; content: unknown; tool_calls?: LangChainToolCall[] };
          return {
            type: extMsg.type,
            content: typeof extMsg.content === "string" ? extMsg.content : "[complex content]",
            ...(extMsg.tool_calls
              ? {
                  tool_calls: extMsg.tool_calls.map((tc) => ({
                    name: tc.name,
                    arguments: typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args),
                  })),
                }
              : {}),
          };
        });

        // Extract provided tools info for trace
        const providedToolsForTrace: ToolDefinitionTrace[] | undefined =
          tools && tools.length > 0
            ? tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                schema: tool.schema,
              }))
            : undefined;

        traceLogger.recordLLMCall("router", config.model, messagesForTrace, providedToolsForTrace, undefined, requestTrace);
      }

      const response = await boundClient.invoke(cleanedMessages, invokeOptions);

      return response as AIMessage;
    } catch (error) {
      console.error("❌ ChatOllama API call with tools failed:", {
        error,
        messageCount: messages.length,
        config,
      });
      throw error;
    }
  }

  adaptedBy(adapters: ModelAdapter[]): LLMCaller {
    return new AdapterCallerWrapper(this, adapters);
  }
}
