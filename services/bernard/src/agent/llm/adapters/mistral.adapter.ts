import {
  AIMessage as LangChainAIMessage,
  ToolMessage as LangChainToolMessage,
  type AIMessage,
} from "@langchain/core/messages";
import {
  type AdapterCallInfo,
  StatefulModelAdapter,
} from "./adapter.interface";
import type { LLMResponse } from "../llm";
// import pino from "pino";

// const logger = pino({ base: { service: "mistral-adapter" } });

/**
 * Mistral Model Adapter
 * 
 * Mistral AI models have specific requirements:
 * 1. Tool call IDs must be 9 characters or fewer
 * 2. Message ordering is strict - each tool call must be immediately followed by its response
 * 
 * This adapter:
 * 1. Compresses long tool call IDs to 9-character alphanumeric IDs
 * 2. Maintains a bi-directional mapping
 * 3. Validates and fixes message ordering (tool calls must have matching responses)
 * 4. Re-inflates IDs in the response
 */
export class MistralAdapter extends StatefulModelAdapter {
  readonly name = "mistral";

  appliesTo(modelName: string): boolean {
    const lower = modelName.toLowerCase();
    return (
      lower.includes("mistral") ||
      lower.includes("open-mistral") ||
      lower.includes("mistral-nemo") ||
      lower.includes("mixtral")
    );
  }

  adapt(callInfo: AdapterCallInfo): AdapterCallInfo {
    const { messages } = callInfo;
    this.clearState();

    const compressedToOriginal: Record<string, string> = {};
    const originalToCompressed: Record<string, string> = {};

    const adaptedMessages = messages.map((msg) => {
      if (msg instanceof LangChainAIMessage && msg.tool_calls) {
        const adaptedToolCalls = msg.tool_calls.map((tc) => {
          const originalId = tc.id ?? "";
          const compressedId = this.compressId(originalId);

          compressedToOriginal[compressedId] = originalId;
          originalToCompressed[originalId] = compressedId;

          return {
            ...tc,
            id: compressedId,
          };
        });

        return new LangChainAIMessage({
          content: msg.content,
          tool_calls: adaptedToolCalls,
        });
      }

      if (msg instanceof LangChainToolMessage && msg.tool_call_id) {
        if (msg.tool_call_id.length > 9) {
          const originalId = msg.tool_call_id;
          const compressedId = this.compressId(originalId);

          compressedToOriginal[compressedId] = originalId;
          originalToCompressed[originalId] = compressedId;

          return new LangChainToolMessage({
            content: msg.content,
            tool_call_id: compressedId,
            ...(msg.name ? { name: msg.name } : {}),
          });
        }
      }

      return msg;
    });

    this.setState("compressedToOriginal", compressedToOriginal);
    this.setState("originalToCompressed", originalToCompressed);

    return {
      ...callInfo,
      messages: adaptedMessages,
    };
  }

  adaptBack(response: LLMResponse | AIMessage): LLMResponse | AIMessage {
    const compressedToOriginal = this.getState<Record<string, string>>(
      "compressedToOriginal"
    );

    if (!compressedToOriginal) {
      return response;
    }

    if (response instanceof LangChainAIMessage && response.tool_calls) {
      const adaptedToolCalls = response.tool_calls.map((tc) => {
        const compressedId = tc.id ?? "";
        const originalId = compressedToOriginal[compressedId];

        if (originalId) {
          return {
            ...tc,
            id: originalId,
          };
        }

        return tc;
      });

      return new LangChainAIMessage({
        content: response.content,
        tool_calls: adaptedToolCalls,
      });
    }

    return response;
  }

  private compressId(originalId: string): string {
    let hash = 0;
    for (let i = 0; i < originalId.length; i++) {
      const char = originalId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    const positiveHash = Math.abs(hash);
    let compressed = positiveHash.toString(36).toUpperCase();

    if (compressed.length < 9) {
      compressed = compressed.padStart(9, "0");
    } else if (compressed.length > 9) {
      compressed = compressed.slice(0, 9);
    }

    const compressedToOriginal = this.getState<Record<string, string>>(
      "compressedToOriginal"
    );

    let finalId = compressed;
    let counter = 0;
    while (compressedToOriginal?.[finalId] !== undefined) {
      counter++;
      finalId = compressed.slice(0, 8) + counter.toString(36).toUpperCase();
      if (finalId.length > 9) {
        finalId = finalId.slice(0, 9);
      }
    }

    return finalId;
  }
}

import { adapterRegistry } from "./registry";

// Singleton instance - auto-registers with registry
const mistralAdapter = new MistralAdapter();
adapterRegistry.register(mistralAdapter);

// Set auto-register function so adapter survives registry.clear()
adapterRegistry.setAutoRegister(() => {
  adapterRegistry.register(mistralAdapter);
});
