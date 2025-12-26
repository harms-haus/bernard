import assert from "node:assert/strict";
import { test, vi, describe, beforeEach, expect } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { StreamingOrchestrator } from "../agent/loop/orchestrator";
import type { RecordKeeper } from "../agent/recordKeeper/conversation.keeper";
import type { LLMCaller } from "../agent/llm/llm";

// Mock RecordKeeper
const mockRecordKeeper = {
    asArchivist: vi.fn(),
    asRecorder: vi.fn(),
    getConversation: vi.fn(),
    getMessages: vi.fn().mockResolvedValue([]),
    registerContext: vi.fn(),
    unregisterContext: vi.fn(),
    getRedisClient: vi.fn(),
} as unknown as RecordKeeper;

const mockArchivist = {
    getMessages: vi.fn().mockResolvedValue([]),
    getConversation: vi.fn().mockResolvedValue(null),
};

const mockRecorder = {
    recordMessage: vi.fn(),
    recordLLMCallStart: vi.fn(),
    recordLLMCallComplete: vi.fn(),
    recordToolCallStart: vi.fn(),
    recordToolCallComplete: vi.fn(),
    syncHistory: vi.fn(),
};

// Mock Harnesses
vi.mock("../agent/harness/router/routerHarness", () => ({
    runRouterHarness: vi.fn().mockImplementation(async function* () {
        yield { type: "llm_call", context: [] };
        yield { type: "llm_call_complete", result: { content: "router Done" } };
        // Simulate calling response harness
        yield { type: "llm_call", context: [] };
        yield { type: "delta", messageId: "msg1", delta: "Hello" };
        yield { type: "delta", messageId: "msg1", delta: " world", finishReason: "stop" };
        yield { type: "llm_call_complete", result: { content: "Hello world" } };
    }),
    getRouterToolDefinitions: vi.fn().mockReturnValue({ langChainTools: [], toolDefinitions: [] })
}));

vi.mock("../agent/harness/respond/responseHarness", () => ({
    runResponseHarness: vi.fn().mockImplementation(async function* () {
        yield { type: "llm_call", context: [] };
        yield { type: "delta", messageId: "msg1", delta: "Hello" };
        yield { type: "delta", messageId: "msg1", delta: " world", finishReason: "stop" };
        yield { type: "llm_call_complete", result: { content: "Hello world" } };
    })
}));

vi.mock("../agent/harness/recollect", () => ({
    runRecollectionHarness: vi.fn().mockImplementation(async () => {
        // Mock recollection harness that yields no events (no recollections found)
        return;
    })
}));

vi.mock("../../lib/conversation/search", () => ({
    ConversationSearchService: vi.fn().mockImplementation(() => ({
        searchSimilar: vi.fn().mockResolvedValue({ results: [], total: 0, offset: 0, limit: 5 })
    }))
}));

describe("StreamingOrchestrator", () => {
    let routerLLMCaller: LLMCaller;
    let responseLLMCaller: LLMCaller;

    beforeEach(() => {
        vi.clearAllMocks();
        routerLLMCaller = { complete: vi.fn(), streamText: vi.fn() };
        responseLLMCaller = { complete: vi.fn(), streamText: vi.fn() };

        (mockRecordKeeper.asArchivist as any).mockReturnValue(mockArchivist);
        (mockRecordKeeper.asRecorder as any).mockReturnValue(mockRecorder);
        (mockRecordKeeper.getConversation as any).mockResolvedValue({ id: "test-conv" });
        (mockRecordKeeper.getRedisClient as any).mockReturnValue({});
    });

    test("runs through harnesses and yields events", async () => {
        const orchestrator = new StreamingOrchestrator(
            mockRecordKeeper,
            routerLLMCaller,
            responseLLMCaller
        );

        const input = {
            conversationId: "test-conv",
            incoming: [new HumanMessage("Hi")],
            persistable: [new HumanMessage("Hi")],
            trace: true
        };

        const result = await orchestrator.run(input);
        const events: any[] = [];
        for await (const event of result.stream) {
            events.push(event);
        }

        assert(events.some(e => e.type === "llm_call"));
        assert(events.some(e => e.delta === "Hello"));

        const { finalMessages, conversationId } = await result.result;
        assert.equal(conversationId, "test-conv");
        assert.equal(finalMessages.length, 1);
        assert.equal(finalMessages[0].content, "Hello world");

        expect(mockRecorder.recordMessage).toHaveBeenCalled();
    });

    test("filters trace events when trace is false", async () => {
        const orchestrator = new StreamingOrchestrator(
            mockRecordKeeper,
            routerLLMCaller,
            responseLLMCaller
        );

        const input = {
            conversationId: "test-conv",
            incoming: [new HumanMessage("Hi")],
            persistable: [new HumanMessage("Hi")],
            trace: false
        };

        const result = await orchestrator.run(input);
        const events: any[] = [];
        for await (const event of result.stream) {
            events.push(event);
        }

        assert(!events.some(e => e.type === "llm_call"));
        assert(events.some(e => e.type === "delta"));
    });

});
