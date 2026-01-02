import type { BernardStateType } from "./state";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { traceLogger } from "@/lib/tracing/trace.logger";
import type { ConversationRecordKeeper } from "@/lib/conversation/conversationRecorder";
import pino from "pino";

const logger = pino({ base: { service: "bernard" } });

/**
 * Tool Node configuration
 */
export interface ToolNodeConfig {
  /** Optional conversation recorder for event logging */
  recorder?: ConversationRecordKeeper | undefined;
  /** Conversation ID for recording events */
  conversationId?: string | undefined;
}

/**
 * Tool Node - Executes tool calls in parallel
 * 
 * This node executes all tool calls from the last AIMessage in parallel
 * and returns ToolMessage results.
 */
export function createToolNode(tools: StructuredToolInterface[], config?: ToolNodeConfig) {
  const toolsByName = Object.fromEntries(
    tools.map((tool) => [tool.name, tool])
  );

  return async function toolNode(state: BernardStateType): Promise<Partial<BernardStateType>> {
    const lastMessage = state.messages[state.messages.length - 1];

    if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
      return { messages: [] };
    }

    const toolCalls = lastMessage.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return { messages: [] };
    }

    // Record tool call events before execution
    const { recorder, conversationId } = config ?? {};
    if (recorder && conversationId) {
      try {
        await Promise.all(
          toolCalls.map((toolCall) => {
            const toolCallId = toolCall.id ?? `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const eventData: {
              toolCallId: string;
              toolName: string;
              messageId?: string;
              arguments: string;
            } = {
              toolCallId,
              toolName: toolCall.name,
              arguments: JSON.stringify(toolCall.args)
            };
            if (lastMessage.id) {
              eventData.messageId = lastMessage.id;
            }
            return recorder.recordEvent(conversationId, {
              type: "tool_call",
              data: eventData
            });
          })
        );
      } catch (error) {
        logger.warn({ err: error }, "Failed to record tool call events");
      }
    }

    // Execute all tool calls in parallel
    const toolResults = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const toolName = toolCall.name;
        const toolCallId = toolCall.id;
        if (!toolName || !toolCallId) {
          return new ToolMessage({
            content: `Error: Invalid tool call - missing name or id`,
            tool_call_id: toolCallId || `unknown_${Date.now()}`,
          });
        }
        const tool = toolsByName[toolName];
        if (!tool) {
          return new ToolMessage({
            content: `Error: Tool ${toolName} not found`,
            tool_call_id: toolCallId,
          });
        }

        const startTime = Date.now();
        try {
          // Trace tool call start
          if (traceLogger.isActive()) {
            traceLogger.recordToolCallStart(toolName, toolCallId, toolCall.args as Record<string, unknown>);
          }

          const result = await tool.invoke(toolCall.args) as unknown;
          const duration = Date.now() - startTime;
          const content = typeof result === "string" ? result : JSON.stringify(result);

          // Trace tool call completion
          if (traceLogger.isActive()) {
            traceLogger.recordToolCallComplete(toolName, toolCallId, content, duration);
          }

          // Record tool response event
          if (recorder && conversationId) {
            try {
              await recorder.recordEvent(conversationId, {
                type: "tool_response",
                data: {
                  toolCallId,
                  toolName,
                  result: content,
                  executionDurationMs: duration
                }
              });
            } catch (error) {
              logger.warn({ err: error }, "Failed to record tool response event");
            }
          }

          return new ToolMessage({
            content,
            tool_call_id: toolCallId,
            name: toolName,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const duration = Date.now() - startTime;

          // Trace tool call error
          if (traceLogger.isActive()) {
            traceLogger.recordToolCallError(toolName, toolCallId, errorMessage, duration);
          }

          // Record tool response event with error
          if (recorder && conversationId) {
            try {
              await recorder.recordEvent(conversationId, {
                type: "tool_response",
                data: {
                  toolCallId,
                  toolName,
                  result: `Error: ${errorMessage}`,
                  executionDurationMs: duration,
                  error: errorMessage
                }
              });
            } catch (recordError) {
              logger.warn({ err: recordError }, "Failed to record tool error event");
            }
          }

          return new ToolMessage({
            content: `Error: ${errorMessage}`,
            tool_call_id: toolCallId,
            name: toolName,
          });
        }
      })
    );

    return {
      messages: toolResults,
      toolResults: Object.fromEntries(
        toolCalls.map((tc, idx) => {
          const result = toolResults[idx];
          const toolName = tc.name || `unknown_${idx}`;
          if (!result) {
            return [toolName, ""];
          }
          return [
            toolName,
            typeof result.content === "string"
              ? result.content
              : JSON.stringify(result.content),
          ];
        })
      ),
    };
  };
}

