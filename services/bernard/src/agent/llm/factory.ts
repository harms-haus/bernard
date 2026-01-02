import type { LLMCaller } from "./llm";
import { ChatOpenAILLMCaller } from "./chatOpenAI";
import { ChatOllamaLLMCaller } from "./chatOllama";
import type { Provider } from "@/lib/config/settingsStore";
import { adapterRegistry, AdapterCallerWrapper } from "./adapters";

/**
 * Creates an LLM caller instance based on the provider type,
 * with model adapters applied as needed.
 */
export function createLLMCaller(provider: Provider, model: string): LLMCaller {
  let caller: LLMCaller;

  switch (provider.type) {
    case "openai":
      caller = new ChatOpenAILLMCaller(provider.apiKey || "", provider.baseUrl, model);
      break;

    case "ollama":
      caller = new ChatOllamaLLMCaller(provider.baseUrl, model);
      break;

    default:
      throw new Error("Unsupported provider type: " + String(provider.type));
  }

  const adapters = adapterRegistry.findFor(model);

  if (adapters.length > 0) {
    return new AdapterCallerWrapper(caller, adapters);
  }

  return caller;
}
