import assert from "node:assert/strict";
import { test, vi, describe, beforeEach } from "vitest";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { runResponseHarness } from "../agent/harness/respond/responseHarness";
import type { LLMCaller } from "../agent/llm/llm";
import type { Archivist } from "../lib/conversation/types";
import { ResponseContext } from "../lib/conversation/context";

// Mock Archivist
const mockArchivist: Archivist = {
    getMessages: vi.fn().mockResolvedValue([]),
    getFullConversation: vi.fn(),
    getConversation: vi.fn(),
};

// Mock LLM Caller
const mockLLMCaller: LLMCaller = {
    complete: vi.fn(),
    streamText: vi.fn(),
};

describe("runResponseHarness (Refactored)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("yields llm_call, then deltas, then llm_call_complete", async () => {
        mockLLMCaller.streamText.mockImplementation(async function* () {
            yield "Hello";
            yield " world";
        });

        const responseContext = new ResponseContext();

        const context = {
            conversationId: "test-conv",
            responseContext,
            messages: [new HumanMessage("Hi")],
            llmCaller: mockLLMCaller,
            toolDefinitions: [],
            usedTools: [],
        };

        const events: any[] = [];
        for await (const event of runResponseHarness(context)) {
            events.push(event);
        }

        // Events:
        // 1. llm_call
        // 2. delta ("Hello")
        // 3. delta (" world")
        // 4. delta ("" with finishReason)
        // 5. llm_call_complete

        assert.equal(events.length, 5);
        assert.equal(events[0].type, "llm_call");
        assert.equal(events[1].type, "delta");
        assert.equal(events[1].delta, "Hello");
        assert.equal(events[2].delta, " world");
        assert.equal(events[3].delta, "");
        assert.equal(events[3].finishReason, "stop");
        assert.equal(events[4].type, "llm_call_complete");
        assert.equal(events[4].result.content, "Hello world");
    });

    test("yields error event on LLM failure", async () => {
        mockLLMCaller.streamText.mockImplementation(async function* () {
            throw new Error("Stream Failed");
        });

        const responseContext = new ResponseContext();

        const context = {
            conversationId: "test-conv",
            responseContext,
            messages: [new HumanMessage("Hi")],
            llmCaller: mockLLMCaller,
            toolDefinitions: [],
            usedTools: [],
        };

        const events: any[] = [];
        for await (const event of runResponseHarness(context)) {
            events.push(event);
        }

        assert(events.some(e => e.type === "error"));
        assert.equal(events.find(e => e.type === "error").error, "Stream Failed");
    });
});

