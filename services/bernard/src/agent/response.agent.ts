import type { BernardStateType } from "./graph/state";
import { SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMCaller } from "@/agent/llm/llm";
import { buildResponseSystemPrompt } from "./prompts/response";
import type { ToolWithInterpretation } from "@/agent/tool";
import type { ConversationRecordKeeper } from "@/lib/conversation/conversationRecorder";
import pino from "pino";

const logger = pino({ base: { service: "bernard" } });

/**
 * Serialize message content for recording in conversation history.
 * Handles both simple text content and complex multimodal content.
 */
function serializeMessageContent(message: BaseMessage): Record<string, unknown> {
  const result: Record<string, unknown> = { type: message.getType() };

  const content = message.content;

  if (typeof content === "string") {
    result["text"] = content;
    return result;
  }

  // Handle array content (multimodal messages) - extract text content
  if (Array.isArray(content)) {
    const textParts: string[] = [];
    for (const block of content) {
      if (typeof block === "string") {
        textParts.push(block);
      } else if (block && typeof block === "object") {
        const blockRecord = block as Record<string, unknown>;
        const blockType = blockRecord["type"];
        if (typeof blockType === "string") {
          if (blockType === "text") {
            const textValue = blockRecord["text"];
            if (typeof textValue === "string") {
              textParts.push(textValue);
            }
          }
        }
      }
    }
    if (textParts.length > 0) {
      result["text"] = textParts.join("\n");
    }
    return result;
  }

  // Handle object content with data property
  if (content && typeof content === "object") {
    const dataContent = content as Record<string, unknown>;
    const dataValue = dataContent["data"];
    const mimeValue = dataContent["mimeType"];
    if (typeof dataValue === "string") {
      result["data"] = dataValue;
    }
    if (typeof mimeValue === "string") {
      result["mimeType"] = mimeValue;
    } else {
      result["mimeType"] = "application/octet-stream";
    }
    return result;
  }

  return result;
}

/**
 * Callback for streaming response tokens
 */
export type ResponseStreamCallback = (chunk: string) => void;

/**
 * Context for response agent
 */
export type ResponseAgentContext = {
  llmCaller: LLMCaller;
  toolDefinitions?: ToolWithInterpretation[];
  disabledTools?: Array<{ name: string; reason: string }>;
  usedTools?: string[];
  streamCallback?: ResponseStreamCallback;
  /** Optional conversation recorder for event logging */
  recorder?: ConversationRecordKeeper | undefined;
  /** Conversation ID for recording events */
  conversationId?: string | undefined;
};

/**
 * Response Agent Node - Creative Assistant
 * 
 * This node receives the full history (User query + all Tool results) and generates
 * the final creative response. It only runs when the router has gathered all necessary data.
 */
export async function responseAgentNode(
  state: BernardStateType,
  config: { configurable?: { thread_id?: string } },
  context: ResponseAgentContext
): Promise<Partial<BernardStateType>> {
  const { llmCaller, toolDefinitions, disabledTools, usedTools = [], streamCallback, recorder, conversationId } = context;

  // Build response system prompt
  const systemPrompt = buildResponseSystemPrompt(
    new Date(),
    undefined, // availableTools
    disabledTools,
    toolDefinitions,
    usedTools
  );

  // Prepare messages with system prompt
  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    ...state.messages
  ];

  // Get response model config from settings
  const { getSettings } = await import("@/lib/config/settingsCache");
  const settings = await getSettings();
  const responseConfig = settings.models.response;

  // Call LLM for creative response (no tools)
  const llmConfig: {
    model: string;
    temperature?: number;
    maxTokens?: number;
  } = {
    model: responseConfig.primary,
  };
  if (responseConfig.options?.temperature !== undefined) {
    llmConfig.temperature = responseConfig.options.temperature;
  }
  if (responseConfig.options?.maxTokens !== undefined) {
    llmConfig.maxTokens = responseConfig.options.maxTokens;
  }

  let responseText = "";

  // Record LLM call event if recorder is available
  const callStartTime = Date.now();
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  if (recorder && conversationId) {
    try {
      const eventData: {
        messageId: string;
        stage: "response";
        model: string;
        context: unknown;
        availableTools: unknown;
        requestId?: string;
      } = {
        messageId,
        stage: "response",
        model: llmConfig.model,
        context: messages.map(m => serializeMessageContent(m)),
        availableTools: []
      };
      if (config.configurable?.thread_id) {
        eventData.requestId = config.configurable.thread_id;
      }
      await recorder.recordEvent(conversationId, {
        type: "llm_call",
        data: eventData
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to record LLM call event");
    }
  }

  // Use streaming if callback is provided
  if (streamCallback) {
    for await (const chunk of llmCaller.streamText(messages, llmConfig)) {
      responseText += chunk;
      streamCallback(chunk);
    }
  } else {
    // Fallback to non-streaming
    const response = await llmCaller.complete(messages, llmConfig);
    responseText = response.content;
  }

  const callDuration = Date.now() - callStartTime;

  // Record LLM response event if recorder is available
  if (recorder && conversationId) {
    try {
      await recorder.recordEvent(conversationId, {
        type: "llm_response",
        data: {
          messageId,
          stage: "response",
          content: responseText,
          executionDurationMs: callDuration
        }
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to record LLM response event");
    }
  }

  // Create AIMessage from response
  const { AIMessage } = await import("@langchain/core/messages");
  const aiMessage = new AIMessage(responseText);

  return {
    messages: [aiMessage],
    status: "complete"
  };
}
