import { OpenAIEmbeddings } from "@langchain/openai";
import { getSettings } from "./settingsCache";
import { resolveModel } from "./models";

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_VERIFY_TTL_MS = 5 * 60 * 1000;
const EMBEDDING_VERIFY_TIMEOUT_MS = 5_000;
const EMBEDDING_LOG_PREFIX = "[embeddings]";

/**
 * Runtime configuration for embedding requests.
 */
export type EmbeddingConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

type VerifyResult = { ok: boolean; reason?: string };
type ResolvedEmbeddingConfig = { apiKey?: string; baseUrl?: string; model: string };
type EmbeddingFactoryOptions = ConstructorParameters<typeof OpenAIEmbeddings>[0];
type EmbeddingFactory = (options: EmbeddingFactoryOptions) => OpenAIEmbeddings;

type EmbeddingState = {
  cachedEmbeddingCheck: Map<string, { expiresAt: number; result: VerifyResult }>;
  inflightEmbeddingCheck: Map<string, Promise<VerifyResult>>;
  loggedModelConfig: boolean;
};

const EMBEDDING_STATE_KEY = Symbol.for("bernard.embeddings.state");

function getEmbeddingState(): EmbeddingState {
  const g = globalThis as Record<string | symbol, unknown>;
  if (!g[EMBEDDING_STATE_KEY]) {
    g[EMBEDDING_STATE_KEY] = {
      cachedEmbeddingCheck: new Map(),
      inflightEmbeddingCheck: new Map(),
      loggedModelConfig: false
    } satisfies EmbeddingState;
  }
  return g[EMBEDDING_STATE_KEY] as EmbeddingState;
}

const embeddingState = getEmbeddingState();

let settingsFetcher: typeof getSettings = getSettings;
let embeddingsFactory: EmbeddingFactory = (options) => new OpenAIEmbeddings(options);

function embeddingUrl(baseUrl: string | undefined): string {
  const base = baseUrl ?? "https://api.openai.com/v1";
  return `${base.replace(/\/+$/, "")}/embeddings`;
}

function logModelConfig(source: "probe" | "runtime", baseUrl: string | undefined, model: string) {
  if (embeddingState.loggedModelConfig && source === "runtime") return;
  if (source === "runtime") embeddingState.loggedModelConfig = true;
  const base = baseUrl ? baseUrl.replace(/\/+$/, "") : "default(openai)";
  console.info(`${EMBEDDING_LOG_PREFIX} ${source} resolved base=${base} model=${model}`);
}

async function resolveEmbeddingConfig(config: EmbeddingConfig): Promise<ResolvedEmbeddingConfig> {
  // First, try to resolve from admin model configuration (takes precedence)
  let resolvedModel;
  try {
    resolvedModel = await resolveModel("embedding");
  } catch (error) {
    console.warn("[embeddings] Failed to resolve embedding model from admin settings:", error);
  }

  // If we have resolved model settings from admin, use them
  if (resolvedModel) {
    const resolvedApiKey = config.apiKey ?? resolvedModel.options?.apiKey;
    const resolvedBaseUrl = config.baseUrl ?? resolvedModel.options?.baseUrl;
    const resolvedModelName = config.model ?? resolvedModel.id;

    // Don't include apiKey if it's a placeholder value like "none"
    const shouldIncludeApiKey = resolvedApiKey && resolvedApiKey !== "none" && resolvedApiKey !== "";

    return {
      ...(shouldIncludeApiKey ? { apiKey: resolvedApiKey } : {}),
      model: resolvedModelName,
      ...(resolvedBaseUrl ? { baseUrl: resolvedBaseUrl } : {})
    };
  }

  // Fall back to environment variables if no admin configuration exists
  const envApiKey = process.env["EMBEDDING_API_KEY"];
  const envBaseUrl = process.env["EMBEDDING_BASE_URL"];
  const envModel = process.env["EMBEDDING_MODEL"];

  if (envApiKey || envBaseUrl || envModel) {
    const apiKey = config.apiKey ?? envApiKey;
    const baseUrl = config.baseUrl ?? envBaseUrl;
    const model = config.model ?? envModel ?? "nomic-embed-text";

    // Don't include apiKey if it's a placeholder value like "none"
    const shouldIncludeApiKey = apiKey && apiKey !== "none" && apiKey !== "";

    return {
      ...(shouldIncludeApiKey ? { apiKey } : {}),
      model,
      ...(baseUrl ? { baseUrl } : {})
    };
  }

  // Final fallback to hardcoded defaults
  const fallbackApiKey = config.apiKey;
  const fallbackBaseUrl = config.baseUrl ?? "http://localhost:11434/v1";
  const fallbackModel = config.model ?? "nomic-embed-text";

  // Don't include apiKey if it's a placeholder value like "none"
  const shouldIncludeApiKey = fallbackApiKey && fallbackApiKey !== "none" && fallbackApiKey !== "";

  return {
    ...(shouldIncludeApiKey ? { apiKey: fallbackApiKey } : {}),
    model: fallbackModel,
    ...(fallbackBaseUrl ? { baseUrl: fallbackBaseUrl } : {})
  };

  // Use resolved model settings
  const apiKey = config.apiKey ?? resolvedModel.options?.apiKey;
  const baseUrl = config.baseUrl ?? resolvedModel.options?.baseUrl;
  const model = config.model ?? resolvedModel.id;

  return {
    ...(apiKey ? { apiKey } : {}),
    model,
    ...(baseUrl ? { baseUrl } : {})
  };
}

function embeddingConfigCacheKey(resolved: ResolvedEmbeddingConfig): string {
  return JSON.stringify({
    apiKey: resolved.apiKey ?? null,
    baseUrl: resolved.baseUrl ?? null,
    model: resolved.model
  });
}

async function runEmbeddingProbe(resolved: ResolvedEmbeddingConfig): Promise<VerifyResult> {
  const url = embeddingUrl(resolved.baseUrl);
  logModelConfig("probe", resolved.baseUrl, resolved.model);

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`Embedding probe timed out after ${EMBEDDING_VERIFY_TIMEOUT_MS}ms`)),
    EMBEDDING_VERIFY_TIMEOUT_MS
  );

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(resolved.apiKey ? { Authorization: `Bearer ${resolved.apiKey}` } : {})
      },
      body: JSON.stringify({ input: "ping", model: resolved.model }),
      signal: controller.signal
    });

    if (!res.ok) {
      const text = await res
        .text()
        .then((t) => t.trim())
        .catch(() => "");
      const reason = text ? `${res.status} ${res.statusText}: ${text.slice(0, 200)}` : `${res.status} ${res.statusText}`;
      return { ok: false, reason: `Embedding healthcheck failed: ${reason}` };
    }

    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Embedding healthcheck failed: ${reason}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Validate embeddings configuration by running a short probe request.
 */
export async function verifyEmbeddingConfig(config: EmbeddingConfig = {}): Promise<VerifyResult> {
  const resolved = await resolveEmbeddingConfig(config);
  const cacheKey = embeddingConfigCacheKey(resolved);
  const now = Date.now();
  const cached = embeddingState.cachedEmbeddingCheck.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    return cached.result;
  }

  const inflight = embeddingState.inflightEmbeddingCheck.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const startedAt = now;
  const probe = (async () => {
    if (!resolved.apiKey && !resolved.baseUrl) {
      return { ok: false, reason: "Missing EMBEDDING_API_KEY or EMBEDDING_BASE_URL for embeddings." };
    }

    const result = await runEmbeddingProbe(resolved);
    embeddingState.cachedEmbeddingCheck.set(cacheKey, { result, expiresAt: startedAt + EMBEDDING_VERIFY_TTL_MS });
    return result;
  })();

  embeddingState.inflightEmbeddingCheck.set(cacheKey, probe);

  probe.finally(() => {
    embeddingState.inflightEmbeddingCheck.delete(cacheKey);
  });

  return probe;
}

/**
 * Return an embeddings client using the resolved configuration.
 */
export async function getEmbeddingModel(config: EmbeddingConfig = {}): Promise<OpenAIEmbeddings> {
  const resolved = await resolveEmbeddingConfig(config);
  if (!resolved.apiKey && !resolved.baseUrl) {
    throw new Error("EMBEDDING_API_KEY or EMBEDDING_BASE_URL is required for embeddings.");
  }

  // For local providers (like Ollama), provide a dummy API key if none is set
  const apiKey = resolved.apiKey || (resolved.baseUrl && resolved.baseUrl.includes('localhost') ? 'ollama' : undefined);

  if (!apiKey) {
    throw new Error("EMBEDDING_API_KEY or EMBEDDING_BASE_URL is required for embeddings.");
  }

  logModelConfig("runtime", resolved.baseUrl, resolved.model);

  return embeddingsFactory(
    {
      apiKey,
      modelName: resolved.model,
      ...(resolved.baseUrl ? { configuration: { baseURL: resolved.baseUrl } } : {})
    }
  );
}

/**
 * Override the settings loader (used by tests).
 */
export function setSettingsFetcher(fetcher: typeof getSettings) {
  settingsFetcher = fetcher;
}

/**
 * Override the embeddings factory (used by tests).
 */
export function setEmbeddingsFactory(factory: EmbeddingFactory) {
  embeddingsFactory = factory;
}

/**
 * Clear cached verification state and log guards.
 */
export function resetEmbeddingVerificationState() {
  embeddingState.cachedEmbeddingCheck = new Map();
  embeddingState.inflightEmbeddingCheck = new Map();
  embeddingState.loggedModelConfig = false;
}

