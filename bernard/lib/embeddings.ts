import { OpenAIEmbeddings } from "@langchain/openai";

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_VERIFY_TTL_MS = 5 * 60 * 1000;
const EMBEDDING_VERIFY_TIMEOUT_MS = 5_000;
const EMBEDDING_LOG_PREFIX = "[embeddings]";

export type EmbeddingConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

type VerifyResult = { ok: boolean; reason?: string };

let cachedEmbeddingCheck: { expiresAt: number; result: VerifyResult } | null = null;
let inflightEmbeddingCheck: Promise<VerifyResult> | null = null;
let loggedModelConfig = false;

function embeddingUrl(baseUrl: string | undefined): string {
  const base = baseUrl ?? "https://api.openai.com/v1";
  return `${base.replace(/\/+$/, "")}/embeddings`;
}

function logModelConfig(source: "probe" | "runtime", baseUrl: string | undefined, model: string) {
  if (loggedModelConfig && source === "runtime") return;
  if (source === "runtime") loggedModelConfig = true;
  const base = baseUrl ? baseUrl.replace(/\/+$/, "") : "default(openai)";
  console.info(`${EMBEDDING_LOG_PREFIX} ${source} resolved base=${base} model=${model}`);
}

async function runEmbeddingProbe(config: EmbeddingConfig): Promise<VerifyResult> {
  const apiKey = config.apiKey ?? process.env["EMBEDDING_API_KEY"];
  if (!apiKey) {
    return { ok: false, reason: "Missing EMBEDDING_API_KEY for embeddings." };
  }

  const baseUrl = config.baseUrl ?? process.env["EMBEDDING_BASE_URL"];
  const url = embeddingUrl(baseUrl);
  const model = config.model ?? process.env["EMBEDDING_MODEL"] ?? DEFAULT_EMBEDDING_MODEL;
  logModelConfig("probe", baseUrl, model);

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
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ input: "ping", model }),
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

export async function verifyEmbeddingConfig(config: EmbeddingConfig = {}): Promise<VerifyResult> {
  const apiKey = config.apiKey ?? process.env["EMBEDDING_API_KEY"];
  if (!apiKey) {
    return { ok: false, reason: "Missing EMBEDDING_API_KEY for embeddings." };
  }

  const now = Date.now();
  if (cachedEmbeddingCheck && now < cachedEmbeddingCheck.expiresAt) {
    return cachedEmbeddingCheck.result;
  }

  if (!inflightEmbeddingCheck) {
    const startedAt = now;
    inflightEmbeddingCheck = runEmbeddingProbe(config).then((result) => {
      cachedEmbeddingCheck = { result, expiresAt: startedAt + EMBEDDING_VERIFY_TTL_MS };
      return result;
    });
    inflightEmbeddingCheck.finally(() => {
      inflightEmbeddingCheck = null;
    });
  }

  return inflightEmbeddingCheck;
}

export function getEmbeddingModel(config: EmbeddingConfig = {}): OpenAIEmbeddings {
  const apiKey = config.apiKey ?? process.env["EMBEDDING_API_KEY"];
  if (!apiKey) {
    throw new Error("EMBEDDING_API_KEY is required for embeddings.");
  }

  const baseURL = config.baseUrl ?? process.env["EMBEDDING_BASE_URL"];
  const modelName = config.model ?? process.env["EMBEDDING_MODEL"] ?? DEFAULT_EMBEDDING_MODEL;
  logModelConfig("runtime", baseURL, modelName);

  return new OpenAIEmbeddings({
    apiKey,
    modelName,
    configuration: baseURL ? { baseURL } : undefined
  });
}

