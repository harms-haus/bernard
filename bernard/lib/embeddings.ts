import { OpenAIEmbeddings } from "@langchain/openai";

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export type EmbeddingConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

export function verifyEmbeddingConfig(config: EmbeddingConfig = {}): { ok: boolean; reason?: string } {
  const apiKey = config.apiKey ?? process.env["EMBEDDING_API_KEY"];
  if (!apiKey) {
    return { ok: false, reason: "Missing EMBEDDING_API_KEY for embeddings." };
  }
  return { ok: true };
}

export function getEmbeddingModel(config: EmbeddingConfig = {}): OpenAIEmbeddings {
  const apiKey = config.apiKey ?? process.env["EMBEDDING_API_KEY"];
  if (!apiKey) {
    throw new Error("EMBEDDING_API_KEY is required for embeddings.");
  }

  const baseURL = config.baseUrl ?? process.env["EMBEDDING_BASE_URL"];
  const modelName = config.model ?? process.env["EMBEDDING_MODEL"] ?? DEFAULT_EMBEDDING_MODEL;

  return new OpenAIEmbeddings({
    apiKey,
    modelName,
    configuration: baseURL ? { baseURL } : undefined
  });
}

