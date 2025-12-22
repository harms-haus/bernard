import { SystemMessage, AIMessage } from "@langchain/core/messages";
import type { SystemMessage as SystemMessageType } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { AgentOutputItem } from "../../streaming/types";
import type { LLMCaller } from "../../llm/llm";
import { buildResponseSystemPrompt } from "./prompts";
import type { Archivist, MessageRecord } from "@/lib/conversation/types";
import { messageRecordToBaseMessage } from "@/lib/conversation/messages";
import { deduplicateMessages } from "@/lib/conversation/dedup";
import type { ResponseContext } from "@/lib/conversation/context";
import crypto from "node:crypto";

function uniqueId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}


import type { ToolWithInterpretation } from "../router/tools";

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
};

/**
 * Response harness that generates streaming text responses.
 * Yields standardized streaming events.
 */
export async function* runResponseHarness(context: ResponseHarnessContext): AsyncGenerator<AgentOutputItem> {
  const { responseContext, messages, llmCaller, conversationId, abortSignal, toolDefinitions, usedTools } = context;

  // 1. Process incoming messages in response context
  for (const message of messages) {
    // Convert BaseMessage to MessageRecord for context processing
    const messageRecord: MessageRecord = {
      id: `temp_${Date.now()}_${Math.random()}`,
      role: (message as any).type === 'ai' ? 'assistant' : (message as any).type === 'human' ? 'user' : (message as any).type === 'tool' ? 'tool' : 'system',
      content: message.content,
      createdAt: new Date().toISOString(),
      name: (message as any).name,
      tool_call_id: (message as any).tool_call_id,
      tool_calls: (message as any).tool_calls
    };
    responseContext.processMessage(messageRecord);
  }

  // 2. Get context messages from response context (includes system prompt)
  const promptMessages = responseContext.getMessages();

  // 3. Extract tool names for the event
  const toolNames = toolDefinitions?.map(tool => tool.name) ?? [];

  // 4. Calculate total context tokens
  const { countTokens } = await import("../../../lib/conversation/tokenCounter");
  const totalContextTokens = countTokens(promptMessages);

  // 5. Emit LLM_CALL event
  yield {
    type: "llm_call",
    model: "response",
    context: promptMessages as any,
    tools: toolNames,
    totalContextTokens,
  };

  // 4. Stream Tokens
  let responseContent = "";
  let finishReason: "stop" | "length" | "content_filter" | undefined;
  const messageId = uniqueId("msg");

  try {
    for await (const token of llmCaller.streamText(promptMessages, {
      model: "response-generator",
      temperature: 0.7,
      maxTokens: 1000,
      timeout: 60000, // 60 second timeout for streaming responses
      ...(abortSignal ? { abortSignal } : {}),
    })) {
      responseContent += token;

      // 5. Emit DELTA event
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

  // 6. Emit final DELTA with finish_reason
  yield {
    type: "delta",
    messageId,
    delta: "",
    finishReason,
  };

  // 7. Emit LLM_CALL_COMPLETE event
  const aiMessage = new AIMessage({
    content: responseContent,
    id: messageId,
  });
  yield {
    type: "llm_call_complete",
    context: promptMessages as any,
    result: aiMessage as any,
  };
}

