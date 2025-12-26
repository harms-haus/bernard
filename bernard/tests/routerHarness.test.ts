import assert from "node:assert/strict";
import { test, vi, describe, beforeEach } from "vitest";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import {
    runRouterHarness,
    getRouterToolDefinitions,
    prepareInitialContext,
    executeTool
} from "../agent/harness/router/routerHarness";
import { ChatOpenAILLMCaller } from "../agent/llm/chatOpenAI";
import type { Archivist } from "../lib/conversation/types";
import { RouterContext, ResponseContext } from "../lib/conversation/context";

// Mock Archivist
const mockArchivist: Archivist = {
    getMessages: vi.fn().mockResolvedValue([]),
    getFullConversation: vi.fn(),
    getConversation: vi.fn(),
};

// Mock LLM Caller
vi.mock("../agent/llm/chatOpenAI", async () => {
    const actual = await vi.importActual("../agent/llm/chatOpenAI") as any;
    return {
        ...actual,
        ChatOpenAILLMCaller: class extends actual.ChatOpenAILLMCaller {
            constructor() {
                super("fake-key");
            }
            completeWithTools = vi.fn();
        }
    };
});

describe("router Harness Helpers", () => {
    test("getrouterToolDefinitions returns tools and definitions", () => {
        const { langChainTools, toolDefinitions } = getRouterToolDefinitions();
        assert(Array.isArray(langChainTools));
        assert(Array.isArray(toolDefinitions));
        assert(toolDefinitions.length > 0);
        assert(toolDefinitions.some(d => d.name === "respond"));
    });

    test("prepareInitialContext builds correct message list", async () => {
        const historicalMessage = {
            id: "msg_1",
            role: "user",
            content: "History",
            createdAt: new Date().toISOString()
        };
        (mockArchivist.getMessages as any).mockResolvedValue([historicalMessage]);

        const messages = [new HumanMessage("Current")];
        const context = await prepareInitialContext("conv-1", messages, mockArchivist, []);

        assert.equal(context.length, 3); // System + History + Current
        assert(context[0] instanceof SystemMessage);
        assert.equal(context[1].content, "History");
        assert.equal(context[2].content, "Current");
    });

    test("executeTool handles missing tool", async () => {
        const result = await executeTool(null, {
            id: "call-1",
            function: { name: "nonexistent", arguments: "{}" }
        }, []);
        assert.equal(result.output, "Error: Tool 'nonexistent' not found");
    });

    test("executeTool handles invalid JSON arguments", async () => {
        const mockTool = { name: "test", invoke: vi.fn() };
        const result = await executeTool(mockTool, {
            id: "call-1",
            function: { name: "test", arguments: "{invalid}" }
        }, []);
        assert(result.output.includes("Error: Invalid tool arguments"));
    });

    test("executeTool invokes tool and returns result", async () => {
        const mockTool = {
            name: "test",
            invoke: vi.fn().mockResolvedValue("Success!")
        };
        const result = await executeTool(mockTool, {
            id: "call-1",
            function: { name: "test", arguments: '{"key": "val"}' }
        }, []);
        assert.equal(result.output, "Success!");
        assert.equal(mockTool.invoke.mock.calls[0][0].key, "val");
    });
});

describe("runrouterHarness (Refactored)", () => {
    let llmCaller: any;

    beforeEach(() => {
        vi.clearAllMocks();
        llmCaller = new ChatOpenAILLMCaller("dummy-key");
    });

    test("yields llm_call then llm_call_complete", async () => {
        const aiMessage = new AIMessage({ content: "Hello there" });
        llmCaller.completeWithTools.mockResolvedValue(aiMessage);

        const routerContext = new RouterContext();
        const responseContext = new ResponseContext();

        const context = {
            conversationId: "test-conv",
            routerContext,
            responseContext,
            messages: [new HumanMessage("Hello")],
            llmCaller,
            responseLLMCaller: llmCaller,
        };

        const events: any[] = [];
        for await (const event of runRouterHarness(context)) {
            events.push(event);
        }

        assert.equal(events.length, 2);
        assert.equal(events[0].type, "llm_call");
        assert.equal(events[1].type, "llm_call_complete");
        assert.equal(events[1].result.content, "Hello there");
    });

    test("yields tool_call and tool_call_complete for tool use", async () => {
        const aiMessage = new AIMessage({
            content: "",
            tool_calls: [{
                id: "call_1",
                name: "respond",
                args: { message: "I am responding" }
            }]
        });

        llmCaller.completeWithTools.mockResolvedValue(aiMessage);

        const routerContext = new RouterContext();
        const responseContext = new ResponseContext();

        const context = {
            conversationId: "test-conv",
            routerContext,
            responseContext,
            messages: [new HumanMessage("Respond please")],
            llmCaller,
            responseLLMCaller: llmCaller,
        };

        const events: any[] = [];
        for await (const event of runRouterHarness(context)) {
            events.push(event);
        }

        assert(events.some(e => e.type === "tool_call"));
        assert(events.some(e => e.type === "tool_call_complete"));

        const toolCall = events.find(e => e.type === "tool_call");
        assert.equal(toolCall.toolCall.function.name, "respond");
    });

    test("yields error event on LLM failure and calls response harness", async () => {
        llmCaller.completeWithTools.mockRejectedValue(new Error("LLM Down"));

        const routerContext = new RouterContext();
        const responseContext = new ResponseContext();

        const context = {
            conversationId: "test-conv",
            routerContext,
            responseContext,
            messages: [new HumanMessage("Hello")],
            llmCaller,
            responseLLMCaller: llmCaller, // Use same mock for response
        };

        const events: any[] = [];
        for await (const event of runRouterHarness(context)) {
            events.push(event);
        }

        // Should yield router error
        assert(events.some(e => e.type === "error"));
        assert.equal(events.find(e => e.type === "error").error, "LLM Down");

        // Should call response harness after error
        assert(events.some(e => e.type === "llm_call" && e.model === "response"));
    });

    test("includes history from archivist in context", async () => {
        const historicalMessage = {
            id: "msg_1",
            role: "user",
            content: "Previous message",
            createdAt: new Date().toISOString()
        };
        (mockArchivist.getMessages as any).mockResolvedValue([historicalMessage]);

        llmCaller.completeWithTools.mockResolvedValue(new AIMessage("Response"));

        const routerContext = new RouterContext();
        const responseContext = new ResponseContext();

        // Initialize router context with historical messages
        routerContext.initializeWithHistory([historicalMessage]);

        const context = {
            conversationId: "test-conv",
            routerContext,
            responseContext,
            messages: [new HumanMessage("Current message")],
            llmCaller,
            responseLLMCaller: llmCaller,
        };

        const events: any[] = [];
        for await (const event of runRouterHarness(context)) {
            events.push(event);
        }

        // The first event should be llm_call
        const llmCall = events[0];
        assert.equal(llmCall.type, "llm_call");
        const sentMessages = llmCall.context;

        // Should have: System Prompt + Historical Message + Current Message
        assert.equal(sentMessages.length, 3);
        assert.equal(sentMessages[1].content, "Previous message");
        assert.equal(sentMessages[2].content, "Current message");
    });
});
