import assert from "node:assert";
import { describe, it } from "node:test";
import { Document } from "@langchain/core/documents";

import { memorizeValue } from "../lib/memoryService";
import { MemoryStore, type MemoryRecord } from "../lib/memoryStore";
import { FakeRedis } from "./fakeRedis";

class StubVectorStore {
  private docs: Document[] = [];

  async addDocuments(documents: Document[], options?: { ids?: string[] }): Promise<void> {
    documents.forEach((doc, idx) => {
      const id = options?.ids?.[idx] ?? (doc.metadata as { id?: string }).id ?? doc.pageContent;
      (doc.metadata as { id?: string }).id = id;
      this.docs.push(doc);
    });
  }

  async similaritySearchWithScore(query: string, k = 5): Promise<Array<[Document, number]>> {
    const results = this.docs.map((doc) => {
      const score = doc.pageContent === query ? 0.95 : 0.5;
      return [doc, score] as [Document, number];
    });
    return results.slice(0, k);
  }

  async delete(options: { ids: string[] }): Promise<void> {
    this.docs = this.docs.filter((doc) => {
      const id = (doc.metadata as { id?: string }).id;
      return id ? !options.ids.includes(id) : true;
    });
  }
}

describe("memoryService", () => {
  it("refreshes duplicates instead of creating new entries", async () => {
    const vector = new StubVectorStore();
    const store = new MemoryStore(new FakeRedis() as unknown as any, Promise.resolve(vector));

    const first = await memorizeValue(
      { label: "home", content: "123 Main St", conversationId: "c1" },
      { store }
    );
    assert.strictEqual(first.outcome, "created");

    const second = await memorizeValue(
      { label: "home", content: "123 Main St", conversationId: "c1" },
      { store }
    );

    assert.strictEqual(second.outcome, "refreshed");
    assert.strictEqual(second.memory.id, first.memory.id);
  });
});

