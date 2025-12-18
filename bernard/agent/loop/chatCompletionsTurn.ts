import { AIMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { AgentOutputItem, StreamingChunk, OpenAIStreamingChunk, BernardTraceChunk } from "../streaming/types";
import { createDelegateSequencer } from "../streaming/delegateSequencer";
import { createSSEStream } from "../streaming/sse";
import { runIntentHarness } from "../harness/intent/intentHarness";
import { runResponseHarness } from "../harness/respond/responseHarness";
import type { LLMCaller } from "../llm/llm";
import type { RecordKeeper } from "@/lib/conversation/recordKeeper";

/**
 * Context for a chat completion turn
 */
export type ChatCompletionTurnContext = {
  conversationId: string;
  requestId?: string;
  turnId?: string;
  model?: string;
  messages: BaseMessage[];
  intentLLMCaller: LLMCaller;
  responseLLMCaller: LLMCaller;
  recordKeeper: RecordKeeper;
  abortSignal?: AbortSignal;
  includeUsage?: boolean;
};

/**
 * Result of running a chat completion turn
 */
export type ChatCompletionTurnResult = {
  stream: ReadableStream<Uint8Array>;
  finalMessages: Promise<BaseMessage[]>;
};

/**
 * Runs a complete chat completion turn by chaining intent and response harnesses.
 * Returns a streaming response that emits events in real-time.
 */
export async function runChatCompletionTurn(
  context: ChatCompletionTurnContext
): Promise<ChatCompletionTurnResult> {
  const { conversationId, requestId, turnId, model, messages, intentLLMCaller, responseLLMCaller, recordKeeper, abortSignal, includeUsage } = context;

  // Create a sequencer to chain harness streams
  const sequencer = createDelegateSequencer<AgentOutputItem>();

  // Record the user input
  await recordKeeper.appendMessages(conversationId, messages);

  // Track the context to pass between harnesses
  let messagesForResponse: BaseMessage[] = messages;

  // Run intent harness first to collect tool results and yield events

  const intentHarnessGenerator = (async function* () {
    let currentContext: BaseMessage[] = messages;

    const intentHarness = runIntentHarness({
      conversationId,
      messages,
      llmCaller: intentLLMCaller,
      ...(abortSignal ? { abortSignal } : {}),
    });

    for await (const event of intentHarness) {
      if (event.type === "context_update") {
        currentContext = event.context;
      } else if (event.type === "tool_call") {
        // ... (existing tool call handling)
        let toolArgs = {};
        try {
          toolArgs = JSON.parse(event.toolCall.function.arguments);
        } catch {
          // Fallback if not valid JSON
        }

        // Create the AI message with tool calls
        const aiMessageWithToolCall = new AIMessage({
          content: "",
          tool_calls: [{
            id: event.toolCall.id,
            name: event.toolCall.function.name,
            args: toolArgs,
          }]
        });

        // Record with the context that was used for this turn
        // The context represents what was sent TO the LLM
        await recordKeeper.recordLLMCall(conversationId, {
          model: "intent-model",
          context: currentContext,
          result: aiMessageWithToolCall,
          ...(requestId ? { requestId } : {}),
          ...(turnId ? { turnId } : {}),
          stage: "intent",
        });
      } else if (event.type === "tool_output") {
        // Create tool message
        const toolMessage = new ToolMessage({
          content: event.output,
          tool_call_id: event.toolCallId,
        });

        // Record tool output as a message
        await recordKeeper.appendMessages(conversationId, [toolMessage]);
      }
      yield event;
    }

    // Final check for context update - ensuring we have the absolute latest context
    // before passing it to the next harness.
    messagesForResponse = currentContext;
  })();

  // Chain intent harness
  sequencer.chain(intentHarnessGenerator);

  // Run response harness after intent harness completes
  const responseHarnessGenerator = (async function* () {
    // Start the response harness with the full context from intent harness
    // This context already includes any AIMessages and ToolMessages from the intent loop.
    // We remove the system message from intent harness if it was at the start,
    // as response harness will provide its own.
    const messages = messagesForResponse[0]?.type === "system"
      ? messagesForResponse.slice(1)
      : messagesForResponse;

    const responseHarness = runResponseHarness({
      conversationId,
      messages,
      llmCaller: responseLLMCaller,
      recordKeeper,
      ...(abortSignal ? { abortSignal } : {}),
    });

    // Collect response content for the transcript
    let responseContent = "";
    for await (const event of responseHarness) {
      if (event.type === "delta" && event.content) {
        responseContent += event.content;
      }
      yield event;
    }

    // Note: The response harness already records the assistant message,
    // so we don't need to record it again here to avoid duplication.
  })();

  // Chain response harness
  sequencer.chain(responseHarnessGenerator);
  sequencer.done();

  // Track transcript for final result and usage
  const transcript: BaseMessage[] = [];
  let responseContent = "";
  let resolveFinalMessages: (messages: BaseMessage[]) => void = () => { };
  const finalMessagesPromise = new Promise<BaseMessage[]>((resolve) => {
    resolveFinalMessages = resolve;
  });

  // Convert AgentOutputItems to StreamingChunks
  const streamingChunks = (async function* (): AsyncGenerator<StreamingChunk> {
    let chunkId = 0;
    const created = Math.floor(Date.now() / 1000);
    const chunkModel = model || "bernard-1";
    const chunkBaseId = requestId || `chatcmpl-${conversationId}`;

    let sentRole = false;
    try {
      for await (const item of sequencer.sequence) {
        // Build transcript as we go
        if (item.type === "tool_output") {
          transcript.push(new ToolMessage({ content: item.output, tool_call_id: item.toolCallId }));
        } else if (item.type === "delta") {
          responseContent += item.content;
        }

        if (item.type === "llm_prompt" || item.type === "tool_call" || item.type === "tool_output") {
          // ... (trace chunk logic)
          const traceChunk: BernardTraceChunk = {
            id: `${chunkBaseId}-${++chunkId}`,
            object: "chat.completion.chunk",
            created,
            model: chunkModel,
            choices: [],
            bernard: {
              type: "trace",
              data: item,
            },
          };
          yield traceChunk;
        } else if (item.type === "delta") {
          // Emit OpenAI-compatible chunk
          const delta: any = {};
          if (!sentRole) {
            delta.role = "assistant";
            sentRole = true;
          }
          if (item.content) {
            delta.content = item.content;
          }

          const deltaChunk: OpenAIStreamingChunk = {
            id: `${chunkBaseId}-${++chunkId}`,
            object: "chat.completion.chunk",
            created,
            model: chunkModel,
            choices: [
              {
                index: 0,
                delta,
                finish_reason: item.finishReason || null,
              },
            ],
          };
          yield deltaChunk;
        }
        else if (item.type === "error") {
          // Emit error as trace chunk
          const errorChunk: BernardTraceChunk = {
            id: `${chunkBaseId}-${++chunkId}`,
            object: "chat.completion.chunk",
            created,
            model: chunkModel,
            choices: [],
            bernard: {
              type: "trace",
              data: item,
            },
          };
          yield errorChunk;
        }
      }

      // Finalize transcript and resolve promise
      const finalAssistantMessage = new AIMessage({ content: responseContent });
      const fullTranscript = [...transcript, finalAssistantMessage];
      resolveFinalMessages(fullTranscript);

      // Emit usage if requested
      if (includeUsage) {
        // Note: In a real implementation, we'd get actual usage from the LLM caller.
        // For now, we'll estimate or use placeholders if not available.
        // The route.ts uses extractUsageFromMessages which we can also use here.
        const { extractUsageFromMessages } = await import("@/app/api/v1/_lib/openai");
        const usageMeta = extractUsageFromMessages(fullTranscript);

        const usageChunk: OpenAIStreamingChunk = {
          id: `${chunkBaseId}-${++chunkId}`,
          object: "chat.completion.chunk",
          created,
          model: chunkModel,
          choices: [],
          usage: {
            prompt_tokens: usageMeta.prompt_tokens ?? usageMeta.input_tokens ?? 0,
            completion_tokens: usageMeta.completion_tokens ?? usageMeta.output_tokens ?? 0,
            total_tokens: (usageMeta.prompt_tokens ?? usageMeta.input_tokens ?? 0) +
              (usageMeta.completion_tokens ?? usageMeta.output_tokens ?? 0),
          }
        };
        yield usageChunk;
      }
    } catch (error) {
      // Resolve with partial transcript on error/abort
      const finalAssistantMessage = new AIMessage({ content: responseContent });
      resolveFinalMessages([...transcript, finalAssistantMessage]);
      throw error;
    }
  })();

  // Create SSE stream
  const stream = createSSEStream(streamingChunks);

  return {
    stream,
    finalMessages: finalMessagesPromise,
  };
}
