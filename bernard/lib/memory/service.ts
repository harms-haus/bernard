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

export type MemorizeDependencies = {
  store?: Awaited<ReturnType<typeof getMemoryStore>>;
  classifyMemoryImpl?: typeof classifyMemory;
  fallbackDecisionImpl?: typeof fallbackDecision;
  withTimeoutImpl?: typeof withTimeout;
  logger?: Pick<typeof console, "warn">;
};

const DEFAULT_MEMORY_STEP_TIMEOUT_MS = 8_000;

/**
 * Resolve the timeout used for memory operations, falling back to a safe default.
 */
export function resolveMemoryStepTimeoutMs(): number {
  const raw = process.env["MEMORY_STEP_TIMEOUT_MS"];
  if (!raw) return DEFAULT_MEMORY_STEP_TIMEOUT_MS;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed !== Number(raw)) return DEFAULT_MEMORY_STEP_TIMEOUT_MS;
  return parsed;
}

/**
 * Format unknown errors into human-readable strings.
 */
function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Normalize user input for storage and deduplication.
 */
function normalizeInput(input: MemorizeInput): MemorizeInput {
  return {
    label: input.label.trim(),
    content: input.content.trim(),
    conversationId: input.conversationId.trim() || "unknown"
  };
}

/**
 * Upsert a memory record with similarity search + deduplication guard rails.
 *
 * Dependencies are injectable to ease testing and to keep external calls controlled.
 */
export async function memorizeValue(input: MemorizeInput, deps: MemorizeDependencies = {}): Promise<MemorizeResult> {
  const normalized = normalizeInput(input);
  const store = deps.store ?? (await getMemoryStore());
  const classifyMemoryImpl = deps.classifyMemoryImpl ?? classifyMemory;
  const fallbackDecisionImpl = deps.fallbackDecisionImpl ?? fallbackDecision;
  const withTimeoutImpl = deps.withTimeoutImpl ?? withTimeout;
  const logger = deps.logger ?? console;
  const timeoutMs = resolveMemoryStepTimeoutMs();

  const neighbors = await withTimeoutImpl(
    store.searchSimilar(normalized.content, 5),
    timeoutMs,
    "memory search"
  ).catch((err) => {
    logger.warn(`[memory] similarity search failed; proceeding without neighbors: ${formatError(err)}`);
    return [];
  });
  const decision = await withTimeoutImpl(
    classifyMemoryImpl({ label: normalized.label, content: normalized.content }, neighbors),
    timeoutMs,
    "memory dedup"
  ).catch((err) => {
    logger.warn(`[memory] dedup decision failed; using fallback: ${formatError(err)}`);
    return fallbackDecisionImpl(neighbors);
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

