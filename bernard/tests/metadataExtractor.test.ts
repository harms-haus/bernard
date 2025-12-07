import assert from "node:assert/strict";
import test from "node:test";

import { MetadataExtractor, metadataToYaml } from "../lib/metadata";
import { __metadataToolTestHooks, metadataTool } from "../libs/tools/metadata";

class FakeModel {
  constructor(private readonly reply: unknown) {}

  async invoke(): Promise<{ content: string }> {
    if (typeof this.reply === "string") return { content: this.reply };
    return { content: JSON.stringify(this.reply) };
  }
}

class CountingModel {
  calls = 0;
  constructor(private readonly reply: unknown) {}

  async invoke(): Promise<{ content: string }> {
    this.calls += 1;
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

void test("MetadataExtractor respects category filters", async () => {
  const model = new CountingModel({ value: "topic" });
  const extractor = new MetadataExtractor({ model });

  const result = await extractor.extract({
    text: "Talking about groceries for the week",
    category: "topic",
    now: new Date("2024-02-03T10:11:12Z")
  });

  assert.equal(result.metadata.mentioned_topic, "topic");
  assert.equal(result.metadata.message_topic, "topic");
  assert.equal(result.metadata.mentioned_time, undefined);
  assert.equal(model.calls, 2);
});

void test("metadataToYaml renders stable YAML output", () => {
  const yaml = metadataToYaml({
    cur_time: "2024-02-03T10:11:12Z",
    mentioned_topic: "groceries: milk and eggs",
    mentioned_person: null
  });

  assert.match(yaml, /cur_time: 2024-02-03T10:11:12Z/);
  assert.match(yaml, /mentioned_topic: "groceries: milk and eggs"/);
  assert.match(yaml, /mentioned_person: null/);
});

void test("metadata tool returns YAML for requested categories", async () => {
  const fakeModel = new FakeModel({ value: "topic" });
  __metadataToolTestHooks.resetCache();
  __metadataToolTestHooks.setExtractorFactory(() => new MetadataExtractor({ model: fakeModel }));

  try {
    const result = await metadataTool.invoke({ message: "hi", category: "topic" } as any);
    const output = String(result);
    assert.match(output, /mentioned_topic: topic/);
    assert.match(output, /message_topic: topic/);
    assert.equal(/mentioned_time:/.test(output), false);
  } finally {
    __metadataToolTestHooks.setExtractorFactory();
  }
});

