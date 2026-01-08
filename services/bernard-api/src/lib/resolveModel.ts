import { appSettings } from "@shared/config/appSettings";

export async function resolveModel(category: "utility"): Promise<{
  id: string;
  options: Record<string, unknown>;
}> {
  const settings = await appSettings.getModels();
  const modelSettings = settings[category];

  if (!modelSettings) {
    throw new Error(`No model configured for category: ${category}`);
  }

  const provider = settings.providers.find(p => p.id === modelSettings.providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${modelSettings.providerId}`);
  }

  const modelId = modelSettings.primary;
  const options: Record<string, unknown> = {
    modelProvider: provider.type,
    ...modelSettings.options,
  };

  if (provider.type === "openai") {
    options.apiKey = provider.apiKey;
    if (provider.baseUrl) {
      options.configuration = {
        baseURL: provider.baseUrl,
      };
    }
  } else if (provider.type === "ollama") {
    options.baseUrl = provider.baseUrl;
  }

  return { id: modelId, options };
}
