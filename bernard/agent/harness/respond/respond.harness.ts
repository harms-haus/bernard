import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";

import { buildResponseSystemPrompt } from "./prompts";
import type { Harness, HarnessContext, HarnessResult, LLMCaller, StreamEvent } from "../lib/types";
import type { IntentOutput } from "../intent/intent.harness";
import type { MemoryOutput } from "../memory/memory.harness";
import { contentFromMessage, isToolMessage } from "@/lib/conversation/messages";
import { childLogger, logger, startTimer, toErrorObject } from "@/lib/logging";

function truncate(text: string, max = 280) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).trimEnd()}...`;
}

function lastMessageText(turns: BaseMessage[], predicate: (msg: BaseMessage) => boolean): string | null {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const msg = turns[i];
    if (!msg) continue;
    if (!predicate(msg)) continue;
    const text = contentFromMessage(msg)?.trim();
    if (text) return text;
  }
  return null;
}

function buildBlankResponseFallback(turns: BaseMessage[]): string {
  const lastToolText = lastMessageText(turns, (msg) => isToolMessage(msg));
  if (lastToolText) {
    return lastToolText;
  }
  return "I didn't get a reply yet, but I'm here if you want to try again.";
}

export type ResponseInput = {
  intent: IntentOutput;
  memories: MemoryOutput;
  availableTools?: Array<{ name: string; description?: string }>;
  disabledTools?: Array<{ name: string; reason?: string }>;
};

export type ResponseOutput = {
  text: string;
  message: BaseMessage;
};

export class ResponseHarness implements Harness<ResponseInput, ResponseOutput> {
  private readonly log = childLogger({ component: "response_harness" }, logger);

  constructor(private readonly llm: LLMCaller) {}

  async run(input: ResponseInput, ctx: HarnessContext, onStreamEvent?: (event: StreamEvent) => void): Promise<HarnessResult<ResponseOutput>> {
    const runLogger = childLogger(
      {
        conversationId: ctx.conversationId,
        requestId: ctx.requestId,
        turnId: ctx.turnId,
        stage: "response"
      },
      this.log
    );
    const elapsed = startTimer();
    const messages = this.buildMessages(input, ctx);
    try {
      // Emit LLM call start event
      if (onStreamEvent) {
        onStreamEvent({
          type: "llm_call_start",
          llmCallStart: {
            model: ctx.config.responseModel,
            context: messages,
            stage: "response"
          }
        });
      }

      // For now, simulate streaming by chunking the response after it completes
      // This provides the streaming experience while we work on true LLM streaming
      const res = await this.llm.call({
        model: ctx.config.responseModel,
        messages,
        stream: false, // Keep false for now until we implement true streaming
        meta: this.buildMeta(ctx)
      });

      // Simulate streaming chunks if streaming is requested
      if (onStreamEvent) {
        const content = res.text || "";
        if (content) {
          // Split content into chunks and stream them
          const chunks = this.chunkContent(content);
          
          for (const chunk of chunks) {
            onStreamEvent({
              type: "llm_call_chunk",
              llmCallChunk: {
                content: chunk,
                stage: "response"
              }
            });
            
          }
        }
      }

      // Emit LLM call complete event
      if (onStreamEvent) {
        onStreamEvent({
          type: "llm_call_complete",
          llmCallComplete: {
            model: ctx.config.responseModel,
            response: res.text,
            stage: "response",
            ...(res.usage ? { usage: res.usage } : {})
          }
        });
      }

      const ensured = this.ensureResponse(res, ctx.conversation.turns);
      runLogger.info({
        event: "response.run.success",
        durationMs: elapsed(),
        textLength: ensured.text.length
      });
      return { output: ensured, done: true };
    } catch (err) {
      runLogger.error({
        event: "response.run.error",
        durationMs: elapsed(),
        err: toErrorObject(err)
      });
      throw err;
    }
  }

  private buildMessages(input: ResponseInput, ctx: HarnessContext): BaseMessage[] {
    const systemPrompt = new SystemMessage(
      buildResponseSystemPrompt(ctx.now(), input.availableTools, input.disabledTools)
    );
    const messages = [systemPrompt, ...ctx.conversation.turns];
    if (input.memories?.memories?.length) {
      messages.push(
        new HumanMessage({
          content: `Relevant memories:\n${JSON.stringify(input.memories.memories, null, 2)}`
        })
      );
    }
    return messages;
  }

  private buildMeta(ctx: HarnessContext) {
    return {
      ...(ctx.conversationId ? { conversationId: ctx.conversationId } : {}),
      ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
      ...(ctx.turnId ? { turnId: ctx.turnId } : {}),
      ...(ctx.recordKeeper ? { recordKeeper: ctx.recordKeeper } : {}),
      traceName: "response"
    };
  }

  private ensureResponse(
    res: Awaited<ReturnType<LLMCaller["call"]>>,
    turns: BaseMessage[]
  ): ResponseOutput {
    const trimmed = (res.text ?? "").trim();
    if (trimmed) {
      const message = res.message ?? new AIMessage({ content: res.text });
      (message as { content?: unknown }).content = res.text;
      return { text: res.text, message };
    }

    const fallback = buildBlankResponseFallback(turns);
    const message = res.message ?? new AIMessage({ content: fallback });
    (message as { content?: unknown }).content = fallback;
    return { text: fallback, message };
  }

  /**
   * Split content into reasonable chunks for streaming simulation
   */
  private chunkContent(content: string, chunkSize: number = 8): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }
    return chunks.length > 0 ? chunks : [""];
  }
}
