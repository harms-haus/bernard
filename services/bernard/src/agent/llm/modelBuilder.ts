import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";
import type { ModelCategorySettings, Provider } from "@shared/config/appSettings";
import { getSettings } from "@/lib/config";
import type { Runnable } from "@langchain/core/runnables";
import type { StructuredToolInterface } from "@langchain/core/tools";

export async function getModelConfig(config: ModelCategorySettings, tools: StructuredToolInterface[]) : Promise<Runnable> {  
  // Call LLM for creative response (no tools)
  const llmConfig: {
    model: string;
    temperature?: number;
    maxTokens?: number;
  } = {
    model: config.primary,
  };

  if (config.options?.temperature !== undefined) {
    llmConfig.temperature = config.options.temperature;
  }
  if (config.options?.maxTokens !== undefined) {
    llmConfig.maxTokens = config.options.maxTokens;
  }

  const settings = await getSettings();
  const provider = settings.models.providers.find(p => p.id === config.providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${config.providerId}`);
  }

  return createChatModel(provider, config, tools);
}

function createChatModel(provider: Provider, config: ModelCategorySettings, tools: StructuredToolInterface[]): Runnable {
  switch (provider.type) {
    case "openai":
      return new ChatOpenAI({
        model: config.primary,
        configuration: {
          baseURL: provider.baseUrl,
          apiKey: provider.apiKey,
        },
        temperature: config.options?.temperature ?? 0,
        maxTokens: config.options?.maxTokens ?? 10000,
      }).bindTools(tools);
    case "ollama":
      return new ChatOllama({
        model: config.primary,
        baseUrl: provider.baseUrl,
        temperature: config.options?.temperature ?? 0,
      }).bindTools(tools);
  }
}
