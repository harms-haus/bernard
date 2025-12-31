import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage, ToolCall as LangChainToolCall } from "@langchain/core/messages";
import type { LLMCaller, LLMConfig, LLMResponse } from "./llm";
import type { StructuredToolInterface } from "@langchain/core/tools";
import pino from "pino";
import { traceLogger, type ToolDefinitionTrace } from "@/lib/tracing/trace.logger";

const logger = pino({ base: { service: "bernard" } });

// Types for LangChain message serialization
interface SerializedLangChainMessage {
  lc: number;
  type: string;
  id: string[];
  kwargs: Record<string, unknown>;
}

// Extended message interface for internal properties
interface ExtendedBaseMessage {
  lc?: number;
  type: string;
  _getType?: () => string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: LangChainToolCall[];
  additional_kwargs?: {
    tool_calls?: LangChainToolCall[];
  };
  role?: string; // For debugging/logging purposes
  content: unknown;
  response_metadata?: Record<string, unknown>;
}

/**
 * ChatOpenAI-based implementation of LLMCaller
 */
export class ChatOpenAILLMCaller implements LLMCaller {
  private client: ChatOpenAI;

  constructor(apiKey: string, baseURL?: string, model?: string) {
    if (!apiKey || apiKey.trim() === "") {
      throw new Error("API key is required for ChatOpenAILLMCaller");
    }

    // OpenRouter requires HTTP-Referer and Origin headers for authentication
    // These headers help OpenRouter identify the source of the request
    const configuration: {
      baseURL?: string;
      defaultHeaders?: Record<string, string>;
    } = {};

    if (baseURL) {
      configuration.baseURL = baseURL;
    }

    // Add OpenRouter-required headers for self-hosted/local deployments
    // These help OpenRouter validate the request source
    configuration.defaultHeaders = {
      "HTTP-Referer": "http://localhost:3000",
      "Origin": "http://localhost:3000",
    };

    this.client = new ChatOpenAI({
      model: model || "gpt-3.5-turbo",
      apiKey: apiKey.trim(),
      configuration,
      verbose: false,
    });
  }

  /**
    * Cleans messages to ensure they are compatible with OpenAI API and other strict providers.
    * Maps LangChain message types to proper message classes and ensures tool_calls/IDs are consistent.
    */
  private cleanMessages(messages: BaseMessage[]): BaseMessage[] {
    return messages.map((msg, index) => {
      const extendedMsg = msg as unknown as ExtendedBaseMessage;

      // Check if this is a serialized LangChain message
      const isSerialized = extendedMsg.lc === 1 &&
                          extendedMsg.type === "constructor" &&
                          Array.isArray((extendedMsg as unknown as SerializedLangChainMessage).id) &&
                          (extendedMsg as unknown as SerializedLangChainMessage).id.length >= 3 &&
                          (extendedMsg as unknown as SerializedLangChainMessage).id[0] === "langchain_core" &&
                          (extendedMsg as unknown as SerializedLangChainMessage).id[1] === "messages";

      let actualType: string;
      let kwargs: Record<string, unknown> = {};
      let content = msg.content;

      if (isSerialized) {
        // Extract type from serialized format
        const serializedMsg = extendedMsg as unknown as SerializedLangChainMessage;
        actualType = serializedMsg.id[2] || "Unknown"; // e.g., "ToolMessage", "AIMessage", etc.
        kwargs = serializedMsg.kwargs || {};
        content = (kwargs["content"] as string | undefined) || content;
      } else {
        // Live LangChain message object
        actualType = extendedMsg.type || extendedMsg._getType?.() || "";
        kwargs = {};
      }

      // Ensure content is never undefined or empty array
      if (content === undefined || content === null || (Array.isArray(content) && content.length === 0)) {
        content = "";
      }

      // Convert based on actual message type
      switch (actualType) {
        case "ToolMessage": {
          const toolCallId = (kwargs["tool_call_id"] as string | undefined) || extendedMsg.tool_call_id || `call_tool_${index}`;
          const name = (kwargs["name"] as string | undefined) || extendedMsg.name;
          const messageFields: { content: string; tool_call_id: string; name?: string } = {
            content: typeof content === "string" ? content : JSON.stringify(content),
            tool_call_id: toolCallId,
          };
          if (name) {
            messageFields.name = name;
          }
          return new ToolMessage(messageFields);
        }

        case "AIMessage": {
          const toolCalls = (kwargs["tool_calls"] as LangChainToolCall[]) || extendedMsg.tool_calls || extendedMsg.additional_kwargs?.tool_calls;
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
    try {
      const cleanedMessages = this.cleanMessages(messages);

      // Trace the LLM call
      if (traceLogger.isActive()) {
        const messagesForTrace = cleanedMessages.map(m => {
          const extMsg = m as { type: string; content: unknown; tool_calls?: LangChainToolCall[] };
          return {
            type: extMsg.type,
            content: typeof extMsg.content === "string" ? extMsg.content : "[complex content]",
            ...(extMsg.tool_calls ? {
              tool_calls: extMsg.tool_calls.map(tc => ({
                name: tc.name,
                arguments: typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args)
              }))
            } : {})
          };
        });
        traceLogger.recordLLMCall("response", config.model, messagesForTrace);
      }

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

      // Trace the LLM response
      if (traceLogger.isActive()) {
        const traceResponse: { content: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }; finish_reason?: string } = {
          content: contentStr,
        };
        if (result.usage) {
          traceResponse.usage = {
            prompt_tokens: result.usage.promptTokens,
            completion_tokens: result.usage.completionTokens,
            total_tokens: result.usage.totalTokens
          };
        }
        if (result.finishReason) {
          traceResponse.finish_reason = result.finishReason;
        }
        traceLogger.recordLLMResponse("response", traceResponse);
      }

      return result;
    } catch (error) {
      logger.error({ err: error }, "ChatOpenAI API call failed");
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
        logger.error({ err: streamError }, "Error during stream iteration");
        throw streamError;
      }
    } catch (error) {
      logger.error({ err: error, messageCount: messages.length }, "ChatOpenAI streaming failed");

      // Log full messages for 400 errors or other provider errors
      if (error instanceof Error && (error.message.includes("400") || error.message.includes("Provider returned error"))) {
        logger.debug({ messages: this.cleanMessages(messages) }, "Malformed messages sent to provider");
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
          logger.error({ err: error }, "LangChain streaming parser error");
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

      // Trace the router LLM call
      if (traceLogger.isActive()) {
        const messagesForTrace = cleanedMessages.map(m => {
          const extMsg = m as { type: string; content: unknown; tool_calls?: LangChainToolCall[] };
          return {
            type: extMsg.type,
            content: typeof extMsg.content === "string" ? extMsg.content : "[complex content]",
            ...(extMsg.tool_calls ? {
              tool_calls: extMsg.tool_calls.map(tc => ({
                name: tc.name,
                arguments: typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args)
              }))
            } : {})
          };
        });

        // Extract provided tools info for trace
        const providedToolsForTrace: ToolDefinitionTrace[] | undefined = tools && tools.length > 0
          ? tools.map(tool => ({
              name: tool.name,
              description: tool.description,
              schema: tool.schema
            }))
          : undefined;

        traceLogger.recordLLMCall("router", config.model, messagesForTrace, providedToolsForTrace);
      }

      const response = await boundClient.invoke(cleanedMessages, invokeOptions);

      // Trace the router LLM response
      if (traceLogger.isActive()) {
        const aiMsg = response as AIMessage;
        const content = typeof aiMsg.content === "string" ? aiMsg.content : JSON.stringify(aiMsg.content);
        const traceResponse: { content: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }; finish_reason?: string } = {
          content,
        };
        const finishReason = aiMsg.response_metadata?.["finish_reason"] as string | undefined;
        if (finishReason) {
          traceResponse.finish_reason = finishReason;
        }
        traceLogger.recordLLMResponse("router", traceResponse);
      }

      return response as AIMessage;
    } catch (error) {
      logger.error({ err: error, messageCount: messages.length }, "ChatOpenAI API call with tools failed");

      if (error instanceof Error && (error.message.includes("400") || error.message.includes("Provider returned error"))) {
        logger.debug({ messages: this.cleanMessages(messages) }, "Malformed messages sent to provider (with tools)");
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
