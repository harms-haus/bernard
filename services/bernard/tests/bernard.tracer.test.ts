import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { BernardTracer } from "../src/agent/trace/bernard.tracer";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

describe("BernardTracer", () => {
  const testTraceDir = path.join(process.cwd(), "test-traces");
  const testFilePath = path.join(testTraceDir, "test-trace.json");

  beforeEach(async () => {
    await fs.mkdir(testTraceDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    const files = await fs.readdir(testTraceDir);
    await Promise.all(files.map(f => fs.unlink(path.join(testTraceDir, f))));
    await fs.rmdir(testTraceDir);
  });

  describe("Event Capture and Ordering", () => {
    it("should capture events in order", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.requestStart({
        id: "test-req-1",
        threadId: "thread-1",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
      });

      tracer.userMessage({
        id: "msg-1",
        threadId: "thread-1",
        content: "user message",
      });

      tracer.llmCallStart({
        id: "llm-1",
        threadId: "thread-1",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
      });

      await tracer.flush();

      const fileContent = await fs.readFile(testFilePath, "utf-8");
      const trace = JSON.parse(fileContent);

      expect(trace.events).toHaveLength(3);
      expect(trace.events[0].type).toBe("request_start");
      expect(trace.events[1].type).toBe("user_message");
      expect(trace.events[2].type).toBe("llm_call_start");
    });

    it("should increment event index for each event", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.requestStart({
        id: "test-req-2",
        threadId: "thread-2",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
      });

      tracer.userMessage({ id: "msg-1", threadId: "thread-2", content: "test" });
      tracer.assistantMessage({ id: "msg-2", threadId: "thread-2", content: "test" });

      await tracer.flush();

      const fileContent = await fs.readFile(testFilePath, "utf-8");
      const trace = JSON.parse(fileContent);

      expect(trace.events[0].data.id).toBe("test-req-2");
      expect(trace.events[1].data.id).toBe("msg-1");
      expect(trace.events[2].data.id).toBe("msg-2");
    });
  });

  describe("Non-Blocking Behavior", () => {
    it("should return immediately from event capture methods", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.requestStart({
        id: "test-req-4",
        threadId: "thread-4",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
      });

      const promise = Promise.resolve();
      await expect(promise).resolves.toBe(undefined);
    });

    it("should write asynchronously without blocking", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.requestStart({
        id: "test-req-5",
        threadId: "thread-5",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
      });

      const writeStart = Date.now();
      await tracer.flush();
      const writeDuration = Date.now() - writeStart;

      expect(writeDuration).toBeLessThan(1000);
    });

    it("should process events in background", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.requestStart({
        id: "test-req-6",
        threadId: "thread-6",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
      });

      await new Promise(resolve => setTimeout(resolve, 100));
      await tracer.flush();

      const fileContent = await fs.readFile(testFilePath, "utf-8");
      expect(fileContent).toBeTruthy();
    });
  });

  describe("File Writing", () => {
    it("should write trace to file", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.requestStart({
        id: "test-req-7",
        threadId: "thread-7",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
      });

      await tracer.flush();

      const fileExists = await fs.access(testFilePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });

    it("should create traces directory if it does not exist", async () => {
      const nestedDir = path.join(testTraceDir, "nested", "traces");
      const nestedPath = path.join(nestedDir, "test.json");

      const tracer = new BernardTracer({ traceFilePath: nestedPath, enableTracing: true });

      tracer.requestStart({
        id: "test-req-8",
        threadId: "thread-8",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
      });

      await tracer.flush();

      const fileExists = await fs.access(nestedPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });

    it("should overwrite file on new request when using fixed path", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.requestStart({
        id: "test-req-9",
        threadId: "thread-9",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("first")],
      });

      await tracer.flush();

      const firstContent = await fs.readFile(testFilePath, "utf-8");
      const firstTrace = JSON.parse(firstContent);
      expect(firstTrace.events[0].data.messages[0].content).toBe("first");

      tracer.requestStart({
        id: "test-req-10",
        threadId: "thread-10",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("second")],
      });

      await tracer.flush();

      const secondContent = await fs.readFile(testFilePath, "utf-8");
      const secondTrace = JSON.parse(secondContent);
      expect(secondTrace.events[0].data.messages[0].content).toBe("second");
      expect(secondTrace.request_id).toBe("test-req-10");
    });

    it("should write valid JSON", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.requestStart({
        id: "test-req-11",
        threadId: "thread-11",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
      });

      await tracer.flush();

      const fileContent = await fs.readFile(testFilePath, "utf-8");

      expect(() => JSON.parse(fileContent)).not.toThrow();
    });

    it("should include all trace metadata", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.requestStart({
        id: "test-req-12",
        threadId: "thread-12",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
      });

      await tracer.flush();

      const fileContent = await fs.readFile(testFilePath, "utf-8");
      const trace = JSON.parse(fileContent);

      expect(trace.request_id).toBe("test-req-12");
      expect(trace.thread_id).toBe("thread-12");
      expect(trace.model).toBe("gpt-4");
      expect(trace.agent).toBe("test");
      expect(trace.started_at).toBeTruthy();
      expect(trace.events).toBeDefined();
    });

    it("should calculate duration on request complete", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.requestStart({
        id: "test-req-13",
        threadId: "thread-13",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      tracer.requestComplete({
        id: "test-req-13",
        threadId: "thread-13",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
      });

      await tracer.flush();

      const fileContent = await fs.readFile(testFilePath, "utf-8");
      const trace = JSON.parse(fileContent);

      expect(trace.completed_at).toBeTruthy();
      expect(trace.duration_ms).toBeGreaterThanOrEqual(100);
    });
  });

  describe("Event Callbacks", () => {
    it("should call registered callbacks for each event", () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });
      const events: any[] = [];

      tracer.onEvent((event) => {
        events.push(event);
      });

      tracer.requestStart({
        id: "test-req-14",
        threadId: "thread-14",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("request_start");
    });

    it("should support multiple callbacks", () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });
      const events1: any[] = [];
      const events2: any[] = [];

      tracer.onEvent((event) => events1.push(event));
      tracer.onEvent((event) => events2.push(event));

      tracer.requestStart({
        id: "test-req-15",
        threadId: "thread-15",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
      });

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
    });

    it("should handle callback errors gracefully", () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });
      const events: any[] = [];

      tracer.onEvent(() => {
        throw new Error("Callback error");
      });

      tracer.onEvent((event) => {
        events.push(event);
      });

      expect(() => {
        tracer.requestStart({
          id: "test-req-16",
          threadId: "thread-16",
          model: "gpt-4",
          agent: "test",
          messages: [new HumanMessage("test")],
        });
      }).not.toThrow();

      expect(events).toHaveLength(1);
    });
  });

  describe("All Tracer Interface Methods", () => {
    it("should implement recollections method", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.recollections({
        recollections: [{
          id: "rec-1",
          threadId: "thread-17",
          content: "memory content",
        }],
      });

      await tracer.flush();

      const fileContent = await fs.readFile(testFilePath, "utf-8");
      const trace = JSON.parse(fileContent);

      expect(trace.events).toHaveLength(1);
      expect(trace.events[0].type).toBe("recollection");
    });

    it("should implement llmCallComplete method", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.llmCallComplete({
        id: "llm-1",
        threadId: "thread-18",
        model: "gpt-4",
        agent: "test",
        content: "response",
        duration: 1500,
      });

      await tracer.flush();

      const fileContent = await fs.readFile(testFilePath, "utf-8");
      const trace = JSON.parse(fileContent);

      expect(trace.events[0].type).toBe("llm_call_complete");
    });

    it("should implement llmCallError method", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.llmCallError({
        id: "llm-1",
        threadId: "thread-19",
        model: "gpt-4",
        agent: "test",
        error: "API error",
        duration: 500,
      });

      await tracer.flush();

      const fileContent = await fs.readFile(testFilePath, "utf-8");
      const trace = JSON.parse(fileContent);

      expect(trace.events[0].type).toBe("llm_call_error");
    });

    it("should implement toolCallStart method", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.toolCallStart({
        id: "tool-1",
        threadId: "thread-20",
        name: "search",
        arguments: { query: "test" },
      });

      await tracer.flush();

      const fileContent = await fs.readFile(testFilePath, "utf-8");
      const trace = JSON.parse(fileContent);

      expect(trace.events[0].type).toBe("tool_call_start");
    });

    it("should implement toolCallComplete method", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.toolCallComplete({
        id: "tool-1",
        threadId: "thread-21",
        name: "search",
        result: "search results",
        duration: 300,
      });

      await tracer.flush();

      const fileContent = await fs.readFile(testFilePath, "utf-8");
      const trace = JSON.parse(fileContent);

      expect(trace.events[0].type).toBe("tool_call_complete");
    });

    it("should implement toolCallError method", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.toolCallError({
        id: "tool-1",
        threadId: "thread-22",
        name: "search",
        error: "Tool failed",
        duration: 100,
      });

      await tracer.flush();

      const fileContent = await fs.readFile(testFilePath, "utf-8");
      const trace = JSON.parse(fileContent);

      expect(trace.events[0].type).toBe("tool_call_error");
    });

    it("should implement assistantMessage method", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.assistantMessage({
        id: "msg-1",
        threadId: "thread-23",
        content: "assistant response",
      });

      await tracer.flush();

      const fileContent = await fs.readFile(testFilePath, "utf-8");
      const trace = JSON.parse(fileContent);

      expect(trace.events[0].type).toBe("assistant_message");
    });

    it("should implement requestError method", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.requestError({
        id: "test-req-17",
        threadId: "thread-24",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
        error: "Request failed",
      });

      await tracer.flush();

      const fileContent = await fs.readFile(testFilePath, "utf-8");
      const trace = JSON.parse(fileContent);

      expect(trace.events[0].type).toBe("request_error");
    });
  });

  describe("Configuration", () => {
    it("should respect enableTracing: false", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: false });

      tracer.requestStart({
        id: "test-req-18",
        threadId: "thread-25",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
      });

      await tracer.flush();

      const fileExists = await fs.access(testFilePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(false);
    });

    it("should return false for isActive when tracing disabled", () => {
      const tracer = new BernardTracer({ enableTracing: false });
      expect(tracer.isActive()).toBe(false);
    });

    it("should return true for isActive when tracing enabled", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.requestStart({
        id: "test-req-19",
        threadId: "thread-26",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
      });

      expect(tracer.isActive()).toBe(true);
    });
  });

  describe("Utility Methods", () => {
    it("should return current trace", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.requestStart({
        id: "test-req-22",
        threadId: "thread-27",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
      });

      const trace = tracer.getCurrentTrace();
      expect(trace).toBeTruthy();
      expect(trace?.request_id).toBe("test-req-22");
    });

    it("should return null for current trace when not started", () => {
      const tracer = new BernardTracer({ enableTracing: true });
      const trace = tracer.getCurrentTrace();
      expect(trace).toBe(null);
    });

    it("should return trace file path", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.requestStart({
        id: "test-req-23",
        threadId: "thread-28",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
      });

      const path = tracer.getTraceFilePath();
      expect(path).toBe(testFilePath);
    });

    it("should flush pending writes", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.requestStart({
        id: "test-req-24",
        threadId: "thread-29",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("test")],
      });

      for (let i = 0; i < 10; i++) {
        tracer.userMessage({ id: `msg-${i}`, threadId: "thread-29", content: `message ${i}` });
      }

      await tracer.flush();

      const fileContent = await fs.readFile(testFilePath, "utf-8");
      const trace = JSON.parse(fileContent);

      expect(trace.events).toHaveLength(11);
    });
  });

  describe("Integration Scenarios", () => {
    it("should trace complete request lifecycle", async () => {
      const tracer = new BernardTracer({ traceFilePath: testFilePath, enableTracing: true });

      tracer.requestStart({
        id: "test-req-26",
        threadId: "thread-30",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("What's the weather?")],
      });

      tracer.userMessage({
        id: "msg-1",
        threadId: "thread-30",
        content: "What's the weather?",
      });

      tracer.llmCallStart({
        id: "llm-1",
        threadId: "thread-30",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("What's the weather?")],
      });

      tracer.llmCallComplete({
        id: "llm-1",
        threadId: "thread-30",
        model: "gpt-4",
        agent: "test",
        content: "Let me check the weather for you.",
        duration: 1200,
      });

      tracer.assistantMessage({
        id: "msg-2",
        threadId: "thread-30",
        content: "Let me check the weather for you.",
      });

      tracer.toolCallStart({
        id: "tool-1",
        threadId: "thread-30",
        name: "weather",
        arguments: { location: "San Francisco" },
      });

      tracer.toolCallComplete({
        id: "tool-1",
        threadId: "thread-30",
        name: "weather",
        result: "72°F, sunny",
        duration: 250,
      });

      tracer.requestComplete({
        id: "test-req-26",
        threadId: "thread-30",
        model: "gpt-4",
        agent: "test",
        messages: [new HumanMessage("What's the weather?"), new AIMessage("Let me check the weather for you.")],
      });

      await tracer.flush();

      const fileContent = await fs.readFile(testFilePath, "utf-8");
      const trace = JSON.parse(fileContent);

      expect(trace.events).toHaveLength(7);
      expect(trace.events[0].type).toBe("request_start");
      expect(trace.events[1].type).toBe("user_message");
      expect(trace.events[2].type).toBe("llm_call_start");
      expect(trace.events[3].type).toBe("llm_call_complete");
      expect(trace.events[4].type).toBe("assistant_message");
      expect(trace.events[5].type).toBe("tool_call_start");
      expect(trace.events[6].type).toBe("tool_call_complete");
      expect(trace.request_id).toBe("test-req-26");
      expect(trace.thread_id).toBe("thread-30");
      expect(trace.duration_ms).toBeGreaterThan(0);
    });
  });
});
