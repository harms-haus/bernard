import assert from "node:assert/strict";
import { test } from "vitest";
import { createDelegateSequencer } from "./delegateSequencer";

test("createDelegateSequencer yields items from chained iterables in order", async () => {
  const sequencer = createDelegateSequencer<number>();

  // Start consuming the sequence
  const results: number[] = [];
  const consumer = (async () => {
    for await (const item of sequencer.sequence) {
      results.push(item);
    }
  })();

  // Chain some iterables
  sequencer.chain([1, 2, 3]);
  sequencer.chain([4, 5]);
  sequencer.chain(null); // End the sequence

  await consumer;

  assert.deepEqual(results, [1, 2, 3, 4, 5]);
});

test("createDelegateSequencer handles async iterables", async () => {
  const sequencer = createDelegateSequencer<string>();

  const results: string[] = [];
  const consumer = (async () => {
    for await (const item of sequencer.sequence) {
      results.push(item);
    }
  })();

  // Create an async iterable
  async function* asyncGen() {
    yield "async1";
    await new Promise(resolve => setTimeout(resolve, 1));
    yield "async2";
  }

  sequencer.chain(asyncGen());
  sequencer.chain(["sync1", "sync2"]);
  sequencer.chain(null);

  await consumer;

  assert.deepEqual(results, ["async1", "async2", "sync1", "sync2"]);
});

test("createDelegateSequencer handles null chains (termination)", async () => {
  const sequencer = createDelegateSequencer<number>();

  const results: number[] = [];
  const consumer = (async () => {
    for await (const item of sequencer.sequence) {
      results.push(item);
    }
  })();

  sequencer.chain([1, 2]);
  sequencer.chain(null); // This should terminate
  sequencer.chain([3, 4]); // This should be ignored after null

  await consumer;

  assert.deepEqual(results, [1, 2]);
});

test("createDelegateSequencer allows chaining after consumption starts", async () => {
  const sequencer = createDelegateSequencer<number>();

  const results: number[] = [];
  let chainCount = 0;

  const consumer = (async () => {
    for await (const item of sequencer.sequence) {
      results.push(item);
      // Chain more items based on what we consume
      if (item === 2 && chainCount === 0) {
        chainCount++;
        sequencer.chain([3, 4]);
      }
      if (item === 4 && chainCount === 1) {
        chainCount++;
        sequencer.chain(null); // Terminate
      }
    }
  })();

  sequencer.chain([1, 2]);

  await consumer;

  assert.deepEqual(results, [1, 2, 3, 4]);
});

test("createDelegateSequencer handles empty iterables", async () => {
  const sequencer = createDelegateSequencer<number>();

  const results: number[] = [];
  const consumer = (async () => {
    for await (const item of sequencer.sequence) {
      results.push(item);
    }
  })();

  sequencer.chain([]); // Empty array
  sequencer.chain([1, 2]);
  sequencer.chain([]); // Another empty
  sequencer.chain([3]);
  sequencer.chain(null);

  await consumer;

  assert.deepEqual(results, [1, 2, 3]);
});
