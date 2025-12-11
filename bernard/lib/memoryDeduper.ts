import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

import { safeStringify } from "./messages";
import { getPrimaryModel, resolveApiKey, resolveBaseUrl, splitModelAndProvider } from "./models";
import type { MemoryRecord, MemorySearchHit } from "./memoryStore";

type Decision = "new" | "update" | "duplicate";

export type DedupDecision = { decision: Decision; targetId?: string };

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
    return parsed;
  } catch {
    return null;
  }
}

function fallbackDecision(neighbors: MemorySearchHit[]): DedupDecision {
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

  const configuredModel = getPrimaryModel("utility");
  const { model: modelName, providerOnly } = splitModelAndProvider(configuredModel);
  const apiKey = resolveApiKey();
  if (!apiKey) {
    return fallbackDecision(neighbors);
  }
  const baseURL = resolveBaseUrl();
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

  const res = await model.invoke([{ role: "user", content: prompt }]);
  const content = normalizeContent((res as { content?: unknown }).content);
  const parsed = content ? tryParseDecision(content) : null;
  if (parsed) return parsed;

  // Fallback heuristic: if top score is strong, treat as duplicate.
  return fallbackDecision(neighbors);
}

