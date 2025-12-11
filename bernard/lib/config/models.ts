import { getSettings } from "./settingsCache";
import type { ModelCategorySettings } from "./settingsStore";

const DEFAULT_MODEL = "kwaipilot/KAT-coder-v1:free";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export type ModelCategory = "response" | "intent" | "aggregation" | "utility" | "memory";

const CATEGORY_ENV: Record<ModelCategory, string> = {
  response: "RESPONSE_MODELS",
  intent: "INTENT_MODELS",
  aggregation: "AGGREGATION_MODELS",
  utility: "UTILITY_MODELS",
  memory: "MEMORY_MODELS"
};

export type ModelCallOptions = {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  baseUrl?: string;
  apiKey?: string;
};

export type ResolvedModel = {
  id: string;
  options?: ModelCallOptions;
};

function normalizeList(raw?: string | string[] | null): string[] {
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

function listFromSettings(category: ModelCategory, settings?: ModelCategorySettings): string[] {
  if (!settings) return [];
  const models = [settings.primary, ...(settings.fallbacks ?? [])].map((m) => m.trim()).filter(Boolean);
  if (models.length) return models;
  const envKey = CATEGORY_ENV[category];
  const envModels = normalizeList(process.env[envKey]);
  return envModels.length ? envModels : [];
}

export async function getModelList(
  category: ModelCategory,
  opts: { fallback?: string[]; override?: string | string[] } = {}
): Promise<string[]> {
  const override = normalizeList(opts.override);
  if (override.length) return override;

  const settings = await getSettings();
  const fromSettings = listFromSettings(category, settings.models[category] as ModelCategorySettings | undefined);
  if (fromSettings.length) return fromSettings;

  if (category === "aggregation") {
    const summaryFallback = normalizeList(process.env["SUMMARY_MODEL"]);
    if (summaryFallback.length) return summaryFallback;
  }

  const legacy = normalizeList(process.env["OPENROUTER_MODEL"]);
  if (legacy.length) return legacy;

  const fallback = normalizeList(opts.fallback);
  if (fallback.length) return fallback;

  return [DEFAULT_MODEL];
}

export async function getPrimaryModel(
  category: ModelCategory,
  opts: { fallback?: string[]; override?: string | string[] } = {}
): Promise<string> {
  const models = await getModelList(category, opts);
  return models[0] ?? DEFAULT_MODEL;
}

export function resolveBaseUrl(baseURL?: string, options?: ModelCallOptions): string {
  return options?.baseUrl ?? baseURL ?? process.env["OPENROUTER_BASE_URL"] ?? DEFAULT_BASE_URL;
}

export function resolveApiKey(apiKey?: string, options?: ModelCallOptions): string | undefined {
  return options?.apiKey ?? apiKey ?? process.env["OPENROUTER_API_KEY"];
}

export function splitModelAndProvider(modelId: string): { model: string; providerOnly?: string[] } {
  const [rawModel, rawProvider] = modelId.split("|", 2);
  const model = (rawModel ?? modelId).trim();
  const providerOnly = rawProvider
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return { model: model || modelId, providerOnly: providerOnly?.length ? providerOnly : undefined };
}

export async function resolveModel(
  category: ModelCategory,
  opts: { fallback?: string[]; override?: string | string[] } = {}
): Promise<ResolvedModel> {
  const settings = await getSettings();
  const modelSettings = settings.models[category] as ModelCategorySettings | undefined;
  const list = await getModelList(category, opts);
  const id = list[0] ?? DEFAULT_MODEL;
  return { id, options: modelSettings?.options };
}


