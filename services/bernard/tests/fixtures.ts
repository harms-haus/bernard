import type { AgentContext } from "../src/agent/agentContext";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { Tracer, onEventData } from "../src/agent/trace";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// Simple checkpoint type matching LangGraph structure
type SimpleCheckpoint = {
  v: number;
  id: string;
  ts: string;
  channel_values: Record<string, unknown>;
  channel_versions: Record<string, string>;
  versions_seen: Record<string, Record<string, string>>;
  pending_writes: Array<[string, unknown]>;
  snapshots: {
    output: unknown;
    tasks: unknown;
  };
};

type CheckpointMetadata = {
  source: "input" | "loop" | "update" | "fork";
  step: number;
  parents: Record<string, string>;
};

type ChannelVersions = Record<string, string>;

/**
 * Mock checkpointer for testing without Redis
 */
class MockCheckpointSaver {
  private checkpoints: Map<string, SimpleCheckpoint> = new Map();
  private metadata: Map<string, CheckpointMetadata> = new Map();

  async get(config: RunnableConfig): Promise<SimpleCheckpoint | undefined> {
    const threadId = config.configurable?.["thread_id"];
    if (!threadId) return undefined;
    return this.checkpoints.get(threadId);
  }

  async getTuple(config: RunnableConfig): Promise<{ config: RunnableConfig; checkpoint: SimpleCheckpoint; metadata?: CheckpointMetadata } | undefined> {
    const threadId = config.configurable?.["thread_id"];
    if (!threadId) return undefined;
    
    const checkpoint = this.checkpoints.get(threadId);
    if (!checkpoint) return undefined;
    
    return {
      config,
      checkpoint,
      metadata: this.metadata.get(threadId),
    };
  }

  async list(config: RunnableConfig): Promise<Array<{ config: RunnableConfig; checkpoint: SimpleCheckpoint; metadata?: CheckpointMetadata }>> {
    const threadId = config.configurable?.["thread_id"];
    if (!threadId) return [];
    
    const checkpoint = this.checkpoints.get(threadId);
    if (!checkpoint) return [];
    
    const meta = this.metadata.get(threadId);
    return [{
      config,
      checkpoint,
      ...(meta ? { metadata: meta } : {}),
    }];
  }

  async put(
    config: RunnableConfig,
    checkpoint: SimpleCheckpoint,
    metadata: CheckpointMetadata,
    _newVersions: ChannelVersions
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.["thread_id"];
    if (threadId) {
      this.checkpoints.set(threadId, checkpoint);
      this.metadata.set(threadId, metadata);
    }
    return config;
  }

  async deleteThread(config: RunnableConfig): Promise<void> {
    const threadId = config.configurable?.["thread_id"];
    if (threadId) {
      this.checkpoints.delete(threadId);
      this.metadata.delete(threadId);
    }
  }
}

// Export singleton instance for use as checkpointer
export const mockCheckpointer = new MockCheckpointSaver() as unknown as {
  get: (config: RunnableConfig) => Promise<SimpleCheckpoint | undefined>;
  getTuple: (config: RunnableConfig) => Promise<{ config: RunnableConfig; checkpoint: SimpleCheckpoint; metadata?: CheckpointMetadata } | undefined>;
  list: (config: RunnableConfig) => Promise<Array<{ config: RunnableConfig; checkpoint: SimpleCheckpoint; metadata?: CheckpointMetadata }>>;
  put: (config: RunnableConfig, checkpoint: SimpleCheckpoint, metadata: CheckpointMetadata, versions: ChannelVersions) => Promise<RunnableConfig>;
  deleteThread: (config: RunnableConfig) => Promise<void>;
};

/**
 * Mock Tracer for testing
 */
export class MockTracer implements Tracer {
  private events: Array<{ type: string; data: Record<string, unknown> }> = [];
  private callbacks: Array<(event: onEventData) => void> = [];

  onEvent(callback: (event: onEventData) => void): void {
    this.callbacks.push(callback);
  }

  private emitToCallbacks(event: onEventData): void {
    for (const callback of this.callbacks) {
      try {
        callback(event);
      } catch {
        // Ignore callback errors
      }
    }
  }

  requestStart(data: { id: string; threadId: string; model: string; agent: string; messages: BaseMessage[] }): void {
    const event = { type: "request_start" as const, ...data };
    this.events.push({ type: "request_start", data: data as unknown as Record<string, unknown> });
    this.emitToCallbacks(event);
  }

  requestComplete(data: { id: string; threadId: string; model: string; agent: string; messages: BaseMessage[] }): void {
    const event = { type: "request_stop" as const, ...data };
    this.events.push({ type: "request_complete", data: data as unknown as Record<string, unknown> });
    this.emitToCallbacks(event);
  }

  requestError(data: { id: string; threadId: string; model: string; agent: string; messages: BaseMessage[]; error: string }): void {
    const event = { type: "request_error" as const, ...data };
    this.events.push({ type: "request_error", data: data as unknown as Record<string, unknown> });
    this.emitToCallbacks(event);
  }

  userMessage(data: { id: string; threadId: string; content: string }): void {
    const event = { type: "user_message" as const, ...data };
    this.events.push({ type: "user_message", data: data as unknown as Record<string, unknown> });
    this.emitToCallbacks(event);
  }

  assistantMessage(data: { id: string; threadId: string; content: string }): void {
    const event = { type: "assistant_message" as const, ...data };
    this.events.push({ type: "assistant_message", data: data as unknown as Record<string, unknown> });
    this.emitToCallbacks(event);
  }

  llmCallStart(data: { id: string; threadId: string; model: string; agent: string; messages: BaseMessage[] }): void {
    const event = { type: "llm_call_start" as const, ...data };
    this.events.push({ type: "llm_call_start", data: data as unknown as Record<string, unknown> });
    this.emitToCallbacks(event);
  }

  llmCallComplete(data: { id: string; threadId: string; model: string; agent: string; content: string; duration: number }): void {
    const event = { type: "llm_call_complete" as const, ...data };
    this.events.push({ type: "llm_call_complete", data: data as unknown as Record<string, unknown> });
    this.emitToCallbacks(event);
  }

  llmCallError(data: { id: string; threadId: string; model: string; agent: string; error: string; duration: number }): void {
    const event = { type: "llm_call_error" as const, ...data };
    this.events.push({ type: "llm_call_error", data: data as unknown as Record<string, unknown> });
    this.emitToCallbacks(event);
  }

  toolCallStart(data: { id: string; threadId: string; name: string; arguments: Record<string, unknown> }): void {
    const event = { type: "tool_call_start" as const, ...data };
    this.events.push({ type: "tool_call_start", data: data as unknown as Record<string, unknown> });
    this.emitToCallbacks(event);
  }

  toolCallComplete(data: { id: string; threadId: string; name: string; result: string; duration: number }): void {
    const event = { type: "tool_call_complete" as const, ...data };
    this.events.push({ type: "tool_call_complete", data: data as unknown as Record<string, unknown> });
    this.emitToCallbacks(event);
  }

  toolCallError(data: { id: string; threadId: string; name: string; error: string; duration: number }): void {
    const event = { type: "tool_call_error" as const, ...data };
    this.events.push({ type: "tool_call_error", data: data as unknown as Record<string, unknown> });
    this.emitToCallbacks(event);
  }

  recollections(data: { recollections: Array<{ id: string; threadId?: string; content: string }> }): void {
    const event = { type: "recollection" as const, ...data };
    this.events.push({ type: "recollection", data: data as unknown as Record<string, unknown> });
    this.emitToCallbacks(event);
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  getEvents(): Array<{ type: string; data: Record<string, unknown> }> {
    return this.events;
  }

  clearEvents(): void {
    this.events = [];
  }
}

/**
 * Simple echo tool for testing - returns the input as a result
 */
export const echoTool = tool(
  async (input: { message: string }) => {
    return `Echo: ${input.message}`;
  },
  {
    name: "echo",
    description: "Echoes the input message back to the caller",
    schema: z.object({
      message: z.string().describe("The message to echo back"),
    }),
  }
);

/**
 * Test tool that returns a structured result
 */
export const getValueTool = tool(
  async (input: { key: string }) => {
    return JSON.stringify({ key: input.key, value: "test-value", timestamp: Date.now() });
  },
  {
    name: "get_value",
    description: "Returns a structured value for testing",
    schema: z.object({
      key: z.string().describe("The key to retrieve"),
    }),
  }
);

/**
 * Test tool that simulates a slow operation with progress reporting
 */
export const slowToolWithProgress = tool(
  async (input: { steps: number; delayMs: number }, config) => {
    const { createProgressReporter } = await import("../src/agent/tool/progress.js");
    const progress = createProgressReporter(config, "slow_tool");

    progress.start(`Starting slow operation with ${input.steps} steps`);

    for (let i = 1; i <= input.steps; i++) {
      await new Promise(resolve => setTimeout(resolve, input.delayMs));
      progress.progress(i, input.steps, `Step ${i}/${input.steps}`);
    }

    progress.complete("Slow operation completed");
    return "Done";
  },
  {
    name: "slow_tool",
    description: "A slow tool that reports progress",
    schema: z.object({
      steps: z.number().default(3).describe("Number of steps"),
      delayMs: z.number().default(10).describe("Delay in milliseconds per step"),
    }),
  }
);

/**
 * Create a test context with mock dependencies
 */
export function createTestContext(
  tools: StructuredToolInterface[] = [],
  disabledTools: Array<{ name: string; reason: string }> = []
): AgentContext {
  const mockTracer = new MockTracer();

  return {
    checkpointer: mockCheckpointer as unknown as import("@langchain/langgraph").BaseCheckpointSaver,
    tracer: mockTracer,
    logger: {
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {},
    } as unknown as import("pino").Logger,
    tools: tools as StructuredToolInterface[],
    disabledTools,
  };
}

/**
 * Default test messages for simple tests
 */
export const testMessages = [new HumanMessage("Hello, I need some information")];

/**
 * Test messages that trigger tool calls
 */
export const toolCallMessages = [new HumanMessage("What is the value of test_key?")];
