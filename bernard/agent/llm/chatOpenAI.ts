import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMCaller, LLMConfig, LLMResponse } from "./llm";
import type { StructuredToolInterface } from "@langchain/core/tools";

/**
 * ChatOpenAI-based implementation of LLMCaller
 */
export class ChatOpenAILLMCaller implements LLMCaller {
  private client: ChatOpenAI;

  constructor(apiKey: string, baseURL?: string, model?: string) {
    if (!apiKey || apiKey.trim() === "") {
      throw new Error("API key is required for ChatOpenAILLMCaller");
    }

    this.client = new ChatOpenAI({
      model: model || "gpt-3.5-turbo", // Default fallback model
      apiKey: apiKey.trim(),
      ...(baseURL && { configuration: { baseURL } }),
      verbose: false,
    });
  }

  /**
   * Cleans messages to ensure they are compatible with OpenAI API and other strict providers.
   * Maps LangChain message types to proper message classes and ensures tool_calls/IDs are consistent.
   */
  private cleanMessages(messages: BaseMessage[]): BaseMessage[] {
    return messages.map((msg, index) => {
      const type = (msg as any).type || (msg as any)._getType?.() || "";

      // Extract content - ensure it's never undefined or an empty array
      let content = msg.content;
      if (content === undefined || content === null || (Array.isArray(content) && content.length === 0)) {
        content = "";
      }

      // Handle tool messages specifically to ensure tool_call_id is present
      if (type === "tool" || (msg as any).role === "tool") {
        const toolCallId = (msg as any).tool_call_id || (msg as any).additional_kwargs?.tool_call_id || `call_tool_${index}`;
        return new ToolMessage({
          content: typeof content === "string" ? content : JSON.stringify(content),
          tool_call_id: toolCallId,
          name: (msg as any).name,
        });
      }

      // Handle assistant messages to ensure tool_calls are correctly formatted
      if (type === "ai" || type === "assistant" || (msg as any).role === "assistant") {
        const toolCalls = (msg as any).tool_calls || (msg as any).additional_kwargs?.tool_calls;

        let cleanedContent = typeof content === "string" ? content : JSON.stringify(content);
        // Some providers require content to be null or non-empty string when tool_calls are present.
        // However, some LangChain versions/serializers convert null to [] which causes 400 errors.
        // We'll stick to "" for maximum compatibility unless we specifically need null.
        if (cleanedContent === "" && Array.isArray(toolCalls) && toolCalls.length > 0) {
          // If we encounter issues with "", we might need to use null, 
          // but for now let's ensure it's at least not an array.
          cleanedContent = "";
        }

        const aiFields: any = {
          content: cleanedContent,
        };

        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
          aiFields.tool_calls = toolCalls.map((tc: any, tcIdx: number) => {
            const name = tc.name || tc.function?.name || "unknown";
            return {
              id: tc.id || tc.tool_call_id || `call_${index}_${tcIdx}_${name}`,
              type: "function",
              function: {
                name,
                arguments: tc.args
                  ? (typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args))
                  : (tc.function?.arguments || "{}")
              }
            };
          });
        }

        return new AIMessage(aiFields);
      }

      // Handle system messages
      if (type === "system" || (msg as any).role === "system") {
        return new SystemMessage({ content: typeof content === "string" ? content : JSON.stringify(content) });
      }

      // Default to HumanMessage for user/human
      return new HumanMessage({ content: typeof content === "string" ? content : JSON.stringify(content) });
    });
  }

  async complete(messages: BaseMessage[], config: LLMConfig): Promise<LLMResponse> {
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
      console.error("❌ ChatOpenAI API call failed:", error);
      if (error instanceof Error && error.message.includes("Missing credentials")) {
        throw new Error("Invalid API key or missing authentication. Please check your API key configuration.");
      }
      if (error instanceof Error && error.message.includes("401")) {
        throw new Error("API key authentication failed. Please verify your API key is correct.");
      }
      if (error instanceof Error && error.message.includes("403")) {
        throw new Error("API key does not have permission to access this service.");
      }
      throw error;
    }
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

      // const cleanedMessages = this.cleanMessages(messages);
      const stream = await this.client.stream(messages, streamOptions);

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
        // If we get an error during iteration, it's likely a parsing error
        console.error("❌ Error during stream iteration:", {
          error: streamError,
          messages: JSON.stringify(messages, null, 2),
        });
        throw streamError;
      }
    } catch (error) {
      console.error("❌ ChatOpenAI streaming failed:", {
        error,
        messageCount: messages.length,
        config,
        // Log a summary of messages for quick debugging
        messageSummary: messages.map(m => ({
          type: (m as any).type || (m as any)._getType?.() || "unknown",
          role: (m as any).role,
          contentLength: typeof m.content === "string" ? m.content.length : "complex",
          hasToolCalls: !!(m as any).tool_calls?.length
        }))
      });

      // Log full messages for 400 errors or other provider errors
      if (error instanceof Error && (error.message.includes("400") || error.message.includes("Provider returned error"))) {
        console.error("DEBUG: Malformed messages sent to provider:", JSON.stringify(this.cleanMessages(messages), null, 2));
      }

      // Handle specific LangChain/ChatOpenAI errors
      if (error instanceof Error) {
        if (error.message.includes("Missing credentials")) {
          throw new Error("Invalid API key or missing authentication. Please check your API key configuration.");
        }
        if (error.message.includes("401")) {
          throw new Error("API key authentication failed. Please verify your API key is correct.");
        }
        if (error.message.includes("403")) {
          throw new Error("API key does not have permission to access this service.");
        }
        if (error instanceof TypeError && (error.message.includes("Cannot use 'in' operator") || error.message.includes("output_version"))) {
          // This is a LangChain parsing bug - the API response format may not match what LangChain expects
          // This can happen with certain API providers or LangChain versions
          console.error("LangChain streaming parser error details:", {
            message: error.message,
            stack: error.stack,
            name: error.name,
          });
          throw new Error(
            "Streaming response parsing failed. This may be due to:\n" +
            "1. LangChain version incompatibility with the API provider\n" +
            "2. API response format differences\n" +
            "3. Network issues causing incomplete responses\n\n" +
            `Original error: ${error.message}`
          );
        }
        if (error.message.includes("network") || error.message.includes("fetch")) {
          throw new Error("Network error while streaming. Please check your internet connection and API service status.");
        }
        if (error.message.includes("timeout")) {
          throw new Error("Request timed out. The API service may be overloaded or your request may be too large.");
        }
      }

      // Re-throw with additional context
      throw new Error(`Streaming failed: ${error instanceof Error ? error.message : String(error)}`);
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
      const boundClient = tools && tools.length > 0
        ? this.client.bindTools(tools)
        : this.client;

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
      const response = await boundClient.invoke(cleanedMessages, invokeOptions);

      return response as AIMessage;
    } catch (error) {
      console.error("❌ ChatOpenAI API call with tools failed:", {
        error,
        messageCount: messages.length,
        config,
      });

      if (error instanceof Error && (error.message.includes("400") || error.message.includes("Provider returned error"))) {
        console.error("DEBUG: Malformed messages sent to provider (with tools):", JSON.stringify(this.cleanMessages(messages), null, 2));
      }

      if (error instanceof Error && error.message.includes("Missing credentials")) {
        throw new Error("Invalid API key or missing authentication. Please check your API key configuration.");
      }
      if (error instanceof Error && error.message.includes("401")) {
        throw new Error("API key authentication failed. Please verify your API key is correct.");
      }
      if (error instanceof Error && error.message.includes("403")) {
        throw new Error("API key does not have permission to access this service.");
      }
      throw error;
    }
  }
}
