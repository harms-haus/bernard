import { SystemMessage, HumanMessage, ToolMessage, AIMessage } from "@langchain/core/messages";
import type { BaseMessage, MessageStructure } from "@langchain/core/messages";
import type { AgentOutputItem } from "@/agent/streaming/types";
import type { LLMCaller, LLMConfig } from "@/agent/llm/llm";
import { buildRouterSystemPrompt } from "./prompts";
import type { ToolWithInterpretation } from "@/agent/tool";
import { getRouterTools } from "@/agent/tool";
import type { HomeAssistantContextManager } from "@/lib/home-assistant";
import type { HARestConfig } from "@/agent/tool/home-assistant-list-entities.tool";
import type { PlexConfig } from "@/lib/plex";
import type { Archivist, MessageRecord } from "@/lib/conversation/types";
import { messageRecordToBaseMessage } from "@/lib/conversation/messages";
import { deduplicateMessages } from "@/lib/conversation/dedup";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { runResponseHarness } from "@/agent/harness/respond/responseHarness";
import type { RouterContext, ResponseContext } from "@/lib/conversation/context";
import { countTokens } from "@/lib/conversation/tokenCounter";
import { getSettings } from "@/lib/config/settingsCache";

/**
 * Format tool calls and results into SystemMessage objects for LLM context.
 * This merges tool_call and tool_call_complete information into single context messages.
 */
export function formatToolResultsForContext(
  toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>,
  toolResults: Array<{ toolCallId: string; toolName: string; output: string }>,
  excludeToolNames: string[] = []
): SystemMessage<MessageStructure>[] {
  return toolCalls
    .filter(toolCall => !excludeToolNames.includes(toolCall.function.name))
    .map((toolCall) => {
      const result = toolResults.find(r => r.toolCallId === toolCall.id);
      if (!result) return null;

      // Parse the arguments JSON and format as map without quotes
      let formattedArgs: string;
      try {
        const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
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
    })
    .filter((msg): msg is SystemMessage<MessageStructure> => msg !== null);
}

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
      return { valid: false, error: `Invalid JSON parameters for tool ${toolCall.function.name}: ${error instanceof Error ? error.message : String(error)}` };
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
  if (lastError instanceof Error) {
    throw lastError;
  }
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(lastError ? `Retry failed: ${lastError instanceof Error ? lastError.message : JSON.stringify(lastError)}` : "Retry logic failed unexpectedly");
}

// Define the tool definition type for system prompts
type ToolLikeForPrompt = {
  name: string;
  description?: string;
  schema?: unknown;
};


export type RouterHarnessContext = {
  conversationId: string;
  routerContext: RouterContext;
  responseContext: ResponseContext;
  messages: BaseMessage[];
  llmCaller: LLMCaller;
  responseLLMCaller: LLMCaller;
  haContextManager?: HomeAssistantContextManager;
  haRestConfig?: HARestConfig;
  plexConfig?: PlexConfig;
  abortSignal?: AbortSignal;
  toolDefinitions?: ToolWithInterpretation[];
  usedTools?: string[];
  taskContext?: {
    conversationId: string;
    userId: string;
    createTask: (toolName: string, args: Record<string, unknown>, settings: Record<string, unknown>) => Promise<{ taskId: string; taskName: string }>;
  };
};

/**
 * Get router tool definitions for the system prompt
 */
export function getRouterToolDefinitions(
  haContextManager?: HomeAssistantContextManager,
  haRestConfig?: HARestConfig,
  plexConfig?: unknown, // We don't use this anymore, but keeping for compatibility
  taskContext?: {
    conversationId: string;
    userId: string;
    createTask: (toolName: string, args: Record<string, unknown>, settings: Record<string, unknown>) => Promise<{ taskId: string; taskName: string }>;
  }
) {
  const langChainTools = getRouterTools(haContextManager, haRestConfig, undefined, taskContext);
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

  const filteredMessages = contextMessages.filter(msg => msg.name !== "llm_call" && msg.name !== "llm_call_complete" && msg.name !== "respond");

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
  currentContext: BaseMessage[],
  statusService?: { setStatus: (msg: string, done?: boolean, hidden?: boolean) => void; setStatusPool: (msgs: string[], done?: boolean, hidden?: boolean) => void }
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
    args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
  } catch (error) {
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.function.name,
      output: `Error: Invalid tool arguments: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  try {
    const result = await tool.invoke(args, {
      configurable: {
        conversationMessages: currentContext,
        ...(statusService && { statusService }),
      },
    }) as unknown;

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
 * Always calls response harness even in error scenarios.
 */
export async function* runRouterHarness(context: RouterHarnessContext): AsyncGenerator<AgentOutputItem> {
  const { routerContext, messages, llmCaller, responseLLMCaller, haContextManager, haRestConfig, plexConfig, abortSignal, toolDefinitions: providedToolDefinitions, usedTools: initialUsedTools, taskContext } = context;

  // 1. Get available tools
  const { langChainTools, toolDefinitions } = getRouterToolDefinitions(haContextManager, haRestConfig, plexConfig, taskContext);
  const usedTools = initialUsedTools || [];
  const toolNames = toolDefinitions.map(tool => tool.name);

  // 2. Process incoming messages in router context
  for (const message of messages) {
    // Convert BaseMessage to MessageRecord for context processing
    let role: 'user' | 'assistant' | 'system' | 'tool';
    let name: string | undefined;
    let tool_call_id: string | undefined;
    let tool_calls: unknown[] | undefined;

    if (message instanceof AIMessage) {
      role = 'assistant';
      tool_calls = message.tool_calls;
    } else if (message instanceof HumanMessage) {
      role = 'user';
    } else if (message instanceof ToolMessage) {
      role = 'tool';
      name = message.name;
      tool_call_id = message.tool_call_id;
    } else if (message instanceof SystemMessage) {
      role = 'system';
    } else {
      role = 'system'; // fallback
    }

    const messageRecord: MessageRecord = {
      id: `temp_${Date.now()}_${Math.random()}`,
      role,
      content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
      createdAt: new Date().toISOString(),
      ...(name && { name }),
      ...(tool_call_id && { tool_call_id }),
      ...(tool_calls && { tool_calls })
    };
    routerContext.processMessage(messageRecord);
  }

  // 3. Get current messages from router context
  let currentMessages = routerContext.getMessages();

  const MAX_TURNS = 100; // Very high limit, effectively unlimited but prevents infinite loops
  let turnCount = 0;
  let respondCalled = false;
  let currentTurnToolMessages: BaseMessage[] = [];
  let harnessCompletedNormally = false;
  const toolCallCounts: Map<string, number> = new Map(); // Track identical tool calls
  let accumulatedRequestTokens = 0; // Track tokens accumulated in this request


  try {
    // Get token limit settings once for the harness execution
    const settings = await getSettings();
    const currentRequestMaxTokens = settings.limits.currentRequestMaxTokens;

    // Initialize accumulated request tokens with the user input
    accumulatedRequestTokens = countTokens(messages);

    while (turnCount < MAX_TURNS) {
      turnCount++;

      // Check if current request exceeds maximum tokens
      const routerContextTokens = countTokens(currentMessages);
      if (accumulatedRequestTokens > currentRequestMaxTokens) {
        // Force response harness call when token limit exceeded
        respondCalled = true;

        // Set reason on response context
        context.responseContext.setReason("ran out of tokens");

        // Create and execute response harness
        const responseHarness = runResponseHarness({
          conversationId: context.conversationId,
          responseContext: context.responseContext,
          messages: currentTurnToolMessages, // Only tool results from current turn
          llmCaller: responseLLMCaller,
          reason: "ran out of tokens",
          ...(providedToolDefinitions || langChainTools ? { toolDefinitions: providedToolDefinitions || langChainTools } : {}),
          ...(usedTools.length > 0 ? { usedTools } : {}),
          ...(abortSignal ? { abortSignal } : {})
        });

        // Yield all response harness events
        for await (const event of responseHarness) {
          yield event;
        }

        harnessCompletedNormally = true;
        return; // Exit successfully after response harness
      }

      // 4b. Calculate total context tokens (including system message and historical messages)
      const totalContextTokens = countTokens(currentMessages);

      // 4c. Create token info system message (not recorded in recordKeeper)
      const tokenPercentage = ((accumulatedRequestTokens / currentRequestMaxTokens) * 100).toFixed(2);
      const tokenInfoMessage = new SystemMessage({
        content: `Current request tokens: ${accumulatedRequestTokens}/${currentRequestMaxTokens} (${tokenPercentage}%). Router context tokens: ${routerContextTokens}. Total context tokens: ${totalContextTokens}.`,
        name: "token_info" // Special name to identify this as token info (not for recording)
      });

      // Add token info message to current messages for this LLM call only
      currentMessages = [...currentMessages, tokenInfoMessage];

      // Record start time for LLM call duration tracking
      const llmStartTime = Date.now();

      // 4d. Emit LLM_CALL event (exclude token_info message from recorded context)
      const contextForRecording = currentMessages.filter(msg => msg.name !== "token_info");
      yield {
        type: "llm_call",
        model: "router",
        context: [...contextForRecording],
        tools: toolNames,
        totalContextTokens,
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
        // Force response harness call on error
        break;
      }

      // Calculate LLM call duration
      const llmDurationMs = Date.now() - llmStartTime;

      // 6. Extract actual token usage from the LLM response
      const responseMetadata = aiMessage.response_metadata;
      const usage = responseMetadata?.["usage"] as
        | { prompt_tokens: number; completion_tokens: number; total_tokens: number }
        | undefined;

      const actualTokens = usage ? {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      } : undefined;

      // 7. Emit LLM_CALL_COMPLETE event
      const completeEvent: AgentOutputItem = {
        type: "llm_call_complete",
        context: [...currentMessages],
        result: aiMessage,
        latencyMs: llmDurationMs,
      };
      if (actualTokens && completeEvent.type === "llm_call_complete") {
        completeEvent.actualTokens = actualTokens;
      }
      yield completeEvent;

      // 7. Extract tool calls
      const toolCalls = extractToolCallsFromAIMessage(aiMessage);

      // 8. If no tool calls at all, force respond() call instead of breaking normally
      if (toolCalls.length === 0) {
        // Add the AI message to context for the response harness
        currentMessages.push(aiMessage);

        // Force response harness call
        respondCalled = true;

        // Set reason on response context
        context.responseContext.setReason("no tool calls returned");

        // Create and execute response harness
        const responseHarness = runResponseHarness({
          conversationId: context.conversationId,
          responseContext: context.responseContext,
          messages: currentTurnToolMessages, // Only tool results from current turn
          llmCaller: responseLLMCaller,
          reason: "no tool calls returned",
          ...(providedToolDefinitions || langChainTools ? { toolDefinitions: providedToolDefinitions || langChainTools } : {}),
          ...(usedTools.length > 0 ? { usedTools } : {}),
          ...(abortSignal ? { abortSignal } : {})
        });

        // Yield all response harness events
        for await (const event of responseHarness) {
          yield event;
        }

        harnessCompletedNormally = true;
        return; // Exit successfully after response harness
      }

      // 9. Check for identical tool call limit (max 2 identical calls)
      const validToolCalls: typeof toolCalls = [];
      for (const toolCall of toolCalls) {
        if (toolCall.function.name === "respond") {
          // respond tool is always allowed
          validToolCalls.push(toolCall);
          continue;
        }

        // Create a key for identical calls: tool name + arguments
        const callKey = `${toolCall.function.name}:${toolCall.function.arguments}`;
        const currentCount = toolCallCounts.get(callKey) || 0;

        if (currentCount >= 2) {
          // Skip this tool call - it's exceeded the limit
          yield {
            type: "error",
            error: `Identical tool call limit exceeded: ${toolCall.function.name} with arguments ${toolCall.function.arguments}`,
          };
          continue;
        }

        validToolCalls.push(toolCall);
        toolCallCounts.set(callKey, currentCount + 1);
      }

      // 10. If no valid tool calls (all were filtered due to identical call limits), force response
      if (validToolCalls.length === 0) {
        respondCalled = true;

        // Set reason on response context
        context.responseContext.setReason("duplicate tool calls");

        // Create and execute response harness
        const responseHarness = runResponseHarness({
          conversationId: context.conversationId,
          responseContext: context.responseContext,
          messages: currentTurnToolMessages, // Only tool results from current turn
          llmCaller: responseLLMCaller,
          reason: "duplicate tool calls",
          ...(providedToolDefinitions || langChainTools ? { toolDefinitions: providedToolDefinitions || langChainTools } : {}),
          ...(usedTools.length > 0 ? { usedTools } : {}),
          ...(abortSignal ? { abortSignal } : {})
        });

        // Yield all response harness events
        for await (const event of responseHarness) {
          yield event;
        }

        harnessCompletedNormally = true;
        return; // Exit successfully after response harness
      }

      // 11. Emit TOOL_CALL events (for streaming, but not added to recorded context)
      for (const toolCall of validToolCalls) {
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

      // Status messages are handled by individual tools

      // 12. Execute tools sequentially
      const toolResults: Array<{ toolCallId: string; toolName: string; output: string; latencyMs?: number }> = [];

      for (const toolCall of validToolCalls) {
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

        // Record start time for tool call duration tracking
        const toolStartTime = Date.now();

        const tool = langChainTools.find(t => t.name === toolCall.function.name) ?? null;
        const result = await executeTool(tool, toolCall, currentMessages);

        // Calculate tool call duration
        const toolDurationMs = Date.now() - toolStartTime;

        toolResults.push({
          ...result,
          latencyMs: toolDurationMs
        });

        // Track used tools (exclude respond tool)
        if (!usedTools.includes(toolCall.function.name)) {
          usedTools.push(toolCall.function.name);
        }
      }

      // 11. Emit TOOL_CALL_COMPLETE events (for streaming, but not added to recorded context)
      for (const result of toolResults) {
        const completeEvent: AgentOutputItem = {
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
        if (result.latencyMs !== undefined && completeEvent.type === "tool_call_complete") {
          completeEvent.latencyMs = result.latencyMs;
        }
        yield completeEvent;
      }

      // All tools completed

      // 13. Add formatted tool calls and results (excluding respond tool)
      currentTurnToolMessages = formatToolResultsForContext(validToolCalls, toolResults, ["respond"]);
      const toolMessageTokens = countTokens(currentTurnToolMessages);
      const tokensBeforePush = countTokens(currentMessages);
      currentMessages.push(...currentTurnToolMessages);
      const tokensAfterPush = countTokens(currentMessages);

      // Accumulate tokens for this request
      accumulatedRequestTokens += toolMessageTokens;

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f79e55ca-acc5-49c9-82aa-eba6a64474bf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routerHarness.ts:708',message:'Context growth after tool results',data:{turnCount,tokensBeforePush,tokensAfterPush,toolMessageTokens,accumulatedRequestTokens,toolMessagesAdded:currentTurnToolMessages.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      // 15. Check if respond() was called
      if (respondCalled) {
        // Execute response harness with only the current turn's tool results
        // The response harness will fetch conversation history separately
        const responseHarness = runResponseHarness({
          conversationId: context.conversationId,
          responseContext: context.responseContext,
          messages: currentTurnToolMessages, // Only tool results from current turn
          llmCaller: responseLLMCaller,
          ...(providedToolDefinitions || langChainTools ? { toolDefinitions: providedToolDefinitions || langChainTools } : {}),
          ...(usedTools.length > 0 ? { usedTools } : {}),
          ...(abortSignal ? { abortSignal } : {})
        });

        // Yield all response harness events
        for await (const event of responseHarness) {
          yield event;
        }

        harnessCompletedNormally = true;
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/f79e55ca-acc5-49c9-82aa-eba6a64474bf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routerHarness.ts:471',message:'Router harness terminated due to token limit',data:{turnCount,accumulatedRequestTokens,currentRequestMaxTokens},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        return; // Exit successfully after response harness
      }

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f79e55ca-acc5-49c9-82aa-eba6a64474bf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routerHarness.ts:733',message:'Loop continuing to next turn',data:{turnCount,accumulatedRequestTokens,currentRequestMaxTokens},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    }

    if (turnCount >= MAX_TURNS) {
      yield {
        type: "error",
        error: "Router harness reached maximum turn limit",
      };
    }
  } finally {
    // Force response harness call only if harness was interrupted or failed
    // Don't call it if the harness completed normally without calling respond
    if (!respondCalled && !harnessCompletedNormally) {
      try {
        // Set reason on response context
        context.responseContext.setReason("router harness failed or was interrupted");

        const responseHarness = runResponseHarness({
          conversationId: context.conversationId,
          responseContext: context.responseContext,
          messages: currentTurnToolMessages, // May be empty if we failed early
          llmCaller: responseLLMCaller,
          reason: "router harness failed or was interrupted",
          ...(providedToolDefinitions || langChainTools ? { toolDefinitions: providedToolDefinitions || langChainTools } : {}),
          ...(usedTools.length > 0 ? { usedTools } : {}),
          ...(abortSignal ? { abortSignal } : {})
        });

        // Yield all response harness events
        for await (const event of responseHarness) {
          yield event;
        }
      } catch (error) {
        // If response harness also fails, yield a final error
        yield {
          type: "error",
          error: `Failed to generate response: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  }
}
