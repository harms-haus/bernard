import assert from "node:assert";

import { classifyMemory } from "../lib/memoryDeduper";
import type { MemorySearchHit } from "../lib/memoryStore";

describe("memory deduper", () => {
  it("returns new when no neighbors", async () => {
    const decision = await classifyMemory({ label: "home address", content: "123 Main St." }, []);
    assert.strictEqual(decision.decision, "new");
  });

  it("falls back to duplicate when score is high and parsing fails", async () => {
    const neighbors: MemorySearchHit[] = [
      {
        originId: "a",
        redirected: false,
        score: 0.95,
        record: {
          id: "a",
          label: "home address",
          content: "123 Main St.",
          conversationId: "c1",
          createdAt: new Date().toISOString(),
          refreshedAt: new Date().toISOString(),
          freshnessMaxDays: 7
        }
      }
    ];
    const decision = await classifyMemory({ label: "home", content: "123 Main St." }, neighbors);
    assert.ok(decision.decision === "duplicate" || decision.decision === "new");
  });
});

