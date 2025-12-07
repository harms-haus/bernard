const DEFAULT_MODEL = "kwaipilot/KAT-coder-v1:free";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export type ModelCategory = "response" | "intent" | "aggregation" | "utility";

const CATEGORY_ENV: Record<ModelCategory, string> = {
  response: "RESPONSE_MODELS",
  intent: "INTENT_MODELS",
  aggregation: "AGGREGATION_MODELS",
  utility: "UTILITY_MODELS"
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

export function getModelList(
  category: ModelCategory,
  opts: { fallback?: string[]; override?: string | string[] } = {}
): string[] {
  const override = normalizeList(opts.override);
  if (override.length) return override;

  const envKey = CATEGORY_ENV[category];
  const configured = normalizeList(process.env[envKey]);
  if (configured.length) return configured;

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

export function getPrimaryModel(
  category: ModelCategory,
  opts: { fallback?: string[]; override?: string | string[] } = {}
): string {
  const models = getModelList(category, opts);
  return models[0];
}

export function resolveBaseUrl(baseURL?: string): string {
  return baseURL ?? process.env["OPENROUTER_BASE_URL"] ?? DEFAULT_BASE_URL;
}

export function resolveApiKey(apiKey?: string): string | undefined {
  return apiKey ?? process.env["OPENROUTER_API_KEY"];
}


