import type { LanguageModelLike } from "@langchain/core/language_models/base";
import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";
import type { ModelCategorySettings, Provider } from "@shared/config/appSettings";
import { getSettings } from "@/lib/config";

export async function getModelConfig(config: ModelCategorySettings) : Promise<LanguageModelLike> {  
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

  return createChatModel(provider, config);
}

function createChatModel(provider: Provider, config: ModelCategorySettings): LanguageModelLike | PromiseLike<LanguageModelLike> {
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
      });
    case "ollama":
      return new ChatOllama({
        model: config.primary,
        baseUrl: provider.baseUrl,
        temperature: config.options?.temperature ?? 0,
      });
  }
}
