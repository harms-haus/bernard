import { OpenAIEmbeddings } from "@langchain/openai";
import { getSettings } from "./settingsCache";

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
type ResolvedEmbeddingConfig = { apiKey: string; baseUrl?: string; model: string };
type EmbeddingFactoryOptions = ConstructorParameters<typeof OpenAIEmbeddings>[0];
type EmbeddingFactory = (options: EmbeddingFactoryOptions) => OpenAIEmbeddings;

type EmbeddingState = {
  cachedEmbeddingCheck: { expiresAt: number; result: VerifyResult } | null;
  inflightEmbeddingCheck: Promise<VerifyResult> | null;
  loggedModelConfig: boolean;
};

const EMBEDDING_STATE_KEY = Symbol.for("bernard.embeddings.state");

function getEmbeddingState(): EmbeddingState {
  const g = globalThis as Record<string | symbol, unknown>;
  if (!g[EMBEDDING_STATE_KEY]) {
    g[EMBEDDING_STATE_KEY] = {
      cachedEmbeddingCheck: null,
      inflightEmbeddingCheck: null,
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
  const settings = await settingsFetcher().catch(() => null);
  const service = settings?.services.memory;
  const apiKey = config.apiKey ?? service?.embeddingApiKey ?? process.env["EMBEDDING_API_KEY"];
  const baseUrl = config.baseUrl ?? service?.embeddingBaseUrl ?? process.env["EMBEDDING_BASE_URL"];
  const model = config.model ?? service?.embeddingModel ?? process.env["EMBEDDING_MODEL"] ?? DEFAULT_EMBEDDING_MODEL;
  return { apiKey: apiKey ?? "", baseUrl, model };
}

async function runEmbeddingProbe(resolved: ResolvedEmbeddingConfig): Promise<VerifyResult> {
  if (!resolved.apiKey) {
    return { ok: false, reason: "Missing EMBEDDING_API_KEY for embeddings." };
  }

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
        Authorization: `Bearer ${resolved.apiKey}`
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
  const now = Date.now();
  if (embeddingState.cachedEmbeddingCheck && now < embeddingState.cachedEmbeddingCheck.expiresAt) {
    return embeddingState.cachedEmbeddingCheck.result;
  }

  if (embeddingState.inflightEmbeddingCheck) {
    return embeddingState.inflightEmbeddingCheck;
  }

  const startedAt = now;
  embeddingState.inflightEmbeddingCheck = (async () => {
    const resolved = await resolveEmbeddingConfig(config);
    if (!resolved.apiKey) {
      return { ok: false, reason: "Missing EMBEDDING_API_KEY for embeddings." };
    }

    const result = await runEmbeddingProbe(resolved);
    embeddingState.cachedEmbeddingCheck = { result, expiresAt: startedAt + EMBEDDING_VERIFY_TTL_MS };
    return result;
  })();

  embeddingState.inflightEmbeddingCheck.finally(() => {
    embeddingState.inflightEmbeddingCheck = null;
  });

  return embeddingState.inflightEmbeddingCheck;
}

/**
 * Return an embeddings client using the resolved configuration.
 */
export async function getEmbeddingModel(config: EmbeddingConfig = {}): Promise<OpenAIEmbeddings> {
  const resolved = await resolveEmbeddingConfig(config);
  if (!resolved.apiKey) {
    throw new Error("EMBEDDING_API_KEY is required for embeddings.");
  }

  logModelConfig("runtime", resolved.baseUrl, resolved.model);

  return embeddingsFactory({
    apiKey: resolved.apiKey,
    modelName: resolved.model,
    configuration: resolved.baseUrl ? { baseURL: resolved.baseUrl } : undefined
  });
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
  embeddingState.cachedEmbeddingCheck = null;
  embeddingState.inflightEmbeddingCheck = null;
  embeddingState.loggedModelConfig = false;
}

