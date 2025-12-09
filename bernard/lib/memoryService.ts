import { classifyMemory, type DedupDecision } from "./memoryDeduper";
import { getMemoryStore, type MemoryRecord, type MemorySearchHit } from "./memoryStore";

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

function normalizeInput(input: MemorizeInput): MemorizeInput {
  return {
    label: input.label.trim(),
    content: input.content.trim(),
    conversationId: input.conversationId.trim() || "unknown"
  };
}

export async function memorizeValue(
  input: MemorizeInput,
  deps: { store?: Awaited<ReturnType<typeof getMemoryStore>> } = {}
): Promise<MemorizeResult> {
  const normalized = normalizeInput(input);
  const store = deps.store ?? (await getMemoryStore());
  const neighbors = await store.searchSimilar(normalized.content, 5);
  const decision = await classifyMemory({ label: normalized.label, content: normalized.content }, neighbors);

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

