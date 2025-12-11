import assert from "node:assert/strict";
import test, { mock } from "node:test";

import {
  memorizeValue,
  resolveMemoryStepTimeoutMs,
  type MemorizeDependencies,
  type MemorizeInput
} from "../lib/memory/service";
import storeModule from "../lib/memory/store";
import type { MemoryRecord, MemorySearchHit } from "../lib/memory/store";
import deduperModule from "../lib/memory/deduper";
import timeoutsModule from "../lib/infra/timeouts";

const TEST_TIMEOUT = 2_000;

type StubStore = {
  searchSimilar: (content: string, limit?: number) => Promise<MemorySearchHit[]>;
  createMemory: (input: MemorizeInput) => Promise<MemoryRecord>;
  markSuccessor: (id: string, successorId: string) => Promise<void>;
  refreshMemory: (id: string) => Promise<MemoryRecord | null>;
};

function buildRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  const now = new Date().toISOString();
  return {
    id: "rec-default",
    label: "label",
    content: "content",
    conversationId: "conv",
    createdAt: now,
    refreshedAt: now,
    freshnessMaxDays: 7,
    ...overrides
  };
}

function makeNeighbor(id = "neighbor-1"): MemorySearchHit {
  return { record: buildRecord({ id, label: "neighbor", content: "neighbor content" }), score: 0.8, originId: id };
}

function makeDeps(overrides: Partial<MemorizeDependencies> = {}) {
  const warnings: string[] = [];
  const withTimeoutCalls: Array<{ timeoutMs?: number; label?: string }> = [];
  const created: MemoryRecord[] = [];
  const markCalls: Array<{ id: string; successorId: string }> = [];
  const refreshCalls: string[] = [];
  const searchCalls: Array<{ content: string; limit?: number }> = [];

  const store: StubStore = {
    searchSimilar: async (content, limit) => {
      searchCalls.push({ content, limit });
      return [];
    },
    createMemory: async (input) => {
      const record = buildRecord({
        id: `new-${created.length + 1}`,
        ...input,
        createdAt: "created",
        refreshedAt: "refreshed"
      });
      created.push(record);
      return record;
    },
    markSuccessor: async (id, successorId) => {
      markCalls.push({ id, successorId });
    },
    refreshMemory: async (id) => {
      refreshCalls.push(id);
      return null;
    }
  };

  const deps: MemorizeDependencies = {
    store,
    logger: { warn: (msg: string) => warnings.push(msg) },
    withTimeoutImpl: async <T>(promise: Promise<T>, timeoutMs?: number, label?: string) => {
      withTimeoutCalls.push({ timeoutMs, label });
      return promise;
    },
    ...overrides
  };

  return { deps, warnings, created, markCalls, refreshCalls, searchCalls, withTimeoutCalls };
}

test("creates new memory with normalized input and timeouts applied", { timeout: TEST_TIMEOUT }, async () => {
  const classifyCalls: Array<{ label: string; content: string }> = [];
  const { deps, created, searchCalls, withTimeoutCalls } = makeDeps({
    classifyMemoryImpl: async (candidate) => {
      classifyCalls.push(candidate);
      return { decision: "new" };
    }
  });

  const result = await memorizeValue(
    { label: "  Hello ", content: "  data  ", conversationId: "   " },
    deps
  );

  assert.equal(result.outcome, "created");
  assert.equal(created.length, 1);
  assert.equal(created[0]?.label, "Hello");
  assert.equal(created[0]?.content, "data");
  assert.equal(created[0]?.conversationId, "unknown");

  assert.equal(searchCalls[0]?.content, "data");
  assert.equal(classifyCalls[0]?.label, "Hello");
  assert.equal(classifyCalls[0]?.content, "data");

  assert.equal(withTimeoutCalls.length, 2);
  assert.equal(withTimeoutCalls[0]?.label, "memory search");
  assert.equal(withTimeoutCalls[1]?.label, "memory dedup");
  assert.equal(withTimeoutCalls[0]?.timeoutMs, resolveMemoryStepTimeoutMs());
});

test("resolveMemoryStepTimeoutMs falls back on invalid input", () => {
  const original = process.env["MEMORY_STEP_TIMEOUT_MS"];
  process.env["MEMORY_STEP_TIMEOUT_MS"] = "invalid";
  assert.equal(resolveMemoryStepTimeoutMs(), 8_000);
  process.env["MEMORY_STEP_TIMEOUT_MS"] = "-5";
  assert.equal(resolveMemoryStepTimeoutMs(), 8_000);
  if (original === undefined) {
    delete process.env["MEMORY_STEP_TIMEOUT_MS"];
  } else {
    process.env["MEMORY_STEP_TIMEOUT_MS"] = original;
  }
});

test("logs similarity search failure and proceeds without neighbors", { timeout: TEST_TIMEOUT }, async () => {
  const error = new Error("search boom");
  const { deps, warnings, searchCalls } = makeDeps();
  deps.store!.searchSimilar = async (content, limit) => {
    searchCalls.push({ content, limit });
    throw error;
  };
  deps.classifyMemoryImpl = async () => ({ decision: "new" });

  const result = await memorizeValue({ label: "label", content: "content", conversationId: "conv" }, deps);

  assert.equal(result.neighbors.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /search boom/);
  assert.equal(searchCalls.length, 1);
});

test("honors MEMORY_STEP_TIMEOUT_MS override", { timeout: TEST_TIMEOUT }, async () => {
  const original = process.env["MEMORY_STEP_TIMEOUT_MS"];
  process.env["MEMORY_STEP_TIMEOUT_MS"] = "1234";
  const { deps, withTimeoutCalls } = makeDeps({
    classifyMemoryImpl: async () => ({ decision: "new" })
  });

  try {
    await memorizeValue({ label: "label", content: "content", conversationId: "conv" }, deps);
    assert.equal(withTimeoutCalls[0]?.timeoutMs, 1234);
  } finally {
    if (original === undefined) {
      delete process.env["MEMORY_STEP_TIMEOUT_MS"];
    } else {
      process.env["MEMORY_STEP_TIMEOUT_MS"] = original;
    }
  }
});

test("falls back to heuristic when dedup classification fails", { timeout: TEST_TIMEOUT }, async () => {
  const { deps, warnings, markCalls } = makeDeps({
    fallbackDecisionImpl: () => ({ decision: "update", targetId: "neighbor-1" })
  });
  deps.store!.searchSimilar = async () => [makeNeighbor()];
  deps.classifyMemoryImpl = async () => {
    throw "dedup blew up";
  };

  const result = await memorizeValue({ label: "label", content: "content", conversationId: "conv" }, deps);

  assert.equal(result.outcome, "updated");
  assert.equal(result.predecessorId, "neighbor-1");
  assert.equal(markCalls.length, 1);
  assert.equal(markCalls[0]?.id, "neighbor-1");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /dedup decision failed/);
  assert.match(warnings[0] ?? "", /dedup blew up/);
});

test("update without target leaves predecessor unset", { timeout: TEST_TIMEOUT }, async () => {
  const { deps, markCalls } = makeDeps();
  deps.store!.searchSimilar = async () => [];
  deps.classifyMemoryImpl = async () => ({ decision: "update" });

  const result = await memorizeValue({ label: "fact", content: "v", conversationId: "conv" }, deps);

  assert.equal(result.outcome, "updated");
  assert.equal(result.predecessorId, undefined);
  assert.equal(markCalls.length, 0);
});

test("duplicate refreshes existing memory when available", { timeout: TEST_TIMEOUT }, async () => {
  const refreshed = buildRecord({ id: "neighbor-1", refreshedAt: "fresh" });
  const { deps, refreshCalls } = makeDeps();
  deps.store!.searchSimilar = async () => [makeNeighbor()];
  deps.store!.refreshMemory = async (id) => {
    refreshCalls.push(id);
    return refreshed;
  };
  deps.classifyMemoryImpl = async () => ({ decision: "duplicate" });

  const result = await memorizeValue({ label: "label", content: "content", conversationId: "conv" }, deps);

  assert.equal(result.outcome, "refreshed");
  assert.equal(result.memory.id, "neighbor-1");
  assert.equal(result.predecessorId, "neighbor-1");
  assert.equal(refreshCalls[0], "neighbor-1");
});

test("duplicate without refresh falls back to new memory", { timeout: TEST_TIMEOUT }, async () => {
  const { deps, created, refreshCalls } = makeDeps();
  deps.store!.searchSimilar = async () => [makeNeighbor("picked")];
  deps.store!.refreshMemory = async (id) => {
    refreshCalls.push(id);
    return null;
  };
  deps.classifyMemoryImpl = async () => ({ decision: "duplicate", targetId: "picked" });

  const result = await memorizeValue({ label: "label", content: "content", conversationId: "conv" }, deps);

  assert.equal(result.outcome, "created");
  assert.equal(created.length, 1);
  assert.equal(refreshCalls[0], "picked");
  assert.equal(result.predecessorId, undefined);
});

test("duplicate without target skips refresh and creates memory", { timeout: TEST_TIMEOUT }, async () => {
  const { deps, created, refreshCalls } = makeDeps();
  deps.store!.searchSimilar = async () => [];
  deps.classifyMemoryImpl = async () => ({ decision: "duplicate" });

  const result = await memorizeValue({ label: "label", content: "content", conversationId: "conv" }, deps);

  assert.equal(result.outcome, "created");
  assert.equal(created.length, 1);
  assert.equal(refreshCalls.length, 0);
  assert.equal(result.neighbors.length, 0);
});

test("uses default timeout and logger when not overridden", { timeout: TEST_TIMEOUT }, async () => {
  const warnings: string[] = [];
  const store: storeModule.MemoryStore = {
    searchSimilar: async () => {
      throw "search boom";
    },
    createMemory: async (input: MemorizeInput) =>
      buildRecord({ ...input, id: "default-created", createdAt: "created", refreshedAt: "refreshed" }),
    markSuccessor: async () => {},
    refreshMemory: async () => null
  } as unknown as storeModule.MemoryStore;

  mock.method(console, "warn", (msg: string) => warnings.push(String(msg)));

  try {
    const result = await memorizeValue(
      { label: "Label", content: "Content", conversationId: "conversation" },
      { store, classifyMemoryImpl: async () => ({ decision: "new" }) }
    );
    assert.equal(result.outcome, "created");
    assert.equal(result.memory.id, "default-created");
    assert.ok(warnings.some((msg) => msg.includes("search boom")));
  } finally {
    mock.restoreAll();
  }
});
