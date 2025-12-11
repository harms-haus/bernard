import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";

import { buildResponseSystemPrompt } from "./prompts";
import type { Harness, HarnessContext, HarnessResult, LLMCaller } from "../lib/types";
import type { IntentOutput } from "../intent/intent.harness";
import type { MemoryOutput } from "../memory/memory.harness";
import { contentFromMessage, isToolMessage } from "@/lib/messages";

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
    return `Here's what I found: ${truncate(lastToolText)}`;
  }
  const lastUserText = lastMessageText(
    turns,
    (msg) => (msg as { _getType?: () => string })._getType?.() === "human"
  );
  if (lastUserText) {
    return `I didn't get a reply yet. Want me to check again for "${truncate(lastUserText, 160)}"?`;
  }
  return "I didn't get a reply yet, but I'm here if you want to try again.";
}

export type ResponseInput = {
  intent: IntentOutput;
  memories: MemoryOutput;
};

export type ResponseOutput = {
  text: string;
  message: BaseMessage;
};

export class ResponseHarness implements Harness<ResponseInput, ResponseOutput> {
  constructor(private readonly llm: LLMCaller) {}

  async run(input: ResponseInput, ctx: HarnessContext): Promise<HarnessResult<ResponseOutput>> {
    const systemPrompt = new SystemMessage(buildResponseSystemPrompt(ctx.now()));
    // Use the conversation thread (which already includes the latest intent/tool turn)
    const messages = [systemPrompt, ...ctx.conversation.turns];
    if (input.memories?.memories?.length) {
      messages.push(
        new HumanMessage({
          content: `Relevant memories:\n${JSON.stringify(input.memories.memories, null, 2)}`
        })
      );
    }

    const res = await this.llm.call({
      model: ctx.config.responseModel,
      messages,
      meta: {
        ...(ctx.conversationId ? { conversationId: ctx.conversationId } : {}),
        ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
        ...(ctx.turnId ? { turnId: ctx.turnId } : {}),
        ...(ctx.recordKeeper ? { recordKeeper: ctx.recordKeeper } : {}),
        traceName: "response"
      }
    });

    const trimmed = (res.text ?? "").trim();
    let message = res.message;
    let text = res.text;

    // Guard against silent/blank responses from the model so the user always hears something.
    if (!trimmed) {
      const fallback = buildBlankResponseFallback(ctx.conversation.turns);
      text = fallback;
      if (message) {
        (message as { content?: unknown }).content = fallback;
      } else {
        message = new AIMessage({ content: fallback });
      }
    }

    return { output: { text, message }, done: true };
  }
}


