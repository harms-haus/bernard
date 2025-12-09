import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";

import { buildResponseSystemPrompt } from "./prompts";
import type { Harness, HarnessContext, HarnessResult, LLMCaller } from "../lib/types";
import type { IntentOutput } from "../intent/intent.harness";
import type { MemoryOutput } from "../memory/memory.harness";

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
        conversationId: ctx.conversationId,
        requestId: ctx.requestId,
        turnId: ctx.turnId,
        recordKeeper: ctx.recordKeeper,
        traceName: "response"
      }
    });

    return { output: { text: res.text, message: res.message }, done: true };
  }
}


