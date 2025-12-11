import assert from "node:assert/strict";
import { test } from "vitest";

import { RecordKeeper } from "../lib/conversation/recordKeeper";
import { CONVERSATION_TASKS } from "../lib/queue/types";
import { buildConversationTaskProcessor } from "../lib/queue/conversationTasks";
import type { ConversationTaskResult } from "../lib/queue/conversationTasks";
import type { ConversationSummaryService } from "../lib/conversation/summary";
import { FakeRedis } from "./fakeRedis";

type StubQueueCall = { name: string; data: unknown; opts?: unknown };

class StubQueue {
  calls: StubQueueCall[] = [];
  async add(name: string, data: unknown, opts?: unknown) {
    this.calls.push({ name, data, opts });
    return { name, data, opts };
  }
}

function createKeeperWithQueue(queue: StubQueue) {
  const redis = new FakeRedis();
  const keeper = new RecordKeeper(redis as any, { queueDisabled: false, queue });
  return { redis, keeper, queue };
}

test("closeConversation enqueues tasks with provided queue", async () => {
  const stubQueue = new StubQueue();
  const { keeper, queue } = createKeeperWithQueue(stubQueue);
  const { conversationId } = await keeper.startRequest("tok", "model");
  await keeper.closeConversation(conversationId, "done");

  assert.equal(queue.calls.length, 3);
  const names = queue.calls.map((c) => c.name);
  assert.deepEqual(names.sort(), [CONVERSATION_TASKS.flag, CONVERSATION_TASKS.index, CONVERSATION_TASKS.summary].sort());
  queue.calls.forEach((call) => {
    assert.deepEqual(call.data, { conversationId });
    assert.ok((call.opts as { jobId?: string })?.jobId?.includes(conversationId));
  });
});

test("conversation task processor runs index, summary, and flag handlers", async () => {
  const redis = new FakeRedis();
  const keeper = new RecordKeeper(redis as any, { queueDisabled: true });
  const { conversationId } = await keeper.startRequest("tok2", "model2");
  const nowIso = new Date().toISOString();
  await keeper.appendMessages(conversationId, [
    { id: "m1", role: "user", content: "hello world", createdAt: nowIso },
    { id: "m2", role: "assistant", content: "some bomb threat", createdAt: nowIso }
  ]);

  const indexCalls: Array<{ chunks: number }> = [];
  const summarizer: Pick<ConversationSummaryService, "summarize"> = {
    summarize: async () =>
      ({
        summary: "summary!",
        tags: ["a", "b"],
        keywords: ["x"],
        places: ["kitchen"],
        flags: { explicit: false, forbidden: true }
      }) as any
  };

  const processor = buildConversationTaskProcessor({
    recordKeeper: keeper,
    redis: redis as any,
    summarizer: summarizer as ConversationSummaryService,
    indexer: {
      indexConversation: async () => {
        indexCalls.push({ chunks: 1 });
        return { chunks: 1, pruned: 0 };
      }
    }
  });

  const indexResult = (await processor({
    name: CONVERSATION_TASKS.index,
    data: { conversationId }
  } as any)) as ConversationTaskResult;
  assert.equal(indexResult.ok, true);
  assert.equal(indexCalls.length, 1);

  const summaryResult = (await processor({
    name: CONVERSATION_TASKS.summary,
    data: { conversationId }
  } as any)) as ConversationTaskResult;
  assert.equal(summaryResult.ok, true);
  const convAfterSummary = await redis.hgetall(`bernard:rk:conv:${conversationId}`);
  assert.equal(convAfterSummary.summary, "summary!");
  assert.deepEqual(JSON.parse(convAfterSummary.tags), ["a", "b"]);
  assert.deepEqual(JSON.parse(convAfterSummary.placeTags), ["kitchen"]);

  const flagResult = (await processor({
    name: CONVERSATION_TASKS.flag,
    data: { conversationId }
  } as any)) as ConversationTaskResult;
  assert.equal(flagResult.ok, true);
  const convAfterFlag = await redis.hgetall(`bernard:rk:conv:${conversationId}`);
  const flags = JSON.parse(convAfterFlag.flags);
  assert.equal(flags.forbidden, true);
});
