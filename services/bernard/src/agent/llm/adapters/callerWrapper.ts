import type { BaseMessage, AIMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { LLMCaller, LLMConfig, LLMResponse } from "../llm";
import type { ModelAdapter, AdapterCallInfo } from "./adapter.interface";

/**
 * Adapter-wrapped LLM caller
 * 
 * Chains adapters around a base LLM caller, applying transformations
 * before and after LLM calls.
 */
export class AdapterCallerWrapper implements LLMCaller {
  private baseCaller: LLMCaller;
  private adapters: ModelAdapter[];

  constructor(baseCaller: LLMCaller, adapters: ModelAdapter[]) {
    this.baseCaller = baseCaller;
    this.adapters = adapters;
  }

  async complete(messages: BaseMessage[], config: LLMConfig): Promise<LLMResponse> {
    const callInfo = this.applyAdapters({ messages, config });
    const response = await this.baseCaller.complete(callInfo.messages, callInfo.config);
    return this.applyAdaptersBack(response) as LLMResponse;
  }

  async *streamText(messages: BaseMessage[], config: LLMConfig): AsyncIterable<string> {
    const callInfo = this.applyAdapters({ messages, config });
    for await (const chunk of this.baseCaller.streamText(callInfo.messages, callInfo.config)) {
      yield chunk;
    }
  }

  async completeWithTools(
    messages: BaseMessage[],
    config: LLMConfig,
    tools?: StructuredToolInterface[]
  ): Promise<AIMessage> {
    const callInfo = this.applyAdapters({ messages, config, tools: tools || [] });
    const response = await this.baseCaller.completeWithTools(
      callInfo.messages,
      callInfo.config,
      callInfo.tools
    );
    return this.applyAdaptersBack(response) as AIMessage;
  }

  adaptedBy(adapters: ModelAdapter[]): LLMCaller {
    return new AdapterCallerWrapper(this.baseCaller, [...this.adapters, ...adapters]);
  }

  private applyAdapters(callInfo: AdapterCallInfo): AdapterCallInfo {
    let adapted = callInfo;
    for (const adapter of this.adapters) {
      adapted = adapter.adapt(adapted);
    }
    return adapted;
  }

  private applyAdaptersBack(response: LLMResponse | AIMessage): LLMResponse | AIMessage {
    let adapted = response;
    for (let i = this.adapters.length - 1; i >= 0; i--) {
      const adapter = this.adapters[i];
      if (adapter) {
        adapted = adapter.adaptBack(adapted);
      }
    }
    return adapted;
  }
}
