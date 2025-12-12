import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";

import { CONVERSATION_TASKS, buildConversationJobId } from "../lib/queue/types";
import { FakeRedis } from "./fakeRedis";

const recordKeeperInstances: Array<{
  getConversationWithMessages: ReturnType<typeof vi.fn>;
  updateConversationFlags: ReturnType<typeof vi.fn>;
  updateConversationSummary: ReturnType<typeof vi.fn>;
}> = [];
const mockRecordKeeperGetConversation = vi.fn();
const getRedisMock = vi.fn(() => new FakeRedis());

const storeAddDocuments = vi.fn();
const storeDelete = vi.fn();
const vectorStoreInstances: unknown[] = [];
const documentInstances: Array<{ pageContent: string; metadata: unknown }> = [];
const createClientMock = vi.fn();
const connectMock = vi.fn();
const getEmbeddingModelMock = vi.fn(async () => ({ embedQuery: () => Promise.resolve([0]) }));

vi.mock("@langchain/community/vectorstores/redis", () => {
  class MockRedisVectorStore {
    embeddings: unknown;
    options: unknown;
    constructor(embeddings: unknown, options: unknown) {
      this.embeddings = embeddings;
      this.options = options;
      vectorStoreInstances.push({ embeddings, options });
    }
    addDocuments = storeAddDocuments;
    delete = storeDelete;
  }
  return { RedisVectorStore: MockRedisVectorStore };
});

vi.mock("@langchain/core/documents", () => {
  class MockDocument {
    pageContent: string;
    metadata: unknown;
    constructor(args: { pageContent: string; metadata?: unknown }) {
      this.pageContent = args.pageContent;
      this.metadata = args.metadata;
      documentInstances.push({ pageContent: args.pageContent, metadata: args.metadata });
    }
  }
  return { Document: MockDocument };
});

vi.mock("redis", () => ({
  createClient: () => {
    createClientMock();
    return { connect: connectMock };
  }
}));

vi.mock("../lib/config/embeddings", () => ({
  getEmbeddingModel: getEmbeddingModelMock
}));

vi.mock("../lib/infra/redis", () => ({
  getRedis: getRedisMock
}));

vi.mock("../lib/conversation/recordKeeper", () => {
  class MockRecordKeeper {
    redis: unknown;
    getConversationWithMessages = mockRecordKeeperGetConversation;
    updateConversationFlags = vi.fn(async () => {});
    updateConversationSummary = vi.fn(async () => {});
    constructor(redis: unknown) {
      this.redis = redis;
      recordKeeperInstances.push(this);
    }
  }
  return { RecordKeeper: MockRecordKeeper };
});

const originalEnv = { ...process.env };
const restoreEnv = () => {
  Object.keys(process.env).forEach((key) => {
    if (!(key in originalEnv)) delete process.env[key];
  });
  Object.assign(process.env, originalEnv);
};

const silenceConsole = () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
};

const resetMocks = () => {
  storeAddDocuments.mockClear();
  storeDelete.mockClear();
  vectorStoreInstances.length = 0;
  documentInstances.length = 0;
  createClientMock.mockClear();
  connectMock.mockClear();
  getEmbeddingModelMock.mockClear();
  recordKeeperInstances.length = 0;
  mockRecordKeeperGetConversation.mockReset();
  getRedisMock.mockClear();
};

const loadTasksModule = async () => {
  // import after env/mocks reset for deterministic module constants
  return import("../lib/queue/conversationTasks");
};

beforeAll(() => {
  silenceConsole();
});

beforeEach(() => {
  vi.resetModules();
  restoreEnv();
  resetMocks();
});

afterEach(() => {
  restoreEnv();
});

afterAll(() => {
  vi.restoreAllMocks();
});

test(
  "processor rejects invalid payload",
  { timeout: 1500 },
  async () => {
    const { buildConversationTaskProcessor } = await loadTasksModule();
    const processor = buildConversationTaskProcessor({
      recordKeeper: { getConversationWithMessages: vi.fn() } as any,
      redis: new FakeRedis() as any
    });

    await expect(
      processor({ name: CONVERSATION_TASKS.index, data: {} } as any)
    ).rejects.toThrow("invalid conversation payload");
  }
);

test(
  "returns conversation_missing when record is absent",
  { timeout: 1500 },
  async () => {
    const { buildConversationTaskProcessor } = await loadTasksModule();
    const recordKeeper = { getConversationWithMessages: vi.fn(async () => null) };
    const processor = buildConversationTaskProcessor({
      recordKeeper: recordKeeper as any,
      redis: new FakeRedis() as any
    });

    const result = await processor({
      name: CONVERSATION_TASKS.index,
      data: { conversationId: "missing" }
    } as any);

    expect(result).toEqual({ ok: false, reason: "conversation_missing" });
  }
);

test(
  "index task filters traces, enforces limits, chunks, and logs",
  { timeout: 2000 },
  async () => {
    Object.assign(process.env, {
      CONVERSATION_INDEX_CHARS: "40",
      CONVERSATION_INDEX_MAX_CHUNKS: "3",
      CONVERSATION_INDEX_MESSAGE_LIMIT: "2"
    });
    const { buildConversationTaskProcessor } = await loadTasksModule();

    const conversationId = "conv-1";
    const logger = vi.fn();
    const capturedChunks: Array<{ conversationId: string; chunks: string[] }> = [];
    const indexer = {
      indexConversation: vi.fn(async (id: string, chunks: string[]) => {
        capturedChunks.push({ conversationId: id, chunks });
        return { chunks: chunks.length, pruned: 0 };
      })
    };
    const recordKeeper = {
      getConversationWithMessages: vi.fn(async () => ({
        messages: [
          { id: "trace", role: "assistant", content: "ignore me", createdAt: "", metadata: { traceType: "llm_call" } },
          { id: "first", role: "user", content: "keep this short", createdAt: "" },
          {
            id: "second",
            role: "assistant",
            content: "second entry that is quite long and will force split for chunks",
            createdAt: ""
          },
          { id: "tail", role: "user", content: "tail", createdAt: "" }
        ]
      }))
    };

    const processor = buildConversationTaskProcessor({
      indexer: indexer as any,
      recordKeeper: recordKeeper as any,
      redis: new FakeRedis() as any,
      logger
    });

    const result = await processor({
      name: CONVERSATION_TASKS.index,
      data: { conversationId }
    } as any);

    expect(indexer.indexConversation).toHaveBeenCalledTimes(1);
    expect(capturedChunks[0].conversationId).toBe(conversationId);
    expect(capturedChunks[0].chunks.length).toBe(2);
    expect(capturedChunks[0].chunks.join(" ")).not.toContain("ignore me");
    expect(result).toEqual({ ok: true, meta: { chunks: 2, pruned: 0 } });
    expect(logger).toHaveBeenCalledWith("conversation.indexed", expect.objectContaining({ conversationId, chunks: 2 }));
  }
);

test(
  "index task splits when combined entry length exceeds chunk size",
  { timeout: 1500 },
  async () => {
    Object.assign(process.env, {
      CONVERSATION_INDEX_CHARS: "20",
      CONVERSATION_INDEX_MAX_CHUNKS: "5",
      CONVERSATION_INDEX_MESSAGE_LIMIT: "10"
    });
    const { buildConversationTaskProcessor } = await loadTasksModule();
    const indexer = {
      indexConversation: vi.fn(async (_id: string, chunks: string[]) => ({ chunks: chunks.length, pruned: 0 }))
    };
    const recordKeeper = {
      getConversationWithMessages: vi.fn(async () => ({
        messages: [
          { id: "a", role: "user", content: "message one", createdAt: "" },
          { id: "b", role: "assistant", content: "message two", createdAt: "" }
        ]
      }))
    };

    const processor = buildConversationTaskProcessor({
      indexer: indexer as any,
      recordKeeper: recordKeeper as any,
      redis: new FakeRedis() as any
    });

    const result = await processor({
      name: CONVERSATION_TASKS.index,
      data: { conversationId: "conv-branch" }
    } as any);

    expect(indexer.indexConversation).toHaveBeenCalledTimes(1);
    const [, chunksArg] = indexer.indexConversation.mock.calls[0];
    expect(chunksArg).toEqual(["[user] message one", "[assistant] message"]);
    expect(result).toEqual({ ok: true, meta: { chunks: 2, pruned: 0 } });
  }
);

test(
  "index task stringifies non-string message content",
  { timeout: 1500 },
  async () => {
    const { buildConversationTaskProcessor } = await loadTasksModule();
    const indexer = {
      indexConversation: vi.fn(async (_id: string, chunks: string[]) => ({ chunks: chunks.length, pruned: 0 }))
    };
    const recordKeeper = {
      getConversationWithMessages: vi.fn(async () => ({
        messages: [{ id: "obj", role: "assistant", content: { note: "object content" }, createdAt: "" }]
      }))
    };

    const processor = buildConversationTaskProcessor({
      indexer: indexer as any,
      recordKeeper: recordKeeper as any,
      redis: new FakeRedis() as any
    });

    const result = await processor({
      name: CONVERSATION_TASKS.index,
      data: { conversationId: "conv-object" }
    } as any);

    const [, chunksArg] = indexer.indexConversation.mock.calls[0];
    expect(chunksArg[0]).toContain('"note": "object content"');
    expect(result).toEqual({ ok: true, meta: { chunks: 1, pruned: 0 } });
  }
);

test(
  "index task returns ok with zero chunks and does not call indexer",
  { timeout: 1500 },
  async () => {
    const { buildConversationTaskProcessor } = await loadTasksModule();
    const indexer = { indexConversation: vi.fn() };
    const recordKeeper = { getConversationWithMessages: vi.fn(async () => ({ messages: [] })) };
    const processor = buildConversationTaskProcessor({
      indexer: indexer as any,
      recordKeeper: recordKeeper as any,
      redis: new FakeRedis() as any
    });

    const result = await processor({
      name: CONVERSATION_TASKS.index,
      data: { conversationId: "conv-empty" }
    } as any);

    expect(result).toEqual({ ok: true, meta: { chunks: 0 } });
    expect(indexer.indexConversation).not.toHaveBeenCalled();
  }
);

test(
  "summary task uses provided summarizer and logger",
  { timeout: 2000 },
  async () => {
    const { buildConversationTaskProcessor } = await loadTasksModule();
    const conversationId = "conv-summary";
    const summaryPayload = {
      summary: "short summary",
      tags: ["t"],
      keywords: [],
      places: [],
      flags: {}
    };
    const summarizer = { summarize: vi.fn(async () => summaryPayload) };
    const recordKeeper = {
      getConversationWithMessages: vi.fn(async () => ({ messages: [{ id: "m1", role: "user", content: "hi" }] })),
      updateConversationSummary: vi.fn(async () => {})
    };
    const logger = vi.fn();
    const processor = buildConversationTaskProcessor({
      summarizer: summarizer as any,
      recordKeeper: recordKeeper as any,
      redis: new FakeRedis() as any,
      logger
    });

    const result = await processor({
      name: CONVERSATION_TASKS.summary,
      data: { conversationId }
    } as any);

    expect(summarizer.summarize).toHaveBeenCalledWith(conversationId, expect.any(Array));
    expect(recordKeeper.updateConversationSummary).toHaveBeenCalledWith(conversationId, summaryPayload);
    expect(logger).toHaveBeenCalledWith(
      "conversation.summarized",
      expect.objectContaining({ conversationId, hasSummary: true, tags: 1 })
    );
    expect(result).toEqual({ ok: true, meta: { hasSummary: true, tags: 1 } });
  }
);

test(
  "flag task detects explicit and forbidden content and logs",
  { timeout: 1500 },
  async () => {
    const { buildConversationTaskProcessor } = await loadTasksModule();
    const recordKeeper = {
      getConversationWithMessages: vi.fn(async () => ({
        messages: [
          { id: "m1", role: "user", content: "this contains porn", createdAt: "" },
          { id: "m2", role: "assistant", content: "discussing a bomb threat", createdAt: "" }
        ]
      })),
      updateConversationFlags: vi.fn(async () => {})
    };
    const logger = vi.fn();
    const processor = buildConversationTaskProcessor({
      recordKeeper: recordKeeper as any,
      redis: new FakeRedis() as any,
      logger
    });

    const result = await processor({
      name: CONVERSATION_TASKS.flag,
      data: { conversationId: "conv-flag" }
    } as any);

    expect(recordKeeper.updateConversationFlags).toHaveBeenCalledWith("conv-flag", {
      explicit: true,
      forbidden: true
    });
    expect(logger).toHaveBeenCalledWith(
      "conversation.flagged",
      expect.objectContaining({ conversationId: "conv-flag", explicit: true, forbidden: true })
    );
    expect(result).toEqual({ ok: true, meta: { explicit: true, forbidden: true } });
  }
);

test(
  "flag task returns false flags when none detected",
  { timeout: 1500 },
  async () => {
    const { buildConversationTaskProcessor } = await loadTasksModule();
    const recordKeeper = {
      getConversationWithMessages: vi.fn(async () => ({
        messages: [
          { id: "m1", role: "user", content: "just a greeting", createdAt: "" },
          { id: "m2", role: "assistant", content: { note: "weather looks nice" }, createdAt: "" }
        ]
      })),
      updateConversationFlags: vi.fn(async () => {})
    };

    const processor = buildConversationTaskProcessor({
      recordKeeper: recordKeeper as any,
      redis: new FakeRedis() as any
    });

    const result = await processor({
      name: CONVERSATION_TASKS.flag,
      data: { conversationId: "conv-clean" }
    } as any);

    expect(recordKeeper.updateConversationFlags).toHaveBeenCalledWith("conv-clean", {
      explicit: false,
      forbidden: false
    });
    expect(result).toEqual({ ok: true, meta: { explicit: false, forbidden: false } });
  }
);

test(
  "processor throws on unknown task name",
  { timeout: 1500 },
  async () => {
    const { buildConversationTaskProcessor } = await loadTasksModule();
    const processor = buildConversationTaskProcessor({
      recordKeeper: {
        getConversationWithMessages: vi.fn(async () => ({ messages: [{ id: "m", role: "user", content: "x" }] }))
      } as any,
      redis: new FakeRedis() as any
    });

    await expect(
      processor({ name: "conversation:unknown", data: { conversationId: "id" } } as any)
    ).rejects.toThrow("unknown conversation task");
  }
);

test(
  "processor uses default redis and record keeper when not provided",
  { timeout: 2000 },
  async () => {
    mockRecordKeeperGetConversation.mockResolvedValue({ messages: [{ id: "m", role: "user", content: "hi" }] });
    const { buildConversationTaskProcessor } = await loadTasksModule();

    const processor = buildConversationTaskProcessor();
    const result = await processor({
      name: CONVERSATION_TASKS.flag,
      data: { conversationId: "auto" }
    } as any);

    expect(getRedisMock).toHaveBeenCalled();
    expect(recordKeeperInstances.length).toBeGreaterThan(0);
    expect(recordKeeperInstances[0].updateConversationFlags).toHaveBeenCalledWith("auto", {
      explicit: false,
      forbidden: false
    });
    expect(result).toEqual({ ok: true, meta: { explicit: false, forbidden: false } });
  }
);

test(
  "lazy summarizer creation happens once and is reused",
  { timeout: 2000 },
  async () => {
    const { ConversationSummaryService } = await import("../lib/conversation/summary");
    const summarizerInstance = { summarize: vi.fn(async () => ({ summary: "", tags: [], keywords: [], places: [], flags: {} })) };
    const createSpy = vi.spyOn(ConversationSummaryService, "create").mockResolvedValue(summarizerInstance as any);
    const { buildConversationTaskProcessor } = await loadTasksModule();
    const recordKeeper = {
      getConversationWithMessages: vi.fn(async () => ({ messages: [{ id: "m", role: "user", content: "hello" }] })),
      updateConversationSummary: vi.fn(async () => {})
    };

    const processor = buildConversationTaskProcessor({
      recordKeeper: recordKeeper as any,
      redis: new FakeRedis() as any
    });

    await processor({ name: CONVERSATION_TASKS.summary, data: { conversationId: "conv-1" } } as any);
    await processor({ name: CONVERSATION_TASKS.summary, data: { conversationId: "conv-1" } } as any);

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(summarizerInstance.summarize).toHaveBeenCalledTimes(2);
  }
);

test(
  "summary task reports hasSummary false when summary is empty",
  { timeout: 1500 },
  async () => {
    const { buildConversationTaskProcessor } = await loadTasksModule();
    const summarizer = { summarize: vi.fn(async () => ({ summary: "", tags: [], keywords: [], places: [], flags: {} })) };
    const recordKeeper = {
      getConversationWithMessages: vi.fn(async () => ({ messages: [{ id: "m", role: "user", content: "hello" }] })),
      updateConversationSummary: vi.fn(async () => {})
    };
    const processor = buildConversationTaskProcessor({
      summarizer: summarizer as any,
      recordKeeper: recordKeeper as any,
      redis: new FakeRedis() as any
    });

    const result = await processor({
      name: CONVERSATION_TASKS.summary,
      data: { conversationId: "conv-empty-summary" }
    } as any);

    expect(recordKeeper.updateConversationSummary).toHaveBeenCalledWith("conv-empty-summary", {
      summary: "",
      tags: [],
      keywords: [],
      places: [],
      flags: {}
    });
    expect(result).toEqual({ ok: true, meta: { hasSummary: false, tags: 0 } });
  }
);

test(
  "buildConversationJobIds returns deterministic ids",
  { timeout: 1000 },
  async () => {
    const { buildConversationJobIds } = await loadTasksModule();
    const ids = buildConversationJobIds("abc");
    expect(ids).toEqual({
      index: buildConversationJobId(CONVERSATION_TASKS.index, "abc"),
      summary: buildConversationJobId(CONVERSATION_TASKS.summary, "abc"),
      flag: buildConversationJobId(CONVERSATION_TASKS.flag, "abc")
    });
  }
);

test(
  "ConversationIndexer caches clients, adds docs, and prunes stale ids",
  { timeout: 3000 },
  async () => {
    Object.assign(process.env, { CONVERSATION_INDEX_PREFIX: "test:index" });
    const { ConversationIndexer } = await loadTasksModule();
    const redis = new FakeRedis();
    await redis.sadd("test:index:ids:convA", "convA:chunk:99");
    const indexer = new ConversationIndexer(redis as any);

    const first = await indexer.indexConversation("convA", ["first chunk content", "second chunk"]);
    expect(first).toEqual({ chunks: 2, pruned: 1 });
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(getEmbeddingModelMock).toHaveBeenCalledTimes(1);
    expect(storeAddDocuments).toHaveBeenCalledTimes(1);
    expect(storeAddDocuments.mock.calls[0][1]).toEqual({ ids: ["convA:chunk:0", "convA:chunk:1"] });
    expect(storeDelete).toHaveBeenCalledWith({ ids: ["convA:chunk:99"] });
    expect(documentInstances.length).toBe(2);
    expect(vectorStoreInstances.length).toBe(1);

    const second = await indexer.indexConversation("convA", ["new chunk only"]);
    expect(second).toEqual({ chunks: 1, pruned: 1 });
    expect(storeAddDocuments).toHaveBeenCalledTimes(2);
    expect(storeDelete).toHaveBeenCalledTimes(2);
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(getEmbeddingModelMock).toHaveBeenCalledTimes(1);
    expect(documentInstances.length).toBe(3);
  }
);

test(
  "ConversationIndexer handles empty chunk list and prunes previous ids",
  { timeout: 2000 },
  async () => {
    Object.assign(process.env, { CONVERSATION_INDEX_PREFIX: "test:index" });
    const { ConversationIndexer } = await loadTasksModule();
    const redis = new FakeRedis();
    await redis.sadd("test:index:ids:convEmpty", "convEmpty:chunk:old");
    const indexer = new ConversationIndexer(redis as any);

    const result = await indexer.indexConversation("convEmpty", []);
    expect(result).toEqual({ chunks: 0, pruned: 1 });
    expect(storeAddDocuments).not.toHaveBeenCalled();
    expect(storeDelete).toHaveBeenCalledWith({ ids: ["convEmpty:chunk:old"] });
  }
);

test(
  "ConversationIndexer skips delete when nothing is stale",
  { timeout: 2000 },
  async () => {
    Object.assign(process.env, { CONVERSATION_INDEX_PREFIX: "test:index" });
    const { ConversationIndexer } = await loadTasksModule();
    const redis = new FakeRedis();
    const indexer = new ConversationIndexer(redis as any);

    const result = await indexer.indexConversation("convB", ["only chunk"]);
    expect(result).toEqual({ chunks: 1, pruned: 0 });
    expect(storeDelete).not.toHaveBeenCalled();
  }
);
