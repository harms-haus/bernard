# Tool Call Streaming Implementation Plan

> **Status**: Draft  
> **Version**: 2.0.0  
> **Last Updated**: 2026-01-03  
> **Author**: Bernard Development Team

## Executive Summary

This document provides a detailed, phase-by-phase plan to implement real-time streaming of tool calls in the Bernard agent system (`services/bernard/`). The implementation leverages LangGraph's built-in streaming capabilities rather than building custom infrastructure.

**Current State**: Tool calls are embedded in `AIMessage.tool_calls` and only visible when messages complete. Clients cannot see tool invocations in real-time.

**Target State**: Tool calls and optional progress events are streamed to clients as they happen, using LangGraph's `messages` and `custom` stream modes.

**Approach**: Refactor `bernard.graph.ts` to use the explicit `ToolNode` pattern from the bernard-chat template, then configure streaming in the HTTP server to emit tool events.

---

## Table of Contents

1. [Current Architecture Analysis](#1-current-architecture-analysis)
2. [Target Architecture](#2-target-architecture)
3. [Phase 1: Graph Refactoring](#3-phase-1-graph-refactoring)
4. [Phase 2: Server Streaming Updates](#4-phase-2-server-streaming-updates)
5. [Phase 3: Tool Progress Reporting](#5-phase-3-tool-progress-reporting)
6. [Phase 4: OpenAI Compatibility](#6-phase-4-openai-compatibility)
7. [Phase 5: Testing](#7-phase-5-testing)
8. [Phase 6: Documentation and Migration](#8-phase-6-documentation-and-migration)
9. [File Reference](#9-file-reference)
10. [Rollback Plan](#10-rollback-plan)

---

## 1. Current Architecture Analysis

### 1.1 Current Graph Structure

**File**: `services/bernard/src/agent/graph/bernard.graph.ts`

```typescript
// Current structure (simplified)
export function createBernardGraph(context: AgentContext) {
  const { tools } = context;

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("react", reactNode)
    .addNode("response", responseNode)
    .addEdge(START, "react")
    .addConditionalEdges("react", shouldContinue, {
      tools: "tools",      // <-- NOT IMPLEMENTED
      response: "response",
    })
    .addEdge("response", END)
    .compile({
      checkpointer: context.checkpointer,
    });

  return graph;
}

// reactNode uses createAgent with tools bound via middleware
async function reactNode(state, config) {
  const agent = await reactAgent(state, config, context);
  const response = await agent.invoke(state);
  return { messages: [response] };
}
```

### 1.2 Current Streaming in Server

**File**: `services/bernard/src/server.ts`

```typescript
// Current streaming (simplified)
const streamResult = await graph.stream(
  { messages },
  { ...config, streamMode: ["messages", "updates"] as const }
);

for await (const [mode, chunk] of streamResult) {
  if (mode === "messages") {
    const [message] = chunk;
    // Tool calls are in message.tool_calls, but only when message is COMPLETE
    // No way to see them as they're being generated
  }
}
```

### 1.3 Key Issues

| Issue | Impact | Solution |
|-------|--------|----------|
| Implicit tool execution via middleware | Tool calls not visible in stream | Use explicit `ToolNode` |
| No `tools` node in graph | Can't route to tool execution | Add explicit `tools` node |
| `messages` mode not properly configured | Can't get tool call metadata | Configure `streamMode: ["messages", "custom"]` |
| No progress from tools | Long-running tools appear stuck | Add `config.writer()` calls |

### 1.4 Comparison with Bernard-Chat Template

| Aspect | Current Bernard | Bernard-Chat Template |
|--------|-----------------|----------------------|
| Tool Execution | Implicit (middleware) | Explicit (ToolNode) |
| Graph Structure | Single `react` node | `callModel` + `tools` nodes |
| State | `MessagesAnnotation` | `MessagesAnnotation` |
| Conditional Edges | Points to non-existent `tools` | Properly implemented |

---

## 2. Target Architecture

### 2.1 Graph Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    TARGET ARCHITECTURE                           │
└─────────────────────────────────────────────────────────────────┘

                           ┌──────────────┐
                           │    START     │
                           └──────┬───────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │      callModel Node     │
                    │  - Calls LLM with tools │
                    │  - Returns AIMessage    │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │   routeModelOutput()    │
                    │   (conditional edge)    │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │     tools Node  │ │ response Node   │ │      END        │
    │  (ToolNode with │ │  - Calls LLM    │ │                 │
    │   all tools)    │ │    without tools│ │                 │
    └────────┬────────┘ └────────┬────────┘ └─────────────────┘
             │                   │
             │                   │
             └─────────┬─────────┘
                       │
                       ▼
                    ┌─────────────────────────┐
                    │      callModel Node     │
                    │   (continues loop)      │
                    └─────────────────────────┘
```

### 2.2 Streaming Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    STREAMING DATA FLOW                          │
└─────────────────────────────────────────────────────────────────┘

  graph.stream(inputs, { streamMode: ["messages", "custom"] })
                              │
                              ▼
              ┌───────────────┬┴┬───────────────┐
              │               │ │               │
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ messages │   │ updates  │   │  custom  │
        │  mode    │   │  mode    │   │  mode    │
        └────┬─────┘   └────┬─────┘   └────┬─────┘
             │              │              │
             ▼              │              ▼
        LLM tokens    State updates   Tool progress
        + metadata        │            via writer()
        │                 │
        │                 ▼
        │         completed_tool_results
        │
        ▼
  ┌──────────────────────────────────────────┐
  │  metadata structure:                      │
  │  {                                       │
  │    langgraph_node: "callModel",          │
  │    langgraph_path: "callModel -> tools", │
  │    tool_calls: [                         │
  │      { id, function: { name, arguments } }│
  │    ],                                    │
  │    ...                                   │
  │  }                                       │
  └──────────────────────────────────────────┘
```

### 2.3 Key Components to Change

| File | Changes |
|------|---------|
| `bernard.graph.ts` | Add explicit `tools` node, refactor `react` to `callModel` |
| `server.ts` | Update stream mode config, process `messages` metadata |
| `lib/openai.ts` | Format tool calls for OpenAI compatibility |
| Tool files | Add optional `config.writer()` calls for progress |
| Tests | Add streaming tests |

---

## 3. Phase 1: Graph Refactoring

**Duration**: Day 1-2  
**Objective**: Refactor `bernard.graph.ts` to use explicit `ToolNode` pattern

### 3.1 Step 1.1: Analyze Current Graph

**File**: `services/bernard/src/agent/graph/bernard.graph.ts`

**Current Code**:
```typescript
export function createBernardGraph(context: AgentContext) {
  const { tools, disabledTools } = context;

  const reactNode = async (
    state: typeof MessagesAnnotation.State,
    config: RunnableConfig
  ) => {
    const agent = await reactAgent(state, config, context);
    const response = await agent.invoke(state) as { messages: BaseMessage[] };
    return { messages: response.messages };
  };

  const shouldContinue = (state: typeof MessagesAnnotation.State) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!("tool_calls" in lastMessage)) return "response";
    const toolCalls = (lastMessage as AIMessage).tool_calls;
    if (toolCalls && toolCalls.length > 0) return "tools";
    return "response";
  };

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("react", reactNode)
    .addNode("response", responseNode)
    .addEdge(START, "react")
    .addConditionalEdges("react", shouldContinue, {
      tools: "tools",      // <-- tools node doesn't exist!
      response: "response",
    })
    .addEdge("response", END)
    .compile({ checkpointer: context.checkpointer });

  return graph;
}
```

### 3.2 Step 1.2: Add Explicit Tools Node

**New Code Structure**:
```typescript
import { ToolNode } from "@langchain/langgraph/prebuilt";

export function createBernardGraph(context: AgentContext) {
  const { tools, disabledTools } = context;

  // Filter available tools
  const availableTools = tools.filter(t => !disabledTools?.includes(t.name));

  // Create the tool node
  const toolsNode = new ToolNode(availableTools);

  // callModel node - calls LLM with bound tools
  const callModel = async (
    state: typeof MessagesAnnotation.State,
    config: RunnableConfig
  ): Promise<typeof MessagesAnnotation.Update> => {
    const configuration = ensureConfiguration(config);
    
    // Load model and bind tools
    const model = (await loadChatModel(configuration.model)).bindTools(availableTools);

    // Invoke with system prompt + messages
    const response = await model.invoke([
      {
        role: "system",
        content: configuration.systemPromptTemplate.replace(
          "{system_time}",
          new Date().toISOString(),
        ),
      },
      ...state.messages,
    ]);

    return { messages: [response] };
  };

  // Response node - calls LLM without tools
  const responseNode = async (
    state: typeof MessagesAnnotation.State,
    config: RunnableConfig
  ): Promise<typeof MessagesAnnotation.Update> => {
    const configuration = ensureConfiguration(config);
    const model = await loadChatModel(configuration.model);

    const response = await model.invoke([
      {
        role: "system",
        content: configuration.systemPromptTemplate.replace(
          "{system_time}",
          new Date().toISOString(),
        ),
      },
      ...state.messages,
    ]);

    return { messages: [response] };
  };

  // Routing function
  function routeModelOutput(state: typeof MessagesAnnotation.State): string {
    const lastMessage = state.messages[state.messages.length - 1];
    if ((lastMessage as AIMessage)?.tool_calls?.length || 0 > 0) {
      return "tools";
    }
    return "response";
  }

  // Build graph
  const graph = new StateGraph(MessagesAnnotation, ConfigurationSchema)
    .addNode("callModel", callModel)
    .addNode("tools", toolsNode)
    .addNode("response", responseNode)
    .addEdge(START, "callModel")
    .addConditionalEdges("callModel", routeModelOutput, {
      tools: "tools",
      response: "response",
    })
    .addEdge("tools", "callModel")  // Loop back after tools
    .addEdge("response", END)
    .compile({
      checkpointer: context.checkpointer,
    });

  return graph;
}
```

### 3.3 Step 1.3: Update Imports

```typescript
import { 
  MessagesAnnotation, 
  StateGraph, 
  START, 
  END,
  ConfigurationSchema 
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { BaseMessage, AIMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { loadChatModel } from "../llm/factory.js";
import { ensureConfiguration } from "./configuration.js";
```

### 3.4 Step 1.5: Export Graph Factory

```typescript
// Remove the direct graph export, use factory
export { createBernardGraph };

// Keep convenience export for backward compatibility
let cachedGraph: ReturnType<typeof createBernardGraph> | null = null;

export function getGraph(context: AgentContext) {
  if (!cachedGraph) {
    cachedGraph = createBernardGraph(context);
  }
  return cachedGraph;
}
```

### 3.5 Step 1.6: Verify Compilation

**Command**:
```bash
cd services/bernard && npm run type-check
```

**Expected**: No errors related to the graph refactoring

---

## 4. Phase 2: Server Streaming Updates

**Duration**: Day 3  
**Objective**: Update `server.ts` to use proper stream modes and emit tool events

### 4.1 Step 2.1: Update Stream Mode Configuration

**File**: `services/bernard/src/server.ts`

**Current Code**:
```typescript
const streamResult = await graph.stream(
  { messages },
  { ...config, streamMode: ["messages", "updates"] as const }
);
```

**New Code**:
```typescript
// Use messages and custom modes for full tool call visibility
const streamResult = await graph.stream(
  { messages },
  { 
    ...config, 
    streamMode: ["messages", "updates", "custom"] as const 
  }
);
```

### 4.2 Step 2.2: Process Messages Mode with Tool Extraction

**New Streaming Handler**:
```typescript
for await (const [mode, chunk] of streamResult) {
  if (mode === "messages") {
    const [message, metadata] = chunk as [BaseMessage, StreamMetadata];
    
    // Extract and emit tool calls from metadata
    if (metadata.tool_calls && metadata.tool_calls.length > 0) {
      for (const toolCall of metadata.tool_calls) {
        yield formatToolCallChunk(toolCall, requestId);
      }
    }
    
    // Emit message content
    if (typeof message.content === "string" && message.content) {
      yield formatContentChunk(message.content, requestId);
    }
  }
  else if (mode === "updates") {
    // Handle state updates (for debugging/monitoring)
    yield formatUpdateChunk(chunk, requestId);
  }
  else if (mode === "custom") {
    // Forward custom data (tool progress)
    yield formatCustomChunk(chunk, requestId);
  }
}

// Metadata interface
interface StreamMetadata {
  langgraph_node: string;
  langgraph_path: string;
  langgraph_step: number;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}
```

### 4.3 Step 2.3: Helper Functions

```typescript
function formatToolCallChunk(
  toolCall: StreamMetadata["tool_calls"][0],
  requestId: string
): string {
  const chunk = {
    id: requestId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: BERNARD_MODEL_ID,
    choices: [{
      index: 0,
      delta: {
        tool_calls: [toolCall],
      },
      finish_reason: null,
    }],
  };
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

function formatContentChunk(content: string, requestId: string): string {
  const chunk = {
    id: requestId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: BERNARD_MODEL_ID,
    choices: [{
      index: 0,
      delta: { content },
      finish_reason: null,
    }],
  };
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

function formatCustomChunk(chunk: Record<string, unknown>, requestId: string): string {
  // Forward custom data as custom events
  const event = {
    type: "tool_progress",
    request_id: requestId,
    data: chunk,
  };
  return `data: ${JSON.stringify(event)}\n\n`;
}

function formatUpdateChunk(update: Record<string, unknown>, requestId: string): string {
  // Optional: emit state updates for debugging
  return ""; // Skip by default, enable for debugging
}
```

### 4.4 Step 2.4: Handle Stream Completion

```typescript
// Final chunk
const finalChunk = {
  id: requestId,
  object: "chat.completion.chunk",
  created: Math.floor(Date.now() / 1000),
  model: BERNARD_MODEL_ID,
  choices: [{
    index: 0,
    delta: {},
    finish_reason: "stop",
  }],
};
yield `data: ${JSON.stringify(finalChunk)}\n\n`;
yield "data: [DONE]\n\n";
```

---

## 5. Phase 3: Tool Progress Reporting

**Duration**: Day 4  
**Objective**: Add optional progress reporting to long-running tools

### 5.1 Step 3.1: Create Progress Reporting Utility

**File**: `services/bernard/src/agent/tool/progress.ts`

```typescript
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

export interface ProgressEvent {
  type: "progress" | "step" | "complete" | "error";
  tool: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export function createProgressReporter(
  config: LangGraphRunnableConfig,
  toolName: string
): ProgressReporter {
  return new ProgressReporter(config, toolName);
}

export class ProgressReporter {
  constructor(
    private config: LangGraphRunnableConfig,
    private toolName: string
  ) {}

  emit(phase: ProgressEvent["type"], message: string, data?: Record<string, unknown>): void {
    if (!this.config.writer) return;
    
    this.config.writer({
      _type: "tool_progress",
      tool: this.toolName,
      phase,
      message,
      data,
      timestamp: Date.now(),
    });
  }

  start(message: string): void {
    this.emit("step", `Starting: ${message}`);
  }

  progress(current: number, total: number, message?: string): void {
    this.emit("progress", message || `${current}/${total}`, {
      current,
      total,
      percent: Math.round((current / total) * 100),
    });
  }

  complete(message: string, data?: Record<string, unknown>): void {
    this.emit("complete", message, data);
  }

  error(error: Error): void {
    this.emit("error", error.message, {
      stack: error.stack,
      name: error.name,
    });
  }
}
```

### 5.2 Step 3.2: Update Web Search Tool

**File**: `services/bernard/src/agent/tool/web-search.tool.ts`

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createProgressReporter } from "./progress.js";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

const searchTool = tool(
  async (input, config: LangGraphRunnableConfig) => {
    const progress = createProgressReporter(config, "web_search");
    
    progress.start(`Searching for "${input.query}"`);
    progress.progress(1, 3, "Executing search query");
    
    try {
      const results = await searxng.search(input.query);
      
      progress.progress(2, 3, `Found ${results.length} results`);
      
      // Process results
      const processed = await processSearchResults(results);
      
      progress.progress(3, 3, "Formatting results");
      progress.complete(`Retrieved ${results.length} results`);
      
      return formatSearchResults(processed);
    } catch (error) {
      progress.error(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  },
  {
    name: "web_search",
    description: "Search the web for information using SearXNG",
    schema: z.object({
      query: z.string().describe("The search query"),
      numResults: z.number().default(5).describe("Number of results to return"),
    }),
  }
);
```

### 5.3 Step 3.3: Update Other Tools (Optional)

Tools that benefit from progress reporting:
- `wikipedia-search.tool.ts` - Multi-step search + content retrieval
- `home-assistant-*.tool.ts` - API calls with variable latency
- `plex.tool.ts` - Network requests

Tools that don't need it (fast operations):
- `timer.tool.ts`
- `weather.tool.ts` (usually fast)

---

## 6. Phase 4: OpenAI Compatibility

**Duration**: Day 5  
**Objective**: Ensure tool calls are formatted according to OpenAI specification

### 6.1 Step 4.1: Review OpenAI Tool Call Format

```typescript
// OpenAI format for tool calls in stream
interface OpenAIToolCallChunk {
  id: string;                    // Unique ID for this tool call
  type: "function";
  function: {
    name: string;               // Function name
    arguments: string;          // JSON arguments string
  };
}

// In stream, each tool call is sent as a separate chunk
{
  id: "chatcmpl-abc123",
  object: "chat.completion.chunk",
  created: 1677858242,
  model: "gpt-4",
  choices: [{
    index: 0,
    delta: {
      tool_calls: [{
        id: "call_abc123",
        type: "function",
        function: {
          name: "get_weather",
          arguments: "{\"location\": \"San Francisco\"}"
        }
      }]
    },
    finish_reason: null
  }]
}
```

### 6.2 Step 4.2: Ensure Correct Formatting in Server

**File**: `services/bernard/src/server.ts`

```typescript
function formatToolCallForOpenAI(
  toolCall: {
    id?: string;
    name: string;
    arguments: Record<string, unknown>;
  },
  requestId: string
): string {
  // Ensure ID exists
  const id = toolCall.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Stringify arguments if needed
  const argumentsStr = typeof toolCall.arguments === "string"
    ? toolCall.arguments
    : JSON.stringify(toolCall.arguments);
  
  const chunk = {
    id: requestId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: BERNARD_MODEL_ID,
    choices: [{
      index: 0,
      delta: {
        tool_calls: [{
          id,
          type: "function",
          function: {
            name: toolCall.name,
            arguments: argumentsStr,
          },
        }],
      },
      finish_reason: null,
    }],
  };
  
  return `data: ${JSON.stringify(chunk)}\n\n`;
}
```

### 6.3 Step 4.3: Handle Tool Results

```typescript
// Tool results are sent as regular message chunks with role="tool"
function formatToolResult(
  toolCallId: string,
  toolName: string,
  result: string,
  requestId: string
): string {
  const chunk = {
    id: requestId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: BERNARD_MODEL_ID,
    choices: [{
      index: 0,
      delta: {
        role: "tool",
        tool_call_id: toolCallId,
        content: result,
      },
      finish_reason: null,
    }],
  };
  
  return `data: ${JSON.stringify(chunk)}\n\n`;
}
```

---

## 7. Phase 5: Testing

**Duration**: Day 6-7  
**Objective**: Comprehensive testing of the new streaming functionality

### 7.1 Step 5.1: Unit Tests

**File**: `services/bernard/tests/graph-streaming.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createBernardGraph } from "../src/agent/graph/bernard.graph.js";
import { testContext, testMessages } from "./fixtures.js";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";

describe("Graph Streaming", () => {
  let graph: ReturnType<typeof createBernardGraph>;

  beforeEach(() => {
    graph = createBernardGraph(testContext);
  });

  describe("Stream Mode: messages", () => {
    it("should emit tool calls in messages mode", async () => {
      const stream = await graph.stream(
        { messages: testMessages },
        { streamMode: ["messages"] }
      );

      const toolCalls: Array<{ id: string; name: string }> = [];

      for await (const [mode, chunk] of stream) {
        if (mode === "messages") {
          const [, metadata] = chunk as [unknown, { tool_calls?: Array<{ id: string; function: { name: string } }> }];
          if (metadata.tool_calls) {
            toolCalls.push(...metadata.tool_calls.map(tc => ({
              id: tc.id,
              name: tc.function.name,
            })));
          }
        }
      }

      expect(toolCalls.length).toBeGreaterThan(0);
      expect(toolCalls[0]).toHaveProperty("id");
      expect(toolCalls[0]).toHaveProperty("name");
    });

    it("should emit message content tokens", async () => {
      const stream = await graph.stream(
        { messages: testMessages },
        { streamMode: ["messages"] }
      );

      let contentTokens = "";
      for await (const [mode, chunk] of stream) {
        if (mode === "messages") {
          const [message] = chunk;
          if (typeof message.content === "string") {
            contentTokens += message.content;
          }
        }
      }

      expect(contentTokens.length).toBeGreaterThan(0);
    });
  });

  describe("Stream Mode: custom", () => {
    it("should emit progress events from tools", async () => {
      const stream = await graph.stream(
        { messages: testMessages },
        { streamMode: ["custom"] }
      );

      const progressEvents: Array<{ _type: string }> = [];

      for await (const [mode, chunk] of stream) {
        if (mode === "custom") {
          progressEvents.push(chunk as { _type: string });
        }
      }

      // Should have progress events for tools that report them
      const progressTypes = progressEvents.map(e => e._type);
      expect(progressTypes).toContain("tool_progress");
    });
  });

  describe("Stream Mode: all", () => {
    it("should handle multiple stream modes simultaneously", async () => {
      const stream = await graph.stream(
        { messages: testMessages },
        { streamMode: ["messages", "updates", "custom"] as const }
      );

      const events = {
        messages: 0,
        updates: 0,
        custom: 0,
      };

      for await (const [mode, chunk] of stream) {
        events[mode as keyof typeof events]++;
      }

      expect(events.messages).toBeGreaterThan(0);
      // updates may be empty depending on node implementation
    });
  });
});
```

### 7.2 Step 5.2: Integration Tests

**File**: `services/bernard/tests/integration/streaming.e2e.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { createBernardGraph } from "../../src/agent/graph/bernard.graph.js";
import { createTestContext } from "../fixtures.js";

describe("End-to-End Streaming", () => {
  it("should complete a full agent cycle with tool calls", async () => {
    const context = createTestContext();
    const graph = createBernardGraph(context);

    const inputMessages = [{
      role: "user",
      content: "Search for weather in San Francisco"
    }];

    const toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    const contentChunks: string[] = [];

    const stream = await graph.stream(
      { messages: inputMessages },
      { streamMode: ["messages", "custom"] as const }
    );

    for await (const [mode, chunk] of stream) {
      if (mode === "messages") {
        const [message, metadata] = chunk as [unknown, { tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> }];
        
        if (metadata.tool_calls) {
          toolCalls.push(...metadata.tool_calls.map(tc => ({
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          })));
        }
        
        if (typeof (message as { content?: string }).content === "string") {
          contentChunks.push((message as { content: string }).content);
        }
      }
    }

    // Verify tool was called
    expect(toolCalls.some(tc => tc.name === "weather")).toBe(true);
    
    // Verify response was generated
    const fullResponse = contentChunks.join("");
    expect(fullResponse.length).toBeGreaterThan(0);
  });
});
```

### 7.3 Step 5.3: Run Tests

```bash
cd services/bernard
npm run tests -- --run
```

**Expected**: All tests pass

---

## 8. Phase 6: Documentation and Migration

**Duration**: Day 8  
**Objective**: Document changes and provide migration guide

### 8.1 Step 6.1: Update Documentation

**File**: `docs/streaming.md`

```markdown
# Bernard Tool Call Streaming

## Overview

Bernard now supports real-time streaming of tool calls. When streaming is enabled, clients receive:

1. **Tool call events** as they're generated by the LLM
2. **Tool progress events** from long-running operations
3. **Response tokens** as they're generated

## Enabling Streaming

```typescript
// Server-side (automatic in /v1/chat/completions)
const stream = await graph.stream(
  { messages },
  { streamMode: ["messages", "custom"] }
);

// Client-side
const response = await fetch("/v1/chat/completions", {
  method: "POST",
  body: JSON.stringify({
    model: "bernard-v1",
    messages: [{ role: "user", content: "..." }],
    stream: true,
  }),
});
```

## Stream Events

| Event | Description |
|-------|-------------|
| `tool_call` | Tool invocation with name and arguments |
| `content` | Response text token |
| `progress` | Tool execution progress |
```

### 8.2 Step 6.2: Migration Guide

```markdown
## Migration Guide

### For OpenAI-Compatible Clients

**No changes required** - existing clients continue to work.

### For Internal Clients

Update stream handling to extract tool calls from metadata:

```typescript
// Old
for await (const [mode, chunk] of stream) {
  if (mode === "messages") {
    const [message] = chunk;
    // Only message.content available
  }
}

// New
for await (const [mode, chunk] of stream) {
  if (mode === "messages") {
    const [message, metadata] = chunk;
    // message.content for text
    // metadata.tool_calls for tool invocations
  }
  if (mode === "custom") {
    // Tool progress events
  }
}
```
```

---

## 9. File Reference

### 9.1 Files to Create

| File | Purpose |
|------|---------|
| `services/bernard/src/agent/tool/progress.ts` | Progress reporter utility |
| `services/bernard/tests/graph-streaming.test.ts` | Unit tests |
| `services/bernard/tests/integration/streaming.e2e.test.ts` | Integration tests |
| `docs/streaming.md` | User documentation |

### 9.2 Files to Modify

| File | Changes |
|------|---------|
| `services/bernard/src/agent/graph/bernard.graph.ts` | Refactor to use explicit ToolNode |
| `services/bernard/src/server.ts` | Update streaming configuration and handlers |
| `services/bernard/src/agent/tool/web-search.tool.ts` | Add progress reporting |
| `services/bernard/src/agent/tool/wikipedia-search.tool.ts` | Add progress reporting (optional) |
| `services/bernard/src/lib/openai.ts` | Review for compatibility |

### 9.3 Files to Delete (After Verification)

| File | Reason |
|------|--------|
| None (backward compatible) | All changes are additive |

---

## 10. Rollback Plan

### 10.1 Rollback Triggers

| Condition | Action |
|-----------|--------|
| Type errors > 10 | Immediate rollback |
| Test failures > 5% | Investigate, rollback if critical |
| API breaking change detected | Immediate rollback |

### 10.2 Rollback Steps

```bash
# 1. Revert graph changes
git checkout HEAD -- services/bernard/src/agent/graph/bernard.graph.ts

# 2. Revert server changes
git checkout HEAD -- services/bernard/src/server.ts

# 3. Run type check
npm run type-check

# 4. Run tests
npm run tests -- --run
```

### 10.3 Recovery

If issues are found after deployment:

```bash
# 1. Stop service
pm2 stop bernard

# 2. Revert to previous version
git revert <commit-hash>
npm run build

# 3. Restart
pm2 start bernard
```

---

## Summary

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| 1 | Day 1-2 | Refactored `bernard.graph.ts` with explicit ToolNode |
| 2 | Day 3 | Updated `server.ts` with proper stream modes |
| 3 | Day 4 | Progress reporting in key tools |
| 4 | Day 5 | OpenAI-compatible tool call formatting |
| 5 | Day 6-7 | Complete test suite |
| 6 | Day 8 | Documentation and migration guide |

**Total Effort**: 8 days  
**Risk Level**: Low (uses built-in LangGraph features)  
**Backward Compatibility**: 100%

---

## Appendix A: Stream Mode Reference

| Mode | Output | Use For |
|------|--------|---------|
| `messages` | `[messageChunk, metadata]` | LLM tokens + tool calls |
| `updates` | `{ nodeName: { ...updates } }` | State deltas |
| `custom` | Any user data | Tool progress |
| `values` | Full state snapshot | Debugging |
| `debug` | Detailed trace | Debugging |

## Appendix B: Metadata Structure

```typescript
interface StreamMetadata {
  // Always present
  langgraph_node: string;      // e.g., "callModel"
  langgraph_path: string;      // e.g., "callModel -> tools"
  langgraph_step: number;      // e.g., 1
  
  // Present when LLM generates tool calls
  tool_calls?: Array<{
    id: string;                // Unique ID
    type: "function";
    function: {
      name: string;           // Tool name
      arguments: string;      // JSON args
    };
  }>;
  
  // Present when using tags
  tags?: string[];
  
  // Present for some models
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

---

*Document Version: 2.0.0*  
*Last Updated: 2026-01-03*
