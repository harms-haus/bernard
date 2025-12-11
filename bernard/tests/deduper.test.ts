import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNeighborsSummary,
  classifyMemory,
  fallbackDecision,
  getDedupSetupTimeoutMs,
  getDedupTimeoutMs,
  normalizeContent,
  parseTimeoutMs,
  tryParseDecision
} from "@/lib/memory/deduper";
import type { MemorySearchHit } from "@/lib/memory/store";

const TEST_TIMEOUT = 2_000;
const originalEnv = { ...process.env };
const originalWarn = console.warn;
const originalDebug = console.debug;

const resetEnv = () => {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
};

const sampleNeighbor = (id: string, score: number, successorId?: string): MemorySearchHit => ({
  record: {
    id,
    label: `label-${id}`,
    content: `content-${id}`,
    conversationId: "c",
    createdAt: "now",
    refreshedAt: "now",
    freshnessMaxDays: 7,
    successorId
  },
  score,
  originId: id
});

const stubConsole = () => {
  const warns: unknown[][] = [];
  const debugs: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    warns.push(args);
  };
  console.debug = (...args: unknown[]) => {
    debugs.push(args);
  };
  return { warns, debugs };
};

test.beforeEach(() => {
  resetEnv();
  console.warn = originalWarn;
  console.debug = originalDebug;
});

test.afterEach(() => {
  resetEnv();
  console.warn = originalWarn;
  console.debug = originalDebug;
});

void test(
  "parseTimeoutMs defaults when empty and warns on invalid",
  { timeout: TEST_TIMEOUT },
  () => {
    const { warns } = stubConsole();
    const defaulted = parseTimeoutMs(undefined, 123, "KEY");
    assert.equal(defaulted, 123);
    assert.equal(warns.length, 0);

    const invalid = parseTimeoutMs("abc", 456, "KEY");
    assert.equal(invalid, 456);
    assert.equal(warns.length, 1);
    assert.match(warns[0]?.join(" ") ?? "", /Invalid KEY/);
  }
);

void test(
  "timeout helpers respect env overrides and warn on invalid numbers",
  { timeout: TEST_TIMEOUT },
  () => {
    const { warns } = stubConsole();
    process.env["MEMORY_DEDUP_TIMEOUT_MS"] = "1500";
    process.env["MEMORY_DEDUP_SETUP_TIMEOUT_MS"] = "-5";

    assert.equal(getDedupTimeoutMs(), 1500);
    assert.equal(getDedupSetupTimeoutMs(), 1_000);
    assert.equal(warns.length, 1);
    assert.match(warns[0]?.join(" ") ?? "", /MEMORY_DEDUP_SETUP_TIMEOUT_MS/);
  }
);

void test(
  "normalizeContent handles strings, arrays, objects, and fallbacks",
  { timeout: TEST_TIMEOUT },
  () => {
    assert.equal(normalizeContent("hello"), "hello");
    assert.equal(normalizeContent(["a", "b"]), "a\nb");
    assert.equal(
      normalizeContent({
        toString: () => "custom"
      }),
      "custom"
    );
    assert.equal(normalizeContent(42), "");
  }
);

void test(
  "buildNeighborsSummary returns friendly text and limits to five items",
  { timeout: TEST_TIMEOUT },
  () => {
    assert.match(buildNeighborsSummary([]), /No similar memories/);

    const neighbors = [
      sampleNeighbor("a", 0.99),
      sampleNeighbor("b", 0.91),
      sampleNeighbor("c", 0.8, "s-c"),
      sampleNeighbor("d", 0.7),
      sampleNeighbor("e", 0.6),
      sampleNeighbor("f", 0.5)
    ];
    const summary = buildNeighborsSummary(neighbors);
    assert.ok(summary.includes("1. id=a"));
    assert.ok(summary.includes("5. id=e"));
    assert.ok(!summary.includes("6. id=f"));
    assert.match(summary, /successorId=none/);
    assert.match(summary, /score=0\.9900/);
  }
);

void test(
  "tryParseDecision parses valid JSON and rejects malformed content",
  { timeout: TEST_TIMEOUT },
  () => {
    const parsed = tryParseDecision(`{"decision":"duplicate","targetId":"t-1"}`);
    assert.deepEqual(parsed, { decision: "duplicate", targetId: "t-1" });

    const missingTarget = tryParseDecision(`{"decision":"new"}`);
    assert.deepEqual(missingTarget, { decision: "new" });

    assert.equal(tryParseDecision("not json"), null);
    assert.equal(tryParseDecision(`{"decision":"unknown"}`), null);
  }
);

void test(
  "fallbackDecision prefers duplicate when score is strong",
  { timeout: TEST_TIMEOUT },
  () => {
    const neighbors = [sampleNeighbor("a", 0.95), sampleNeighbor("b", 0.5)];
    assert.deepEqual(fallbackDecision(neighbors), { decision: "duplicate", targetId: "a" });
    assert.deepEqual(fallbackDecision([]), { decision: "new" });
  }
);

void test(
  "classifyMemory returns new when no neighbors",
  { timeout: TEST_TIMEOUT },
  async () => {
    const decision = await classifyMemory({ label: "l", content: "c" }, []);
    assert.deepEqual(decision, { decision: "new" });
  }
);

void test(
  "classifyMemory falls back when api key is missing",
  { timeout: TEST_TIMEOUT },
  async () => {
    const neighbors = [sampleNeighbor("a", 0.97)];
    const decision = await classifyMemory(
      { label: "l", content: "c" },
      neighbors,
      {
        resolveApiKey: () => undefined,
        chatFactory: () => ({ invoke: async () => ({ content: "{}" }) })
      }
    );
    assert.deepEqual(decision, { decision: "duplicate", targetId: "a" });
  }
);

void test(
  "classifyMemory falls back on setup timeout and logs debug",
  { timeout: TEST_TIMEOUT },
  async () => {
    const { debugs } = stubConsole();
    const neighbors = [sampleNeighbor("a", 0.95)];
    const decision = await classifyMemory(
      { label: "l", content: "c" },
      neighbors,
      {
        resolveApiKey: () => "env-key",
        resolveModel: async () => ({ id: "m", options: {} }),
        withTimeout: async () => {
          throw new Error("memory dedup setup timed out");
        },
        chatFactory: () => ({ invoke: async () => ({ content: "{}" }) }),
        logger: console
      }
    );
    assert.deepEqual(decision, { decision: "duplicate", targetId: "a" });
    assert.ok(debugs.length >= 1);
  }
);

void test(
  "classifyMemory bubbles non-timeout setup errors",
  { timeout: TEST_TIMEOUT },
  async () => {
    await assert.rejects(
      () =>
        classifyMemory(
          { label: "l", content: "c" },
          [sampleNeighbor("a", 0.8)],
          {
            resolveApiKey: () => "env-key",
            resolveModel: async () => ({ id: "m", options: {} }),
            withTimeout: async () => {
              throw new Error("boom");
            },
            chatFactory: () => ({ invoke: async () => ({ content: "{}" }) })
          }
        ),
      /boom/
    );
  }
);

void test(
  "classifyMemory falls back when model resolution is null",
  { timeout: TEST_TIMEOUT },
  async () => {
    const neighbors = [sampleNeighbor("n", 0.93)];
    const decision = await classifyMemory(
      { label: "l", content: "c" },
      neighbors,
      {
        resolveApiKey: () => "env-key",
        resolveModel: async () => null as any,
        withTimeout: async (value) => await value,
        chatFactory: () => ({ invoke: async () => ({ content: "{}" }) })
      }
    );
    assert.deepEqual(decision, { decision: "duplicate", targetId: "n" });
  }
);

void test(
  "classifyMemory falls back when derived api key is missing",
  { timeout: TEST_TIMEOUT },
  async () => {
    const neighbors = [sampleNeighbor("x", 0.94)];
    const resolveApiKey = (apiKey?: string) => (apiKey ? undefined : "env-key");
    const decision = await classifyMemory(
      { label: "l", content: "c" },
      neighbors,
      {
        resolveApiKey,
        resolveModel: async () => ({ id: "m", options: {} }),
        withTimeout: async (value) => await value,
        chatFactory: () => ({ invoke: async () => ({ content: "{}" }) })
      }
    );
    assert.deepEqual(decision, { decision: "duplicate", targetId: "x" });
  }
);

void test(
  "classifyMemory uses LLM result, provider filter, and prompt contents",
  { timeout: TEST_TIMEOUT },
  async () => {
    const neighbors = [sampleNeighbor("p", 0.4), sampleNeighbor("q", 0.3)];
    let capturedOptions: any;
    let capturedMessages: any[] = [];
    const decision = await classifyMemory(
      { label: "title", content: "body" },
      neighbors,
      {
        resolveApiKey: () => "env-key",
        resolveModel: async () => ({ id: "model-id|provider-1", options: { baseUrl: "https://base" } }),
        resolveBaseUrl: (b, opts) => opts?.baseUrl ?? "fallback",
        withTimeout: async (value) => await value,
        chatFactory: (options) => {
          capturedOptions = options;
          return {
            invoke: async (messages) => {
              capturedMessages = messages;
              return { content: JSON.stringify({ decision: "update", targetId: "t-123" }) };
            }
          };
        }
      }
    );

    assert.deepEqual(decision, { decision: "update", targetId: "t-123" });
    assert.equal(capturedOptions.model, "model-id");
    assert.equal(capturedOptions.configuration?.baseURL, "https://base");
    assert.deepEqual(capturedOptions.modelKwargs?.provider?.only, ["provider-1"]);
    assert.equal(capturedMessages.length, 1);
    assert.match(String(capturedMessages[0]?.content ?? ""), /title/);
    assert.match(String(capturedMessages[0]?.content ?? ""), /Neighbors:/);
  }
);

void test(
  "classifyMemory falls back on invalid LLM output",
  { timeout: TEST_TIMEOUT },
  async () => {
    const neighbors = [sampleNeighbor("dup", 0.95)];
    const decision = await classifyMemory(
      { label: "l", content: "c" },
      neighbors,
      {
        resolveApiKey: () => "env-key",
        resolveModel: async () => ({ id: "m", options: {} }),
        withTimeout: async (value) => await value,
        chatFactory: () => ({
          invoke: async () => ({
            content: [{ text: "not json" }]
          })
        })
      }
    );
    assert.deepEqual(decision, { decision: "duplicate", targetId: "dup" });
  }
);

void test(
  "classifyMemory falls back on LLM timeout",
  { timeout: TEST_TIMEOUT },
  async () => {
    const neighbors = [sampleNeighbor("dup", 0.96)];
    const silentLogger = { debug: () => {}, warn: () => {} };
    const decision = await classifyMemory(
      { label: "l", content: "c" },
      neighbors,
      {
        resolveApiKey: () => "env-key",
        resolveModel: async () => ({ id: "m", options: {} }),
        withTimeout: async (value, _ms, label) => {
          if (label === "memory dedup") {
            const err = new Error("took too long");
            err.name = "TimeoutError";
            throw err;
          }
          return await value;
        },
        chatFactory: () => ({
          invoke: async () => ({ content: JSON.stringify({ decision: "new" }) })
        }),
        logger: silentLogger
      }
    );
    assert.deepEqual(decision, { decision: "duplicate", targetId: "dup" });
  }
);
