import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

import { resolveApiKey, resolveBaseUrl, resolveModel, splitModelAndProvider } from "./models";
import { withTimeout } from "./timeouts";
import type { MemoryRecord, MemorySearchHit } from "./memoryStore";

type Decision = "new" | "update" | "duplicate";

export type DedupDecision = { decision: Decision; targetId?: string };

const DEDUP_TIMEOUT_MS = (() => {
  const envValue = process.env["MEMORY_DEDUP_TIMEOUT_MS"];
  if (!envValue) return 8_000;
  const parsed = Number(envValue);
  if (isNaN(parsed) || parsed <= 0) {
    console.warn(`Invalid MEMORY_DEDUP_TIMEOUT_MS: "${envValue}", using default 8000ms`);
    return 8_000;
  }
  return parsed;
})();
const DECISION_SCHEMA = z.object({
  decision: z.union([z.literal("new"), z.literal("update"), z.literal("duplicate")]),
  targetId: z.string().optional()
});

function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.join("\n");
  if (content && typeof content === "object" && "toString" in content) return String(content);
  return "";
}

function buildNeighborsSummary(neighbors: MemorySearchHit[]): string {
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

function tryParseDecision(text: string): DedupDecision | null {
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

export function fallbackDecision(neighbors: MemorySearchHit[]): DedupDecision {
  const best = neighbors[0];
  if (best && best.score > 0.9) {
    return { decision: "duplicate", targetId: best.record.id };
  }
  return { decision: "new" };
}

export async function classifyMemory(
  candidate: Pick<MemoryRecord, "label" | "content">,
  neighbors: MemorySearchHit[]
): Promise<DedupDecision> {
  if (!neighbors.length) return { decision: "new" };

  const resolvedModel = await resolveModel("utility");
  const { model: modelName, providerOnly } = splitModelAndProvider(resolvedModel.id);
  const apiKey = resolveApiKey(undefined, resolvedModel.options);
  if (!apiKey) {
    return fallbackDecision(neighbors);
  }
  const baseURL = resolveBaseUrl(undefined, resolvedModel.options);
  const model = new ChatOpenAI({
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
    res = await withTimeout(model.invoke([{ role: "user", content: prompt }]), DEDUP_TIMEOUT_MS, "memory dedup");
  } catch (err: unknown) {
    const isTimeoutError =
      (err instanceof Error && (err.name === "TimeoutError" || err.message.includes("memory dedup"))) ||
      (typeof err === "string" && err.includes("memory dedup"));
    if (isTimeoutError) {
      console.debug("memory dedup classification timed out; using heuristic", err);
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

