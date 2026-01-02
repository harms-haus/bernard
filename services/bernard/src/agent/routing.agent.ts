import type { BernardStateType } from "./graph/state";
import { SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { LLMCaller } from "@/agent/llm/llm";
import { buildRouterSystemPrompt } from "./prompts/router";
import pino from "pino";
import type { ConversationRecordKeeper } from "@/lib/conversation/conversationRecorder";
import type { ToolCallData } from "@/lib/conversation/events";

const logger = pino({ base: { service: "bernard" } });

/**
 * Serialize message content for recording in conversation history.
 * Handles both simple text content and complex multimodal content.
 */
function serializeMessageContent(message: BaseMessage): Record<string, unknown> {
  const result: Record<string, unknown> = { type: message.type };

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
 * Context for routing agent
 */
export type RoutingAgentContext = {
  llmCaller: LLMCaller;
  tools: StructuredToolInterface[];
  disabledTools?: Array<{ name: string; reason: string }>;
  haContextManager?: unknown;
  haRestConfig?: unknown;
  plexConfig?: unknown;
  taskContext?: {
    conversationId: string;
    userId: string;
    createTask: (toolName: string, args: Record<string, unknown>, settings: Record<string, unknown>) => Promise<{ taskId: string; taskName: string }>;
  };
  /** Optional conversation recorder for event logging */
  recorder?: ConversationRecordKeeper | undefined;
  /** Conversation ID for recording events */
  conversationId?: string | undefined;
};

/**
 * Router Agent Node - Data Coordinator
 * 
 * This node prompts the LLM to act as a "Data Coordinator" that only gathers data.
 * It outputs tool calls if more information is needed, or a simple "DATA_GATHERED" message
 * if it has enough data.
 */
export async function routingAgentNode(
  state: BernardStateType,
  config: { configurable?: { thread_id?: string } },
  context: RoutingAgentContext
): Promise<Partial<BernardStateType>> {
  const { llmCaller, tools, disabledTools, recorder, conversationId } = context;

  // Build system prompt for router
  const now = new Date();
  const toolNames = tools.map((tool) => tool.name);

  const systemPrompt = buildRouterSystemPrompt(now, toolNames, disabledTools);

  // Prepare messages with system prompt
  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    ...state.messages
  ];

  // Get router model config from settings
  const { getSettings } = await import("@/lib/config/settingsCache");
  const settings = await getSettings();
  const routerConfig = settings.models.router;

  // Call LLM with tools bound
  const llmConfig: {
    model: string;
    temperature?: number;
    maxTokens?: number;
  } = {
    model: routerConfig.primary,
  };
  if (routerConfig.options?.temperature !== undefined) {
    llmConfig.temperature = routerConfig.options.temperature;
  }
  if (routerConfig.options?.maxTokens !== undefined) {
    llmConfig.maxTokens = routerConfig.options.maxTokens;
  }

  logger.debug({ model: llmConfig.model, toolsCount: tools.length }, "Calling LLM");

  // Record LLM call event if recorder is available
  const callStartTime = Date.now();
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  if (recorder && conversationId) {
    try {
      const eventData: {
        messageId: string;
        stage: "router";
        model: string;
        context: unknown;
        availableTools: unknown;
        requestId?: string;
      } = {
        messageId,
        stage: "router",
        model: llmConfig.model,
        context: messages.map(m => serializeMessageContent(m)),
        availableTools: tools.map(t => ({
          name: t.name,
          description: t.description
        }))
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

  const aiMessage = await llmCaller.completeWithTools(
    messages,
    llmConfig,
    tools
  );

  const callDuration = Date.now() - callStartTime;

  logger.debug({ toolCallsCount: aiMessage.tool_calls?.length ?? 0 }, "LLM response received");

  // Record LLM response event if recorder is available
  if (recorder && conversationId) {
    try {
      const toolCalls = aiMessage.tool_calls;
      const content = typeof aiMessage.content === "string" ? aiMessage.content : JSON.stringify(aiMessage.content);
      await recorder.recordEvent(conversationId, {
        type: "llm_response",
        data: {
          messageId,
          stage: "router",
          content,
          executionDurationMs: callDuration,
          toolCalls: toolCalls as unknown as ToolCallData[] | undefined
        }
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to record LLM response event");
    }
  }
  // Update status based on whether tools were called
  const hasToolCalls = aiMessage.tool_calls && aiMessage.tool_calls.length > 0;
  const status = hasToolCalls ? "gathering_data" : "data_gathered";

  // Router should only output tool calls, not text content
  aiMessage.content = "";

  return {
    messages: [aiMessage],
    status
  };
}
