import assert from "node:assert/strict";
import { test } from "vitest";
import { encodeSSE, createSSEStream } from "../agent/streaming/sse";
import type { OpenAIStreamingChunk, BernardTraceChunk } from "../agent/streaming/types";

test("encodeSSE encodes OpenAI streaming chunk correctly", () => {
  const chunk: OpenAIStreamingChunk = {
    id: "chatcmpl-test",
    object: "chat.completion.chunk",
    created: 1234567890,
    model: "bernard-1",
    choices: [
      {
        index: 0,
        delta: {
          content: "Hello",
        },
      },
    ],
  };

  const result = encodeSSE(chunk);
  const expected = `data: ${JSON.stringify(chunk)}\n\n`;

  assert.equal(result, expected);
});

test("encodeSSE encodes Bernard trace chunk correctly", () => {
  const chunk: BernardTraceChunk = {
    id: "chatcmpl-test",
    object: "chat.completion.chunk",
    created: 1234567890,
    model: "bernard-1",
    choices: [],
    bernard: {
      type: "trace",
      data: {
        type: "llm_prompt",
        prompt: "Test prompt",
        model: "bernard-1",
      },
    },
  };

  const result = encodeSSE(chunk);
  const expected = `data: ${JSON.stringify(chunk)}\n\n`;

  assert.equal(result, expected);
});

test("createSSEStream streams chunks correctly", async () => {
  const chunks: OpenAIStreamingChunk[] = [
    {
      id: "chatcmpl-test1",
      object: "chat.completion.chunk",
      created: 1234567890,
      model: "bernard-1",
      choices: [
        {
          index: 0,
          delta: { content: "Hello" },
        },
      ],
    },
    {
      id: "chatcmpl-test2",
      object: "chat.completion.chunk",
      created: 1234567891,
      model: "bernard-1",
      choices: [
        {
          index: 0,
          delta: { content: " world" },
        },
      ],
    },
  ];

  async function* chunkGenerator() {
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  const stream = createSSEStream(chunkGenerator());
  const reader = stream.getReader();
  const results: string[] = [];

  let done = false;
  while (!done) {
    const { value, done: readerDone } = await reader.read();
    done = readerDone;
    if (value) {
      results.push(new TextDecoder().decode(value));
    }
  }

  // Should have 2 data chunks + 1 [DONE] chunk
  assert.equal(results.length, 3);

  // First chunk
  const firstExpected = `data: ${JSON.stringify(chunks[0])}\n\n`;
  assert.equal(results[0], firstExpected);

  // Second chunk
  const secondExpected = `data: ${JSON.stringify(chunks[1])}\n\n`;
  assert.equal(results[1], secondExpected);

  // Done marker
  assert.equal(results[2], "data: [DONE]\n\n");
});

test("createSSEStream handles errors gracefully", async () => {
  async function* failingGenerator() {
    yield {
      id: "test",
      object: "chat.completion.chunk" as const,
      created: 1234567890,
      model: "bernard-1",
      choices: [],
    };
    throw new Error("Test error");
  }

  const stream = createSSEStream(failingGenerator());
  const reader = stream.getReader();

  // First chunk should work
  const { value: firstValue } = await reader.read();
  assert(firstValue);

  // Second read should fail
  try {
    await reader.read();
    assert.fail("Expected error");
  } catch (error) {
    assert(error instanceof Error);
    assert.equal(error.message, "Test error");
  }
});
