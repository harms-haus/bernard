import type { LLMCaller } from "./llm";
import { ChatOpenAILLMCaller } from "./chatOpenAI";
import { ChatOllamaLLMCaller } from "./chatOllama";
import type { Provider } from "../../lib/config/settingsStore";

/**
 * Creates an LLM caller instance based on the provider type
 */
export function createLLMCaller(provider: Provider, model: string): LLMCaller {
  switch (provider.type) {
    case "openai":
      return new ChatOpenAILLMCaller(provider.apiKey || "", provider.baseUrl, model);

    case "ollama":
      return new ChatOllamaLLMCaller(provider.baseUrl, model);

    default:
      throw new Error(`Unsupported provider type: ${provider.type}`);
  }
}
