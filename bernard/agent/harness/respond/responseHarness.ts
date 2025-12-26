import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { AgentOutputItem } from "../../streaming/types";
import type { LLMCaller } from "../../llm/llm";
import type { MessageRecord } from "@/lib/conversation/types";
import type { ResponseContext } from "@/lib/conversation/context";
import crypto from "node:crypto";

function uniqueId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}


import type { ToolWithInterpretation } from "../../tool";

/**
 * Context passed to the response harness
 */
export type ResponseHarnessContext = {
  conversationId: string;
  responseContext: ResponseContext;
  messages: BaseMessage[];
  llmCaller: LLMCaller;
  abortSignal?: AbortSignal;
  toolDefinitions?: ToolWithInterpretation[];
  usedTools?: string[]; // Tool names that were executed in this conversation
  reason?: string; // Optional reason for why response was forced
};

/**
 * Response harness that generates streaming text responses.
 * Yields standardized streaming events.
 */
export async function* runResponseHarness(context: ResponseHarnessContext): AsyncGenerator<AgentOutputItem> {
  const { responseContext, messages, llmCaller, abortSignal, toolDefinitions } = context;

  // 1. Process incoming messages in response context
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
    responseContext.processMessage(messageRecord);
  }

  // 2. Get context messages from response context (includes system prompt)
  const promptMessages = responseContext.getMessages();

  // 3. Extract tool names for the event
  const toolNames = toolDefinitions?.map(tool => tool.name) ?? [];

  // 4. Get response max tokens setting
  const { getSettings } = await import("../../../lib/config/settingsCache");
  const settings = await getSettings();
  const responseMaxTokens = settings.limits.responseMaxTokens;

  // 5. Calculate total context tokens
  const { countTokens } = await import("../../../lib/conversation/tokenCounter");
  const totalContextTokens = countTokens(promptMessages);

  // Record start time for LLM call duration tracking
  const llmStartTime = Date.now();

  // 6. Emit LLM_CALL event
  yield {
    type: "llm_call",
    model: "response",
    context: [...promptMessages],
    tools: toolNames,
    totalContextTokens,
  };

  // 7. Stream Tokens
  let responseContent = "";
  let finishReason: "stop" | "length" | "content_filter" | undefined;
  const messageId = uniqueId("msg");

  try {
    for await (const token of llmCaller.streamText(promptMessages, {
      model: "response-generator",
      temperature: 0.7,
      maxTokens: responseMaxTokens,
      timeout: 60000, // 60 second timeout for streaming responses
      ...(abortSignal ? { abortSignal } : {}),
    })) {
      responseContent += token;

      // 8. Emit DELTA event
      yield {
        type: "delta",
        messageId,
        delta: token,
      };
    }

    finishReason = "stop";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      finishReason = "stop";
    } else {
      yield {
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      };
      finishReason = "stop";
    }
  }

  // 9. Emit final DELTA with finish_reason
  yield {
    type: "delta",
    messageId,
    delta: "",
    finishReason,
  };

  // 10. Estimate token usage (since streaming doesn't provide actual counts)
  const outputTokens = Math.ceil(responseContent.length / 4); // Rough estimate: ~4 chars per token
  const actualTokens = {
    promptTokens: totalContextTokens,
    completionTokens: outputTokens,
    totalTokens: totalContextTokens + outputTokens,
  };

  // Calculate LLM call duration
  const llmDurationMs = Date.now() - llmStartTime;

  // 11. Emit LLM_CALL_COMPLETE event
  const aiMessage = new AIMessage({
    content: responseContent,
    id: messageId,
  });
  yield {
    type: "llm_call_complete",
    context: [...promptMessages],
    result: aiMessage,
    actualTokens,
    latencyMs: llmDurationMs,
  };
}

