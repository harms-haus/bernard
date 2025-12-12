import { beforeEach, afterAll, afterEach, expect, test, vi } from "vitest";

const queueCtor = vi.fn();
const eventsCtor = vi.fn();
const workerCtor = vi.fn();

vi.mock("bullmq", () => {
  class MockQueue {
    name: string;
    opts: unknown;
    constructor(name: string, opts: unknown) {
      this.name = name;
      this.opts = opts;
      queueCtor(name, opts);
    }
  }

  class MockQueueEvents {
    constructor(name: string, opts: unknown) {
      eventsCtor(name, opts);
    }
  }

  class MockWorker {
    name: string;
    processor: unknown;
    opts: unknown;
    constructor(name: string, processor: unknown, opts: unknown) {
      this.name = name;
      this.processor = processor;
      this.opts = opts;
      workerCtor(name, processor, opts);
    }
  }

  return {
    Queue: MockQueue,
    QueueEvents: MockQueueEvents,
    Worker: MockWorker
  };
});

const originalEnv = { ...process.env };
const clearEnvKeys = (keys: string[]) => keys.forEach((k) => delete process.env[k]);

beforeEach(() => {
  vi.resetModules();
  queueCtor.mockClear();
  eventsCtor.mockClear();
  workerCtor.mockClear();
  // restore env while removing keys that may have been added
  Object.keys(process.env).forEach((key) => {
    if (!(key in originalEnv)) delete process.env[key];
  });
  Object.assign(process.env, originalEnv);
});

afterEach(() => {
  Object.keys(process.env).forEach((key) => {
    if (!(key in originalEnv)) delete process.env[key];
  });
  Object.assign(process.env, originalEnv);
});

afterAll(() => {
  vi.restoreAllMocks();
});

test("creates conversation queue with defaults and merges job options", async () => {
  clearEnvKeys([
    "CONVERSATION_QUEUE_NAME",
    "QUEUE_PREFIX",
    "REDIS_URL",
    "CONVERSATION_TASK_ATTEMPTS",
    "CONVERSATION_TASK_BACKOFF_MS",
    "CONVERSATION_TASK_KEEP_COMPLETED",
    "CONVERSATION_TASK_KEEP_FAILED"
  ]);
  const { createConversationQueue } = await import("../lib/queue/client");

  createConversationQueue();

  expect(queueCtor).toHaveBeenCalledTimes(1);
  const [name, opts] = queueCtor.mock.calls[0];
  expect(name).toBe("conversation-tasks");
  expect(opts).toMatchObject({
    connection: { url: "redis://localhost:6379" },
    prefix: "bernard:q",
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 1000
    }
  });
});

test("respects env overrides and caller job option overrides without mutation", async () => {
  Object.assign(process.env, {
    CONVERSATION_QUEUE_NAME: "custom-queue",
    QUEUE_PREFIX: "custom-prefix",
    REDIS_URL: "redis://example:6380",
    CONVERSATION_TASK_ATTEMPTS: "5",
    CONVERSATION_TASK_BACKOFF_MS: "2500",
    CONVERSATION_TASK_KEEP_COMPLETED: "50",
    CONVERSATION_TASK_KEEP_FAILED: "500"
  });

  const { createConversationQueue } = await import("../lib/queue/client");
  const options = {
    prefix: "caller-prefix",
    defaultJobOptions: { attempts: 7, backoff: { type: "fixed", delay: 2500 } }
  } as const;

  createConversationQueue({ ...options });

  expect(queueCtor).toHaveBeenCalledTimes(1);
  const [, opts] = queueCtor.mock.calls[0];
  expect(opts).toMatchObject({
    connection: { url: "redis://example:6380" },
    prefix: "caller-prefix",
    defaultJobOptions: {
      attempts: 7,
      backoff: { type: "fixed", delay: 2500 },
      removeOnComplete: 50,
      removeOnFail: 500
    }
  });
  expect(options.defaultJobOptions.backoff).toEqual({ type: "fixed", delay: 2500 });
});

test("creates queue events with merged options", async () => {
  Object.assign(process.env, { CONVERSATION_QUEUE_NAME: "ev-queue", REDIS_URL: "redis://custom:6379" });
  const { createConversationQueueEvents } = await import("../lib/queue/client");

  createConversationQueueEvents({ prefix: "events-prefix", connection: { url: "redis://ignored" } });

  expect(eventsCtor).toHaveBeenCalledTimes(1);
  const [name, opts] = eventsCtor.mock.calls[0];
  expect(name).toBe("ev-queue");
  expect(opts).toEqual({
    connection: { url: "redis://ignored" },
    prefix: "events-prefix"
  });
});

test("creates worker using env concurrency but caller override wins", async () => {
  Object.assign(process.env, { CONVERSATION_TASK_CONCURRENCY: "7", REDIS_URL: "redis://c:6379" });
  const { createConversationWorker } = await import("../lib/queue/client");
  const processor = vi.fn();

  createConversationWorker(processor, { concurrency: 2, limiter: { max: 5 } });

  expect(workerCtor).toHaveBeenCalledTimes(1);
  const [name, passedProcessor, opts] = workerCtor.mock.calls[0];
  expect(name).toBe("conversation-tasks");
  expect(passedProcessor).toBe(processor);
  expect(opts).toMatchObject({
    connection: { url: "redis://c:6379" },
    prefix: "bernard:q",
    limiter: { max: 5 },
    concurrency: 2
  });
});

test("falls back to default job options when env values are zero", async () => {
  Object.assign(process.env, {
    CONVERSATION_TASK_ATTEMPTS: "0",
    CONVERSATION_TASK_BACKOFF_MS: "0",
    CONVERSATION_TASK_KEEP_COMPLETED: "0",
    CONVERSATION_TASK_KEEP_FAILED: "0"
  });
  const { createConversationQueue } = await import("../lib/queue/client");

  createConversationQueue();

  const [, opts] = queueCtor.mock.calls[0];
  expect(opts).toMatchObject({
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 1000
    }
  });
});

test("worker uses default concurrency when env is invalid", async () => {
  Object.assign(process.env, { CONVERSATION_TASK_CONCURRENCY: "0" });
  const { createConversationWorker } = await import("../lib/queue/client");
  const processor = vi.fn();

  createConversationWorker(processor);

  const [, , opts] = workerCtor.mock.calls[0];
  expect(opts).toMatchObject({ concurrency: 3 });
});
