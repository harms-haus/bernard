import { getSettings } from "./settingsCache";
import type { BernardSettings, ModelCategorySettings } from "./settingsStore";

export type { ModelCategorySettings };

const DEFAULT_MODEL = "gpt-3.5-turbo";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export const DEFAULT_MODEL_ID = DEFAULT_MODEL;

type SettingsFetcher = (forceRefresh?: boolean) => Promise<BernardSettings>;
let fetchSettings: SettingsFetcher = getSettings;

/**
 * Swap out the settings fetcher (primarily for tests).
 */
export function setSettingsFetcher(fetcher: SettingsFetcher) {
  fetchSettings = fetcher;
}

/**
 * Restore the default settings fetcher.
 */
export function resetSettingsFetcher(this: void) {
  fetchSettings = getSettings;
}

export type ModelCategory = "response" | "router" | "aggregation" | "utility" | "memory" | "embedding";

export type ModelCallOptions = {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  apiKey?: string;
  baseUrl?: string;
};

export type ResolvedModel = {
  type: "openai" | "ollama";
  id: string;
  options?: ModelCallOptions;
};

/**
 * Normalize a raw list from env or configuration into a trimmed string array.
 */
export function normalizeList(raw?: string | string[] | null): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  if (!raw) return [];

  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // fall through to comma parsing
  }

  return trimmed
    .split(",")
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

/**
 * Resolve a model list for a category from settings.
 */
export function listFromSettings(category: ModelCategory, settings?: ModelCategorySettings): string[] {
  if (!settings) return [];
  const models = [settings.primary].map((m) => m.trim()).filter(Boolean);
  return models;
}

/**
 * Resolve a prioritized list of models for a category.
 */
export async function getModelList(
  category: ModelCategory,
  opts: { fallback?: string[]; override?: string | string[] } = {}
): Promise<string[]> {
  const override = normalizeList(opts.override);
  if (override.length) return override;

  const settings = await fetchSettings();
  const fromSettings = listFromSettings(category, settings.models[category]);
  if (fromSettings.length) return fromSettings;

  const fallback = normalizeList(opts.fallback);
  if (fallback.length) return fallback;

  return [DEFAULT_MODEL];
}

/**
 * Resolve the first model id for a category (or a default).
 */
export async function getPrimaryModel(
  category: ModelCategory,
  opts: { fallback?: string[]; override?: string | string[] } = {}
): Promise<string> {
  const models = await getModelList(category, opts);
  return models[0] ?? DEFAULT_MODEL;
}

/**
 * Resolve the base URL, preferring call options over explicit and env defaults.
 */
export function resolveBaseUrl(baseURL?: string, options?: ModelCallOptions): string {
  return options?.baseUrl ?? baseURL ?? DEFAULT_BASE_URL;
}

/**
 * Resolve the API key, preferring call options over explicit and env defaults.
 */
export function resolveApiKey(apiKey?: string, options?: ModelCallOptions): string | undefined {
  return options?.apiKey ?? apiKey;
}

/**
 * Split a combined model/provider string into its parts.
 */
export function splitModelAndProvider(modelId: string): { model: string; providerOnly?: string[] } {
  const [rawModel, rawProvider] = modelId.split("|", 2);
  const model = (rawModel ?? modelId).trim();
  const providerOnly = rawProvider
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const base = { model: model || modelId };
  return providerOnly?.length ? { ...base, providerOnly } : base;
}

/**
 * Resolve the primary model and any configured call options for a category.
 */
export async function resolveModel(
  category: ModelCategory,
  opts: { fallback?: string[]; override?: string | string[] } = {}
): Promise<{id: string, options: Partial<Record<string, any>>}> {
  const settings = await fetchSettings();
  const modelSettings = settings.models[category];
  const list = await getModelList(category, opts);
  const id = list[0] ?? DEFAULT_MODEL;

  // Get provider information
  const providerId = modelSettings?.providerId;
  let baseURL: string | undefined;
  let apiKey: string | undefined;
  let type: "openai" | "ollama" = "openai";
  if (providerId) {
    const provider = settings.models.providers?.find(p => p.id === providerId);
    if (provider) {
      baseURL = provider.baseUrl;
      apiKey = provider.apiKey;
      type = provider.type;
    }
  }

  if (type === "openai") {
    return { id, options: { 
      modelProvider: "openai",
      configuration: {
        baseURL,
        apiKey,
      },
      temperature: modelSettings?.options?.temperature,
      maxTokens: modelSettings?.options?.maxTokens,
    }};
  } else if (type === "ollama") {
    return { id, options: { 
      modelProvider: "ollama",
      baseUrl: baseURL,
      temperature: modelSettings?.options?.temperature,
      maxTokens: modelSettings?.options?.maxTokens,
    }};
  } else {
    throw new Error(`Unknown model type: ${type}`);
  }
}


