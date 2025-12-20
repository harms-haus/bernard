import { SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { AgentOutputItem } from "../../streaming/types";
import type { LLMCaller } from "../../llm/llm";
import { buildResponseSystemPrompt } from "./prompts";
import type { Archivist, MessageRecord } from "@/lib/conversation/types";
import { messageRecordToBaseMessage } from "@/lib/conversation/messages";
import { deduplicateMessages } from "@/lib/conversation/dedup";
import crypto from "node:crypto";

function uniqueId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

/**
 * Context passed to the response harness
 */
export type ResponseHarnessContext = {
  conversationId: string;
  messages: BaseMessage[];
  llmCaller: LLMCaller;
  archivist: Archivist;
  abortSignal?: AbortSignal;
  skipHistory?: boolean;
};

/**
 * Response harness that generates streaming text responses.
 * Yields standardized streaming events.
 */
export async function* runResponseHarness(context: ResponseHarnessContext): AsyncGenerator<AgentOutputItem> {
  const { messages, llmCaller, archivist, conversationId, abortSignal } = context;

  // 1. Get conversation history
  let history: MessageRecord[];
  try {
    history = context.skipHistory ? [] : await archivist.getMessages(conversationId, {
      limit: 20
    });
  } catch (error) {
    console.error("Error fetching conversation history:", error);
    history = [];
  }

  // 2. Build context
  const systemPrompt = buildResponseSystemPrompt();
  const historyMessages = history.map(msg => messageRecordToBaseMessage(msg)).filter((m): m is BaseMessage => m !== null);
  const contextMessages = deduplicateMessages([...historyMessages, ...messages.filter(msg => msg.type !== "system")]);

  const promptMessages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    ...contextMessages,
  ];

  // 3. Emit LLM_CALL event
  yield {
    type: "llm_call",
    context: promptMessages as any,
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
  yield {
    type: "llm_call_complete",
    context: promptMessages as any,
    result: responseContent,
  };
}
