# Streaming Orchestrator

The **Streaming Orchestrator** is the central brain of a conversation turn. it coordinates the flow between router and Response harnesses while managing data persistence and event sequencing.

## Purpose

The orchestrator sits at the top level of the agent execution. Its job is to:
1. Identify and setup the conversation context.
2. Persist incoming user messages.
3. Chain the output streams of specialized harnesses.
4. Provide a unified, streamable result to the API layer.

## Architecture

The orchestrator uses a `createDelegateSequencer` to merge multiple async generators (router, Memory, Response) into a single ordered stream of events.

### Major Responsibilities

- **Conversation Management**: Resolves conversation IDs and fetches state via the `RecordKeeper`.
- **Event Recording**: Listens to events from the internal harnesses and uses the `Recorder` to save LLM calls, tool calls, and final responses.
- **Trace Management**: Filters events based on whether "tracing" is enabled. Traces like `llm_call` are often hidden from end-users but visible in debugging tools.
- **Transformation**: Its output is typically transformed by `transformAgentOutputToChunks` into OpenAI-compatible SSE chunks for the client-facing API.

## Core Methods

### `run(input: OrchestratorInput): Promise<OrchestratorResult>`

This is the main entry point for a conversation turn.

**Input**:
- `conversationId`: The ID of the conversation.
- `incoming`: The raw messages from the user request.
- `persistable`: The messages to be saved (often filtered or enriched).
- `trace`: Boolean flag to enable/disable detailed trace events.

**Output**:
- `stream`: An `AsyncIterable<AgentOutputItem>` for real-time progress.
- `result`: A `Promise` that resolves to the final state of the conversation turn once complete.

## Design Patterns

- **Separation of Concerns**: The orchestrator knows *when* to run a harness but not *how* a harness works internally.
- **Archivist/Recorder Split**: It uses specialized interfaces for reading history (`Archivist`) and writing events (`Recorder`) to ensure clear data boundaries.

## Usage in API

The orchestrator is used by the `chat/completions` route to handle both streaming and non-streaming requests in a unified way.

```typescript
const orchestrator = new StreamingOrchestrator(keeper, routerLLM, responseLLM);
const turnResult = await orchestrator.run({ ... });

// Stream the output
for await (const event of turnResult.stream) {
    // ...
}
```
