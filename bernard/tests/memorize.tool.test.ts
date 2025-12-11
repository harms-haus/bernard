import assert from "node:assert/strict";
import { test } from "vitest";

import {
  createMemorizeTool,
  type MemorizeDependencies,
  type MemorizeScheduler
} from "../agent/harness/intent/tools/memorize";

const TEST_TIMEOUT = 2000;

type HarnessDeps = {
  deps: MemorizeDependencies;
  scheduled: Array<() => Promise<void>>;
  memorizeCalls: unknown[];
  withTimeoutCalls: Array<{ timeoutMs?: number; label?: string }>;
  warnings: string[];
};

const makeDeps = (overrides: Partial<MemorizeDependencies> = {}): HarnessDeps => {
  const scheduled: Array<() => Promise<void>> = [];
  const memorizeCalls: unknown[] = [];
  const withTimeoutCalls: Array<{ timeoutMs?: number; label?: string }> = [];
  const warnings: string[] = [];

  const scheduler: MemorizeScheduler = (fn) => {
    // Preserve the runnable so the test can drive it synchronously.
    scheduled.push(fn as () => Promise<void>);
    return 0 as unknown as ReturnType<typeof setTimeout>;
  };

  const deps: MemorizeDependencies = {
    scheduler,
    memorizeValueImpl: async (payload) => {
      memorizeCalls.push(payload);
      return { ok: true } as unknown as Record<string, unknown>;
    },
    withTimeoutImpl: async <T>(promise: Promise<T>, timeoutMs?: number, label?: string) => {
      withTimeoutCalls.push({ timeoutMs, label });
      return promise;
    },
    verifyConfigurationImpl: async () => ({ ok: true }),
    logger: { warn: (msg: string) => warnings.push(msg) },
    ...overrides
  };

  return { deps, scheduled, memorizeCalls, withTimeoutCalls, warnings };
};

void test(
  "memorize tool queues background work with provided conversation id",
  { timeout: TEST_TIMEOUT },
  async () => {
    const { deps, scheduled, memorizeCalls, withTimeoutCalls } = makeDeps();
    const tool = createMemorizeTool(deps);

    const result = await tool.invoke(
      { label: "greeting", content: "hello there" },
      { conversationId: "conv-123" }
    );

    assert.equal(result.status, "queued");
    assert.equal(result.label, "greeting");
    assert.equal(result.conversationId, "conv-123");
    assert.ok(result.note.toLowerCase().includes("background"));

    assert.equal(scheduled.length, 1);
    await scheduled[0]();

    assert.equal(memorizeCalls.length, 1);
    const payload = memorizeCalls[0] as { conversationId: string };
    assert.equal(payload.conversationId, "conv-123");
    assert.equal(withTimeoutCalls.length, 1);
    assert.equal(withTimeoutCalls[0]?.timeoutMs, Number(process.env["MEMORIZE_BACKGROUND_TIMEOUT_MS"]) || 30_000);
    assert.equal(withTimeoutCalls[0]?.label, "memorize background");
  }
);

void test(
  "memorize tool defaults conversation id to unknown",
  { timeout: TEST_TIMEOUT },
  async () => {
    const { deps, scheduled, memorizeCalls } = makeDeps();
    const tool = createMemorizeTool(deps);

    const result = await tool.invoke({ label: "fact", content: "42" });
    assert.equal(result.conversationId, "unknown");

    assert.equal(scheduled.length, 1);
    await scheduled[0]();
    assert.equal((memorizeCalls[0] as { conversationId: string }).conversationId, "unknown");
  }
);

void test(
  "memorize tool logs warning when background work fails",
  { timeout: TEST_TIMEOUT },
  async () => {
    const error = new Error("boom");
    const { deps, scheduled, warnings } = makeDeps({
      memorizeValueImpl: async () => {
        throw error;
      }
    });
    const tool = createMemorizeTool(deps);

    await tool.invoke({ label: "failing", content: "content" });
    assert.equal(scheduled.length, 1);
    await scheduled[0]();

    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? "", /background run failed/i);
    assert.match(warnings[0] ?? "", /boom/);
  }
);

void test(
  "memorize tool verifyConfiguration delegates to dependency",
  { timeout: TEST_TIMEOUT },
  async () => {
    const verifyCalls: Array<{ at: number }> = [];
    const { deps } = makeDeps({
      verifyConfigurationImpl: async () => {
        verifyCalls.push({ at: Date.now() });
        return { ok: false, reason: "missing config" };
      }
    });
    const tool = createMemorizeTool(deps);

    const verify = await tool.verifyConfiguration?.();
    assert.equal(verify?.ok, false);
    assert.match(verify?.reason ?? "", /missing config/);
    assert.equal(verifyCalls.length, 1);
  }
);

