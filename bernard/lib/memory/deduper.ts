import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

import { resolveApiKey, resolveBaseUrl, resolveModel, splitModelAndProvider } from "../config/models";
import { withTimeout } from "../infra/timeouts";
import type { MemoryRecord, MemorySearchHit } from "./store";

type Decision = "new" | "update" | "duplicate";

export type DedupDecision = { decision: Decision; targetId?: string };

type TimeoutLogger = Pick<typeof console, "warn">;
type DebugLogger = Pick<typeof console, "debug" | "warn">;

type ClassifyDeps = {
  resolveApiKey?: typeof resolveApiKey;
  resolveBaseUrl?: typeof resolveBaseUrl;
  resolveModel?: typeof resolveModel;
  splitModelAndProvider?: typeof splitModelAndProvider;
  withTimeout?: typeof withTimeout;
  chatFactory?: (options: ConstructorParameters<typeof ChatOpenAI>[0]) => Pick<ChatOpenAI, "invoke">;
  logger?: DebugLogger;
  getTimeoutMs?: (logger?: TimeoutLogger) => number;
  getSetupTimeoutMs?: (logger?: TimeoutLogger) => number;
};

const DECISION_SCHEMA = z.object({
  decision: z.union([z.literal("new"), z.literal("update"), z.literal("duplicate")]),
  targetId: z.string().optional()
});

/**
 * Parse a timeout value from an env string and fall back to a default when invalid.
 */
export function parseTimeoutMs(value: string | undefined, defaultMs: number, label: string, logger: TimeoutLogger = console): number {
  if (!value) return defaultMs;
  const parsed = Number(value);
  if (isNaN(parsed) || parsed <= 0) {
    logger.warn(`Invalid ${label}: "${value}", using default ${defaultMs}ms`);
    return defaultMs;
  }
  return parsed;
}

/**
 * Resolve the classification timeout, honoring env overrides.
 */
export function getDedupTimeoutMs(logger: TimeoutLogger = console): number {
  return parseTimeoutMs(process.env["MEMORY_DEDUP_TIMEOUT_MS"], 8_000, "MEMORY_DEDUP_TIMEOUT_MS", logger);
}

/**
 * Resolve the model setup timeout, honoring env overrides.
 */
export function getDedupSetupTimeoutMs(logger: TimeoutLogger = console): number {
  return parseTimeoutMs(process.env["MEMORY_DEDUP_SETUP_TIMEOUT_MS"], 1_000, "MEMORY_DEDUP_SETUP_TIMEOUT_MS", logger);
}

/**
 * Normalize unstructured model output into a string for JSON parsing.
 * @internal
 */
export function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.join("\n");
  if (content && typeof content === "object" && "toString" in content) return String(content);
  return "";
}

/**
 * Create a short, human-readable summary of neighbor memories.
 * @internal
 */
export function buildNeighborsSummary(neighbors: MemorySearchHit[]): string {
  if (!neighbors.length) return "No similar memories were found.";
  return neighbors
    .slice(0, 5)
    .map(
      (hit, idx) =>
        `${idx + 1}. id=${hit.record.id}; label=${hit.record.label}; content=${hit.record.content}; score=${hit.score.toFixed(
          4
        )}; refreshedAt=${hit.record.refreshedAt}; successorId=${hit.record.successorId ?? "none"}`
    )
    .join("\n");
}

/**
 * Attempt to parse model output into a deduplication decision.
 * @internal
 */
export function tryParseDecision(text: string): DedupDecision | null {
  try {
    const parsed = DECISION_SCHEMA.parse(JSON.parse(text));
    if (parsed.targetId === undefined) {
      return { decision: parsed.decision };
    }
    return { decision: parsed.decision, targetId: parsed.targetId };
  } catch {
    return null;
  }
}

/**
 * Heuristic fallback decision when LLM assistance is unavailable.
 */
export function fallbackDecision(neighbors: MemorySearchHit[]): DedupDecision {
  const best = neighbors[0];
  if (best && best.score > 0.9) {
    return { decision: "duplicate", targetId: best.record.id };
  }
  return { decision: "new" };
}

const defaultDeps: Required<Pick<ClassifyDeps, "resolveApiKey" | "resolveBaseUrl" | "resolveModel" | "splitModelAndProvider" | "withTimeout" | "chatFactory" | "logger" | "getTimeoutMs" | "getSetupTimeoutMs">> =
  {
    resolveApiKey,
    resolveBaseUrl,
    resolveModel,
    splitModelAndProvider,
    withTimeout,
    chatFactory: (options) => new ChatOpenAI(options),
    logger: console,
    getTimeoutMs: getDedupTimeoutMs,
    getSetupTimeoutMs: getDedupSetupTimeoutMs
  };

/**
 * Classify an incoming memory candidate against nearest neighbors with LLM assist.
 */
export async function classifyMemory(
  candidate: Pick<MemoryRecord, "label" | "content">,
  neighbors: MemorySearchHit[],
  deps: ClassifyDeps = {}
): Promise<DedupDecision> {
  if (!neighbors.length) return { decision: "new" };

  const {
    resolveApiKey: resolveApiKeyImpl,
    resolveBaseUrl: resolveBaseUrlImpl,
    resolveModel: resolveModelImpl,
    splitModelAndProvider: splitModelAndProviderImpl,
    withTimeout: withTimeoutImpl,
    chatFactory,
    logger,
    getTimeoutMs,
    getSetupTimeoutMs
  } = { ...defaultDeps, ...deps };

  const envApiKey = resolveApiKeyImpl();
  if (!envApiKey) {
    return fallbackDecision(neighbors);
  }

  const resolvedModel = await withTimeoutImpl(resolveModelImpl("utility"), getSetupTimeoutMs(logger), "memory dedup setup").catch((err) => {
    const isTimeoutError =
      (err instanceof Error && err.message.includes("memory dedup setup")) || (typeof err === "string" && err.includes("memory dedup setup"));
    if (isTimeoutError) {
      logger.debug?.("memory dedup model resolution timed out; using heuristic", err);
      return null;
    }
    throw err;
  });
  if (!resolvedModel) return fallbackDecision(neighbors);
  const { model: modelName, providerOnly } = splitModelAndProviderImpl(resolvedModel.id);
  const apiKey = resolveApiKeyImpl(envApiKey, resolvedModel.options);
  if (!apiKey) {
    return fallbackDecision(neighbors);
  }
  const baseURL = resolveBaseUrlImpl(undefined, resolvedModel.options);
  const model = chatFactory({
    model: modelName,
    apiKey,
    configuration: { baseURL },
    temperature: 0,
    ...(providerOnly ? { modelKwargs: { provider: { only: providerOnly } } } : {})
  });

  const neighborSummary = buildNeighborsSummary(neighbors);
  const prompt =
    `You decide whether a new memory matches existing ones.\n` +
    `Return JSON: {"decision":"new|update|duplicate","targetId":"<id>"?}\n` +
    `- "duplicate": same fact/value; refresh existing.\n` +
    `- "update": similar topic but value changed; link predecessor to new id.\n` +
    `- "new": unrelated.\n` +
    `Candidate label: ${candidate.label}\n` +
    `Candidate content: ${candidate.content}\n` +
    `Neighbors:\n${neighborSummary}`;

  let res: unknown;
  try {
    res = await withTimeoutImpl(model.invoke([{ role: "user", content: prompt }]), getTimeoutMs(logger), "memory dedup");
  } catch (err: unknown) {
    const isTimeoutError =
      (err instanceof Error && (err.name === "TimeoutError" || err.message.includes("memory dedup"))) ||
      (typeof err === "string" && err.includes("memory dedup"));
    if (isTimeoutError) {
      logger.debug?.("memory dedup classification timed out; using heuristic", err);
      return fallbackDecision(neighbors);
    }
    throw err;
  }
  const content = normalizeContent((res as { content?: unknown }).content);
  const parsed = content ? tryParseDecision(content) : null;
  if (parsed) return parsed;

  // Fallback heuristic: if top score is strong, treat as duplicate.
  return fallbackDecision(neighbors);
}

