import { SystemMessage, AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { ToolMessage as LangChainToolMessage } from "@langchain/core/messages";
import type { AgentOutputItem } from "../../streaming/types";
import type { LLMCaller } from "../../llm/llm";
import { ChatOpenAILLMCaller } from "../../llm/chatOpenAI";
import { buildRouterSystemPrompt } from "./prompts";
import { getRouterTools } from "./tools";
import type { HomeAssistantContextManager } from "./tools/ha-context";
import type { Archivist, MessageRecord } from "../../../lib/conversation/types";
import { messageRecordToBaseMessage } from "../../../lib/conversation/messages";
import { deduplicateMessages } from "../../../lib/conversation/dedup";
import crypto from "node:crypto";
import type { StructuredToolInterface } from "@langchain/core/tools";

// Define the tool definition type for system prompts
type ToolLikeForPrompt = {
  name: string;
  description?: string;
  schema?: unknown;
};


export type RouterHarnessContext = {
  conversationId: string;
  messages: BaseMessage[];
  llmCaller: LLMCaller;
  archivist: Archivist;
  haContextManager?: HomeAssistantContextManager;
  abortSignal?: AbortSignal;
  skipHistory?: boolean;
};

/**
 * Get router tool definitions for the system prompt
 */
export function getRouterToolDefinitions(haContextManager?: HomeAssistantContextManager) {
  const langChainTools = getRouterTools(haContextManager);
  const toolDefinitions: ToolLikeForPrompt[] = langChainTools.map(tool => ({
    name: tool.name,
    description: tool.description || "",
    schema: tool.schema,
  }));
  return { langChainTools, toolDefinitions };
}

/**
 * Build the initial message context for the LLM
 */
export async function prepareInitialContext(
  conversationId: string,
  messages: BaseMessage[],
  archivist: Archivist,
  toolDefinitions: ToolLikeForPrompt[],
  options: { skipHistory?: boolean } = {}
): Promise<BaseMessage[]> {
  // 1. Get conversation history
  let history: MessageRecord[];
  try {
    history = options.skipHistory ? [] : await archivist.getMessages(conversationId, {
      limit: 20
    });
  } catch (error) {
    console.error("Error fetching conversation history:", error);
    history = []; // Proceed with empty history on error
  }

  const systemPrompt = buildRouterSystemPrompt(new Date(), toolDefinitions);
  const systemMessage = new SystemMessage(systemPrompt);

  const historyMessages = history.map(msg => messageRecordToBaseMessage(msg)).filter((m): m is BaseMessage => m !== null);
  const contextMessages = deduplicateMessages([...historyMessages, ...messages]);

  const filteredMessages = contextMessages.filter(msg => msg.name !== "llm_call" && msg.name !== "llm_call_complete");

  return [
    systemMessage,
    ...filteredMessages
  ];
}

/**
 * Execute a single tool call and return a result
 */
export async function executeTool(
  tool: StructuredToolInterface | null,
  toolCall: { id: string; function: { name: string; arguments: string } },
  currentContext: BaseMessage[]
): Promise<{ toolCallId: string; toolName: string; output: string }> {
  if (!tool) {
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.function.name,
      output: `Error: Tool '${toolCall.function.name}' not found`,
    };
  }

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch (error) {
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.function.name,
      output: `Error: Invalid tool arguments: ${error}`,
    };
  }

  try {
    const result = await tool.invoke(args, {
      configurable: { conversationMessages: currentContext },
    });

    return {
      toolCallId: toolCall.id,
      toolName: toolCall.function.name,
      output: typeof result === "string" ? result : JSON.stringify(result),
    };
  } catch (error) {
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.function.name,
      output: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Extract tool calls from AIMessage
 */
function extractToolCallsFromAIMessage(aiMessage: AIMessage): Array<{
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}> {
  const toolCalls: Array<{
    id: string;
    function: {
      name: string;
      arguments: string;
    };
  }> = [];

  if (aiMessage.tool_calls && Array.isArray(aiMessage.tool_calls)) {
    for (const call of aiMessage.tool_calls) {
      if (call.name) {
        // Generate a local ID without mutating the input call object
        // Use a semi-deterministic ID if none is provided
        const id = call.id ?? `call_${toolCalls.length + 1}_${Date.now().toString(36)}`;

        toolCalls.push({
          id,
          function: {
            name: call.name,
            arguments: typeof call.args === "string" ? call.args : JSON.stringify(call.args || {}),
          },
        });
      }
    }
  }

  return toolCalls;
}

/**
 * Router harness that processes user requests and executes tool calls.
 * Loops until respond() tool is called, awaiting all tool calls and results per turn.
 * Yields standardized streaming events.
 */
export async function* runRouterHarness(context: RouterHarnessContext): AsyncGenerator<AgentOutputItem> {
  const { messages, llmCaller, archivist, haContextManager, abortSignal } = context;

  // 1. Get available tools
  const { langChainTools, toolDefinitions } = getRouterToolDefinitions(haContextManager);

  // 2. Prepare initial context
  let currentMessages = await prepareInitialContext(
    context.conversationId,
    messages,
    archivist,
    toolDefinitions,
    { ...(context.skipHistory !== undefined ? { skipHistory: context.skipHistory } : {}) }
  );

  const MAX_TURNS = 5;
  let turnCount = 0;

  while (turnCount < MAX_TURNS) {
    turnCount++;

    // 4. Emit LLM_CALL event
    yield {
      type: "llm_call",
      context: [...currentMessages] as any, // Yield a copy to avoid mutation issues
    };

    // 5. Call LLM with tools
    let aiMessage: AIMessage;
    try {
      if (llmCaller instanceof ChatOpenAILLMCaller) {
        aiMessage = await llmCaller.completeWithTools(
          currentMessages,
          {
            model: "router",
            temperature: 0,
            maxTokens: 1000,
            ...(abortSignal ? { abortSignal } : {}),
          },
          langChainTools
        );
      } else {
        throw new Error("Router harness requires ChatOpenAILLMCaller");
      }
    } catch (error) {
      yield {
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      };
      return;
    }

    // 6. Emit LLM_CALL_COMPLETE event
    const content = typeof aiMessage.content === "string" ? aiMessage.content : JSON.stringify(aiMessage.content);
    yield {
      type: "llm_call_complete",
      context: [...currentMessages] as any, // Yield a copy
      result: content,
    };

    // 7. Extract tool calls
    const toolCalls = extractToolCallsFromAIMessage(aiMessage);

    // 8. Add AI message to context
    currentMessages.push(aiMessage);

    // 9. If no tool calls, break
    if (toolCalls.length === 0) {
      break;
    }

    // 10. Emit TOOL_CALL events
    for (const toolCall of toolCalls) {
      yield {
        type: "tool_call",
        toolCall: {
          id: toolCall.id,
          function: {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          },
        },
      };
    }

    // 11. Execute tools sequentially
    const toolResults: Array<{ toolCallId: string; toolName: string; output: string }> = [];
    for (const toolCall of toolCalls) {
      const tool = langChainTools.find(t => t.name === toolCall.function.name) ?? null;
      const result = await executeTool(tool, toolCall, currentMessages);
      toolResults.push(result);
    }

    // 12. Emit TOOL_CALL_COMPLETE events
    for (const result of toolResults) {
      yield {
        type: "tool_call_complete",
        toolCall: {
          id: result.toolCallId,
          function: {
            name: result.toolName,
            arguments: toolCalls.find(tc => tc.id === result.toolCallId)?.function.arguments || "{}",
          },
        },
        result: result.output,
      };
    }

    // 13. Add tool messages to context
    const toolMessages = toolResults.map(result =>
      new LangChainToolMessage({
        content: result.output,
        tool_call_id: result.toolCallId,
        name: result.toolName,
      })
    );
    currentMessages.push(...toolMessages);

    // 14. Check if respond() was called
    if (toolCalls.some(call => call.function.name === "respond")) {
      break;
    }
  }

  if (turnCount >= MAX_TURNS) {
    yield {
      type: "error",
      error: "Router harness reached maximum turn limit",
    };
  }
}
