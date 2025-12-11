import { classifyMemory, fallbackDecision, type DedupDecision } from "./deduper";
import { getMemoryStore, type MemoryRecord, type MemorySearchHit } from "./store";
import { withTimeout } from "../infra/timeouts";

export type MemorizeInput = {
  label: string;
  content: string;
  conversationId: string;
};

export type MemorizeOutcome = "created" | "updated" | "refreshed";

export type MemorizeResult = {
  outcome: MemorizeOutcome;
  memory: MemoryRecord;
  predecessorId?: string;
  decision: DedupDecision;
  neighbors: MemorySearchHit[];
};

const MEMORY_STEP_TIMEOUT_MS = Number(process.env["MEMORY_STEP_TIMEOUT_MS"]) || 8_000;
function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function normalizeInput(input: MemorizeInput): MemorizeInput {
  return {
    label: input.label.trim(),
    content: input.content.trim(),
    conversationId: input.conversationId.trim() || "unknown"
  };
}

/**
 * Upsert a memory record with similarity search + deduplication guard rails.
 */
export async function memorizeValue(
  input: MemorizeInput,
  deps: { store?: Awaited<ReturnType<typeof getMemoryStore>> } = {}
): Promise<MemorizeResult> {
  const normalized = normalizeInput(input);
  const store = deps.store ?? (await getMemoryStore());
  const neighbors = await withTimeout(
    store.searchSimilar(normalized.content, 5),
    MEMORY_STEP_TIMEOUT_MS,
    "memory search"
  ).catch((err) => {
    console.warn(`[memory] similarity search failed; proceeding without neighbors: ${formatError(err)}`);
    return [];
  });
  const decision = await withTimeout(
    classifyMemory({ label: normalized.label, content: normalized.content }, neighbors),
    MEMORY_STEP_TIMEOUT_MS,
    "memory dedup"
  ).catch((err) => {
    console.warn(`[memory] dedup decision failed; using fallback: ${formatError(err)}`);
    return fallbackDecision(neighbors);
  });

  const pickTargetId = (): string | undefined => {
    if (decision.targetId) return decision.targetId;
    return neighbors[0]?.record.id;
  };

  if (decision.decision === "new") {
    const memory = await store.createMemory(normalized);
    return { outcome: "created", memory, decision, neighbors };
  }

  if (decision.decision === "update") {
    const predecessorId = pickTargetId();
    const memory = await store.createMemory(normalized);
    if (predecessorId) {
      await store.markSuccessor(predecessorId, memory.id);
    }
    return { outcome: "updated", memory, predecessorId, decision, neighbors };
  }

  const targetId = pickTargetId();
  if (targetId) {
    const refreshed = await store.refreshMemory(targetId);
    if (refreshed) {
      return { outcome: "refreshed", memory: refreshed, decision, neighbors, predecessorId: targetId };
    }
  }

  const fallback = await store.createMemory(normalized);
  return { outcome: "created", memory: fallback, decision, neighbors };
}

