# Router Harness

The **Router Harness** is a goal-oriented component responsible for selecting and executing tools to fulfill a user's request. It operates in a loop, interacting with the LLM to determine the necessary actions until the objective is reached or a terminal "respond" tool is called.

## Purpose

The primary purpose of the Router Harness is to act as an agentic router. It analyzes user router, checks available tools, and executes them to gather information or perform actions safely and efficiently.

## Core Architecture

The harness is implemented as an async generator, emitting standardized events that allow the orchestrator and the client to track its progress in real-time.

### Key Components

- **Tool Definitions**: Automatically retrieved and formatted for the LLM system prompt.
- **Context Preparation**: Integrates historical messages from the `Archivist` with the current request.
- **Execution Loop**: iteratively calls the LLM, parses tool requests, executes them, and feeds the results back into the context.

## Standardized Events

The Router Harness emits the following `AgentOutputItem` events:

- `llm_call`: Emitted before calling the LLM, containing the full prompt context.
- `llm_call_complete`: Emitted after the LLM responds, containing the raw content.
- `tool_call`: Emitted when a tool execution starts.
- `tool_call_complete`: Emitted when a tool finishes, containing the result/output.
- `error`: Emitted when an error occurs during LLM interaction or tool execution.

## Helper Functions

The harness is split into several testable units:

- `getRouterToolDefinitions()`: Returns the list of tools and their formatting for the prompt.
- `prepareInitialContext()`: Fetches history and builds the message stack for the LLM.
- `executeTool()`: Performs the actual tool invocation, handling argument parsing and error recovery.

## Usage

```typescript
import { runRouterHarness } from "@/agent/harness/router/routerHarness";

for await (const event of runRouterHarness(context)) {
    if (event.type === 'tool_call') {
        console.log(`Executing ${event.toolCall.function.name}...`);
    }
}
```

## Testing

The harness has extensive tests in `tests/routerHarness.test.ts`, covering both individual helper functions and the full generator flow. This ensures reliability in complex multi-turn conversation scenarios.
