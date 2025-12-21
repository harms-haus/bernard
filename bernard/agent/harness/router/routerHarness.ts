import { SystemMessage, AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage, MessageStructure, MessageType } from "@langchain/core/messages";
import { ToolMessage as LangChainToolMessage } from "@langchain/core/messages";
import type { AgentOutputItem } from "../../streaming/types";
import type { LLMCaller, LLMConfig } from "../../llm/llm";
import { ChatOpenAILLMCaller } from "../../llm/chatOpenAI";
import { buildRouterSystemPrompt } from "./prompts";
import { getRouterTools } from "./tools";
import type { HomeAssistantContextManager } from "./tools/ha-context";
import type { HARestConfig } from "./tools/ha-list-entities";
import type { Archivist, MessageRecord } from "../../../lib/conversation/types";
import { messageRecordToBaseMessage } from "../../../lib/conversation/messages";
import { deduplicateMessages } from "../../../lib/conversation/dedup";
import crypto from "node:crypto";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { ToolWithInterpretation } from "./tools";
import { runResponseHarness } from "../respond/responseHarness";

/**
 * Validate tool calls from an AIMessage
 * Returns error only if there are tool calls and they are invalid
 */
function validateToolCalls(aiMessage: AIMessage, availableTools: string[]): { valid: boolean; error?: string } {
  const toolCalls = extractToolCallsFromAIMessage(aiMessage);

  // If no tool calls, response is valid (router will handle it by adding to context)
  if (toolCalls.length === 0) {
    return { valid: true };
  }

  // Check each tool call for validity
  for (const toolCall of toolCalls) {
    // Check if tool name is valid
    if (!availableTools.includes(toolCall.function.name)) {
      return { valid: false, error: `Invalid tool name: ${toolCall.function.name}. Available tools: ${availableTools.join(', ')}` };
    }

    // Check if parameters are valid JSON
    try {
      JSON.parse(toolCall.function.arguments);
    } catch (error) {
      return { valid: false, error: `Invalid JSON parameters for tool ${toolCall.function.name}: ${error}` };
    }
  }

  return { valid: true };
}

/**
 * Check if an error is a rate limit error
 */
function isRateLimitError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit');
}

/**
 * Check if an error is retryable (excludes auth errors and abort signals)
 */
function isRetryableError(error: unknown, abortSignal?: AbortSignal): boolean {
  // Don't retry on abort
  if (abortSignal?.aborted) {
    return false;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);

  // Don't retry auth errors
  if (errorMessage.includes('401') || errorMessage.includes('403')) {
    return false;
  }

  // Don't retry abort signals
  if (error instanceof Error && error.name === 'AbortError') {
    return false;
  }

  return true;
}

/**
 * Result of LLM call with retry logic
 */
type LLMRetryResult = {
  aiMessage: AIMessage;
  errorEvents: AgentOutputItem[];
};

/**
 * Call LLM with retry logic, returning the final AIMessage and any error events to yield
 */
export async function callLLMWithRetry(
  llmCaller: LLMCaller,
  messages: BaseMessage[],
  config: LLMConfig,
  langChainTools: StructuredToolInterface[],
  availableToolNames: string[],
  abortSignal?: AbortSignal
): Promise<LLMRetryResult> {
  const MAX_RETRIES = 3;
  let attempt = 0;
  let lastError: unknown;
  const errorEvents: AgentOutputItem[] = [];

  while (attempt < MAX_RETRIES) {
    attempt++;

    try {
      const aiMessage = await llmCaller.completeWithTools(
        messages,
        config,
        langChainTools
      );

      // Validate the response
      const validation = validateToolCalls(aiMessage, availableToolNames);

      if (!validation.valid) {
        // Invalid response - retry if we have attempts left
        if (attempt < MAX_RETRIES) {
          // Add error message to context for next attempt
          const errorMessage = new SystemMessage(`Error: ${validation.error}`);
          messages.push(errorMessage);

          // Record retry error event
          errorEvents.push({
            type: "error",
            error: `Retry ${attempt}/${MAX_RETRIES}: ${validation.error}`
          });

          // Wait 1 second before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        } else {
          // Max retries reached, return the invalid message anyway
          return { aiMessage, errorEvents };
        }
      }

      // Valid response
      return { aiMessage, errorEvents };

    } catch (error) {
      lastError = error;

      // Check if this is a retryable error
      if (!isRetryableError(error, abortSignal)) {
        // Non-retryable error - record error event and re-throw
        errorEvents.push({
          type: "error",
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }

      // Check if this is a rate limit error
      const isRateLimit = isRateLimitError(error);

      if (attempt < MAX_RETRIES) {
        // Add error message to context for next attempt
        const errorDescription = error instanceof Error ? error.message : String(error);
        const errorMessage = new SystemMessage(`Error: ${errorDescription}`);
        messages.push(errorMessage);

        // Record retry error event
        errorEvents.push({
          type: "error",
          error: `Retry ${attempt}/${MAX_RETRIES}: ${errorDescription}`
        });

        // Wait appropriate time based on error type
        if (isRateLimit) {
          // Exponential backoff for rate limits: 10s, 20s, 30s
          const waitTime = attempt * 10 * 1000;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          // 1 second wait for other errors
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        continue;
      }

      // Max retries reached - record final error and re-throw
      const errorDescription = error instanceof Error ? error.message : String(error);
      errorEvents.push({
        type: "error",
        error: `Max retries (${MAX_RETRIES}) exceeded: ${errorDescription}`
      });
      throw error;
    }
  }

  // This should never be reached, but just in case
  throw lastError || new Error("Retry logic failed unexpectedly");
}

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
  responseLLMCaller: LLMCaller;
  archivist: Archivist;
  haContextManager?: HomeAssistantContextManager;
  haRestConfig?: HARestConfig;
  abortSignal?: AbortSignal;
  skipHistory?: boolean;
  toolDefinitions?: ToolWithInterpretation[];
  usedTools?: string[];
};

/**
 * Get router tool definitions for the system prompt
 */
export function getRouterToolDefinitions(haContextManager?: HomeAssistantContextManager, haRestConfig?: HARestConfig) {
  const langChainTools = getRouterTools(haContextManager, haRestConfig);
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
  const { messages, llmCaller, responseLLMCaller, archivist, haContextManager, haRestConfig, abortSignal, toolDefinitions: providedToolDefinitions, usedTools: initialUsedTools } = context;

  // 1. Get available tools
  const { langChainTools, toolDefinitions } = getRouterToolDefinitions(haContextManager, haRestConfig);
  const usedTools = initialUsedTools || [];
  const toolNames = toolDefinitions.map(tool => tool.name);

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
      tools: toolNames,
    };

    // 5. Call LLM with tools (with retry logic)
    const llmConfig = {
      model: "router",
      temperature: 0,
      maxTokens: 1000,
      timeout: 30000, // 30 second timeout
      ...(abortSignal ? { abortSignal } : {}),
    };

    let aiMessage: AIMessage;

    try {
      // Use the retry wrapper - it returns the final AIMessage and any error events to yield
      const retryResult = await callLLMWithRetry(
        llmCaller,
        currentMessages,
        llmConfig,
        langChainTools,
        toolNames,
        abortSignal
      );

      // Yield any error events from retries
      for (const errorEvent of retryResult.errorEvents) {
        yield errorEvent;
      }

      aiMessage = retryResult.aiMessage;
    } catch (error) {
      // Final error after retries exhausted
      yield {
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      };
      return;
    }

    // 6. Emit LLM_CALL_COMPLETE event
    yield {
      type: "llm_call_complete",
      context: [...currentMessages] as any, // Yield a copy
      result: aiMessage as any,
    };

    // 7. Extract tool calls
    const toolCalls = extractToolCallsFromAIMessage(aiMessage);

    // 8. If no tool calls, add AI message to context and break
    if (toolCalls.length === 0) {
      currentMessages.push(aiMessage);
      break;
    }

    // 9. Emit TOOL_CALL events (for streaming, but not added to recorded context)
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

    // 10. Execute tools sequentially
    const toolResults: Array<{ toolCallId: string; toolName: string; output: string }> = [];
    let respondCalled = false;

    for (const toolCall of toolCalls) {
      if (toolCall.function.name === "respond") {
        respondCalled = true;
        // Add a placeholder result for respond() tool
        toolResults.push({
          toolCallId: toolCall.id,
          toolName: "respond",
          output: "Ready to respond"
        });
        continue;
      }

      const tool = langChainTools.find(t => t.name === toolCall.function.name) ?? null;
      const result = await executeTool(tool, toolCall, currentMessages);
      toolResults.push(result);

      // Track used tools (exclude respond tool)
      if (!usedTools.includes(toolCall.function.name)) {
        usedTools.push(toolCall.function.name);
      }
    }

    // 11. Emit TOOL_CALL_COMPLETE events (for streaming, but not added to recorded context)
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

    // 12. Create combined assistant message with tool calls and results
    let combinedContent = "";

    // Include original AI message content if it exists
    const aiContent = typeof aiMessage.content === 'string' ? aiMessage.content : '';
    if (aiContent && aiContent.trim()) {
      combinedContent += aiContent.trim() + "\n\n";
    }

    // Add formatted tool calls and results
    const toolContent = toolCalls.map((toolCall, index) => {
      const result = toolResults.find(r => r.toolCallId === toolCall.id);
      if (!result) return null;

      // Parse the arguments JSON and format as map without quotes
      let formattedArgs: string;
      try {
        const args = JSON.parse(toolCall.function.arguments);
        formattedArgs = Object.entries(args)
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
          .join(", ");
      } catch {
        formattedArgs = toolCall.function.arguments;
      }

      return new SystemMessage<MessageStructure>({
        content: `${toolCall.function.name}({${formattedArgs}})\n${result?.output ?? ""}`,
        name: toolCall.function.name,
      });
    });

    currentMessages.push(...toolContent.filter(tc => tc !== null));

    // 14. Check if respond() was called
    if (respondCalled) {
      // Execute response harness with accumulated context
      const responseHarness = runResponseHarness({
        conversationId: context.conversationId,
        messages: currentMessages, // Full context including tool calls/results
        llmCaller: responseLLMCaller,
        archivist,
        skipHistory: false, // Use the full history including tool calls/results from this turn
        ...(providedToolDefinitions || langChainTools ? { toolDefinitions: providedToolDefinitions || langChainTools } : {}),
        ...(usedTools.length > 0 ? { usedTools } : {}),
        ...(abortSignal ? { abortSignal } : {})
      });

      // Yield all response harness events
      for await (const event of responseHarness) {
        yield event;
      }

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
