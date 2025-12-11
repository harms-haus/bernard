import assert from "node:assert/strict";
import test from "node:test";
import { HumanMessage } from "@langchain/core/messages";

import { ConversationSummaryService } from "../lib/conversation/summary";
import type { MessageRecord } from "../lib/conversation/types";

const TEST_TIMEOUT = 2_000;
const originalApiKey = process.env.OPENROUTER_API_KEY;

class FakeModel {
  calls: Array<{ messages: unknown[] }> = [];
  private readonly response: unknown;
  private readonly error?: Error;

  constructor(response: unknown, error?: Error) {
    this.response = response;
    this.error = error;
  }

  async invoke(messages: unknown[]) {
    this.calls.push({ messages });
    if (this.error) throw this.error;
    return { content: this.response };
  }
}

const makeMessages = (count: number): MessageRecord[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `m-${i}`,
    role: "user",
    content: `msg-${i}`,
    createdAt: new Date().toISOString()
  }));

test.afterEach(() => {
  process.env.OPENROUTER_API_KEY = originalApiKey;
});

void test(
  "create throws when OPENROUTER_API_KEY is missing",
  { timeout: TEST_TIMEOUT },
  async () => {
    delete process.env.OPENROUTER_API_KEY;
    await assert.rejects(
      () => ConversationSummaryService.create({ model: "test-model" }),
      /OPENROUTER_API_KEY/
    );
  }
);

void test(
  "create constructs with provider-only suffix without throwing",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env.OPENROUTER_API_KEY = "key";
    const service = await ConversationSummaryService.create({
      model: "test-model|providerA,providerB",
      baseURL: "https://example.com"
    });
    assert.ok(service instanceof ConversationSummaryService);
  }
);

void test(
  "summarize filters llm traces, trims history, and parses response",
  { timeout: TEST_TIMEOUT },
  async () => {
    const fake = new FakeModel(
      JSON.stringify({
        summary: "done",
        tags: [1, "b"],
        keywords: [true, "word"],
        places: [null, "place"],
        flags: { explicit: true, forbidden: false }
      })
    );
    const service = ConversationSummaryService.fromModel(fake as any);

    const history = [
      {
        id: "trace-1",
        role: "system",
        content: "trace content",
        metadata: { traceType: "llm_call" },
        createdAt: new Date().toISOString()
      } as MessageRecord,
      ...makeMessages(82),
      {
        id: "obj-1",
        role: "assistant",
        content: { foo: "bar" },
        createdAt: new Date().toISOString()
      } as MessageRecord
    ];

    const result = await service.summarize("conv-1", history);

    assert.equal(result.summary, "done");
    assert.deepEqual(result.tags, ["1", "b"]);
    assert.deepEqual(result.keywords, ["true", "word"]);
    assert.deepEqual(result.places, ["null", "place"]);
    assert.equal(result.flags.explicit, true);
    assert.equal(result.flags.forbidden, false);

    const call = fake.calls[0];
    assert.ok(call);
    const human = (call.messages[1] as HumanMessage).content as string;
    assert.match(human, /Conversation ID: conv-1/);
    assert.match(human, /\[assistant\] /);
    assert.match(human, /"foo": "bar"/);
    assert.ok(!human.includes("msg-0"));
  }
);

void test(
  "summarize returns summaryError when model invocation fails",
  { timeout: TEST_TIMEOUT },
  async () => {
    const service = ConversationSummaryService.fromModel(
      new FakeModel("", new Error("invoke failure")) as any
    );
    const result = await service.summarize("conv-err", makeMessages(1));
    assert.equal(result.flags.summaryError, true);
    assert.match(result.summaryError ?? "", /invoke failure/);
  }
);

void test(
  "helpers handle invalid JSON and non-object payloads",
  { timeout: TEST_TIMEOUT },
  async () => {
    const service = ConversationSummaryService.fromModel(new FakeModel("") as any);
    const parseJson = (service as any).parseJson.bind(service);
    const toStringArray = (service as any).toStringArray.bind(service);
    const trimMessages = (service as any).trimMessages.bind(service);
    const buildPrompt = (service as any).buildPrompt.bind(service);

    const invalidResponse = await ConversationSummaryService.fromModel(new FakeModel("not json") as any).summarize(
      "conv-bad",
      makeMessages(1)
    );
    assert.equal(invalidResponse.flags.summaryError, true);

    const nonObject = parseJson("[]");
    assert.equal(nonObject.summary, "");
    assert.equal(nonObject.flags.summaryError, true);

    assert.deepEqual(toStringArray(["x", 1, false]), ["x", "1", "false"]);
    assert.deepEqual(toStringArray(null), []);

    const trimmed = trimMessages(makeMessages(5), 2);
    assert.equal(trimmed.length, 2);
    assert.equal(trimmed[0].id, "m-3");

    const prompt = buildPrompt("conv-2", [
      { id: "1", role: "user", content: { nested: true }, createdAt: new Date().toISOString() }
    ]);
    assert.match(prompt, /conv-2/);
    assert.match(prompt, /\[user\]/);
    assert.match(prompt, /"nested": true/);
  }
);
