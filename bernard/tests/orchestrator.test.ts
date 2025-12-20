import assert from "node:assert/strict";
import { test, vi, describe, beforeEach, expect } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { StreamingOrchestrator } from "../agent/loop/orchestrator";
import { RecordKeeper } from "../lib/conversation/recordKeeper";
import type { LLMCaller } from "../agent/llm/llm";

// Mock RecordKeeper
const mockRecordKeeper = {
    asArchivist: vi.fn(),
    asRecorder: vi.fn(),
    getConversation: vi.fn(),
    getMessages: vi.fn().mockResolvedValue([]),
} as unknown as RecordKeeper;

const mockArchivist = {
    getMessages: vi.fn().mockResolvedValue([]),
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
    }),
    getRouterToolDefinitions: vi.fn().mockReturnValue({ toolDefinitions: [] })
}));

vi.mock("../agent/harness/respond/responseHarness", () => ({
    runResponseHarness: vi.fn().mockImplementation(async function* () {
        yield { type: "llm_call", context: [] };
        yield { type: "delta", messageId: "msg1", delta: "Hello" };
        yield { type: "delta", messageId: "msg1", delta: " world", finishReason: "stop" };
        yield { type: "llm_call_complete", result: { content: "Hello world" } };
    })
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
