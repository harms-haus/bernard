import type { BaseMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { ToolMessage as LangChainToolMessage } from "@langchain/core/messages";
import type { AgentOutputItem } from "../../streaming/types";
import type { LLMCaller } from "../../llm/llm";
import { ChatOpenAILLMCaller } from "../../llm/chatOpenAI";
import { buildIntentSystemPrompt } from "./prompts";
import { getIntentTools } from "./tools";
import type { HomeAssistantContextManager } from "./tools/ha-context";

/**
 * Context passed to the intent harness
 */
export type IntentHarnessContext = {
  conversationId: string;
  messages: BaseMessage[];
  llmCaller: LLMCaller;
  haContextManager?: HomeAssistantContextManager;
  abortSignal?: AbortSignal;
};

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
        toolCalls.push({
          id: call.id || `call_${toolCalls.length + 1}`,
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
 * Intent harness that processes user requests and executes tool calls.
 * Loops until respond() tool is called, awaiting all tool calls and results per turn.
 * Yields streaming events for LLM prompts, tool calls, and tool results.
 */
export async function* runIntentHarness(context: IntentHarnessContext): AsyncGenerator<AgentOutputItem> {
  const { messages, llmCaller, haContextManager, abortSignal } = context;

  // Get available tools (now native LangChain tools)
  const langChainTools = getIntentTools(haContextManager);

  // Build system prompt
  const toolDefinitions = langChainTools.map(tool => ({
    name: tool.name,
    description: tool.description || "",
    schema: tool.schema,
  }));

  const systemPrompt = buildIntentSystemPrompt(new Date(), toolDefinitions);

  // Create initial message context with system prompt
  // Filter out any existing system messages from the conversation history
  const { SystemMessage } = await import("@langchain/core/messages");
  const systemMessage = new SystemMessage(systemPrompt);
  let currentMessages: BaseMessage[] = [
    systemMessage,
    ...messages.filter(msg => msg.type !== "system")
  ];

  const MAX_TURNS = 10; // Safety limit
  let turnCount = 0;

  // Loop until respond() is called or max turns reached
  while (turnCount < MAX_TURNS) {
    turnCount++;

    // Create prompt context for logging
    const promptContext = [
      { role: "system", content: systemPrompt },
      ...currentMessages.slice(1).map(msg => ({
        role: msg.type === "human" ? "user" : msg.type === "assistant" ? "assistant" : "tool" as const,
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
      })),
    ];

    // Yield current context for recording
    yield {
      type: "context_update",
      context: [...currentMessages],
    };

    // Yield LLM prompt trace
    yield {
      type: "llm_prompt",
      prompt: JSON.stringify(promptContext, null, 2),
      model: "intent-router",
    };

    // Call LLM with tools bound - need to use ChatOpenAILLMCaller's completeWithTools
    let aiMessage: AIMessage;
    if (llmCaller instanceof ChatOpenAILLMCaller) {
      aiMessage = await llmCaller.completeWithTools(currentMessages, {
        model: "intent-router",
        temperature: 0, // Deterministic tool selection
        maxTokens: 1000,
        ...(abortSignal ? { abortSignal } : {}),
      }, langChainTools);
    } else {
      throw new Error("Intent harness requires ChatOpenAILLMCaller for tool calling support");
    }

    // Extract tool calls from AIMessage
    const toolCalls = extractToolCallsFromAIMessage(aiMessage);

    // Check if respond() was called
    const hasRespondCall = toolCalls.some(call => call.function.name === "respond");

    // Add AI message to context
    currentMessages.push(aiMessage);

    // If no tool calls (or only respond), we're done
    if (toolCalls.length === 0 || hasRespondCall) {
      // If respond() was called, we're done - don't yield it, just break
      break;
    }

    // Yield all tool calls first
    for (const toolCall of toolCalls) {
      yield {
        type: "tool_call",
        toolCall,
      };
    }

    // Execute all tool calls in parallel and await all results
    const toolResults = await Promise.all(
      toolCalls.map(async (toolCall) => {
        try {
          const tool = langChainTools.find(t => t.name === toolCall.function.name);
          if (!tool) {
            return {
              toolCallId: toolCall.id,
              output: `Error: Tool '${toolCall.function.name}' not found`,
            };
          }

          // Parse arguments
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch (error) {
            return {
              toolCallId: toolCall.id,
              output: `Error: Invalid tool arguments: ${error}`,
            };
          }

          // Execute tool with conversation context (await the result from local code)
          const result = await tool.invoke(args, { configurable: { conversationMessages: currentMessages } });

          return {
            toolCallId: toolCall.id,
            output: typeof result === "string" ? result : JSON.stringify(result),
          };
        } catch (error) {
          return {
            toolCallId: toolCall.id,
            output: `Error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      })
    );

    // Yield all tool results
    for (const result of toolResults) {
      yield {
        type: "tool_output",
        toolCallId: result.toolCallId,
        output: result.output,
      };
    }

    // Add tool messages to context for next turn
    const toolMessages: ToolMessage[] = toolResults.map(result =>
      new LangChainToolMessage({
        content: result.output,
        tool_call_id: result.toolCallId,
      })
    );
    currentMessages.push(...toolMessages);
  }

  // Yield one last time to ensure any final AI messages or tool results are captured
  yield {
    type: "context_update",
    context: [...currentMessages],
  };

  if (turnCount >= MAX_TURNS) {
    yield {
      type: "error",
      error: "Intent harness reached maximum turn limit",
    };
  }
}
