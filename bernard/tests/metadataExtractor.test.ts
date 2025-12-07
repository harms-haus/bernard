import assert from "node:assert/strict";
import test from "node:test";

import { MetadataExtractor } from "../lib/metadata";

class FakeModel {
  constructor(private readonly reply: unknown) {}

  async invoke(): Promise<{ content: string }> {
    if (typeof this.reply === "string") return { content: this.reply };
    return { content: JSON.stringify(this.reply) };
  }
}

void test("MetadataExtractor fills current context defaults", async () => {
  const now = new Date("2024-02-03T10:11:12Z");
  const extractor = new MetadataExtractor({ model: new FakeModel({}) });

  const result = await extractor.extract({
    text: "",
    now,
    currentLocation: "home"
  });

  assert.equal(result.metadata.cur_time, now.toISOString());
  assert.equal(result.metadata.cur_date, "2024-02-03");
  assert.equal(result.metadata.cur_location, "home");
});

void test("MetadataExtractor parses returned values and drops unknown keys", async () => {
  const fakeResponse = {
    mentioned_person: "John",
    mentioned_topic: ["work", "errands"],
    extra_field: "ignore me"
  };
  const extractor = new MetadataExtractor({ model: new FakeModel(fakeResponse) });

  const result = await extractor.extract({
    text: "I talked to John about work",
    now: new Date("2024-02-03T10:11:12Z")
  });

  assert.equal(result.metadata.mentioned_person, "John");
  assert.equal(result.metadata.mentioned_topic, "work; errands");
  assert.equal((result.metadata as Record<string, unknown>).extra_field, undefined);
});

