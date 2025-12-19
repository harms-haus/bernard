---
name: delegate-streaming-chat-completions-overhaul
overview: Replace the current callback/buffering-based orchestrator and /api/v1/chat/completions streaming with a DelegateStream-driven async-iterable pipeline. Harnesses become async generators that yield output chunks as they happen; the route re-emits them immediately while recordKeeper continues capturing traces.
todos:
  - id: local-search-policy
    content: Use Grep/SemanticSearch for repo searches (mcp-local-rag not available).
    status: pending
  - id: delete-legacy
    content: Delete legacy graph/orchestrator/harness/streaming-helper files targeted by the overhaul.
    status: pending
  - id: delegate-sequencer
    content: Implement DelegateSequencer (relay pattern) + tests.
    status: pending
  - id: streaming-types-and-sse
    content: Define streaming item types and SSE encoding for OpenAI-shaped chunks + bernard trace chunks.
    status: pending
  - id: llm-streaming-wrapper
    content: Add a streaming-capable LLM wrapper built on ChatOpenAI.stream().
    status: pending
  - id: rewrite-router-harness
    content: Reimplement router harness as async generator emitting llm_prompt trace + tool_calls/tool_outputs whole, excluding respond() from stream.
    status: pending
  - id: rewrite-response-harness
    content: Reimplement response harness as async generator that streams tokens in real time.
    status: pending
  - id: turn-runner
    content: Create chat completion turn runner that chains harness streams into DelegateSequencer and returns {stream,result}.
    status: pending
  - id: rewrite-chat-route
    content: Rewrite /api/v1/chat/completions route to re-emit yielded chunks immediately (no buffering).
    status: pending
  - id: fix-completions-route
    content: Update /api/v1/completions to remove dependency on deleted buildGraph (keep repo consistent).
    status: pending
  - id: tests-overhaul
    content: "Rewrite/add tests: sequencer, streaming timing, route behavior, harness behavior, recordKeeper interactions."
    status: pending
---

## Goals

- **Real-time streaming** for `/api/v1/chat/completions` using a DelegateStream-style async-iterable sequencer (no buffering `streamEvents.push(...)` then replay).
- **Harnesses are async generators**: they `yield` output chunks as they are created; the API route re-emits yields **immediately**.
- **router phase**:
  - Emit **LLM prompt context** (system + user + history) as **one chunk** at each router-model call.
  - Emit **tool calls** and **tool results** **whole** (one chunk per call/result) at execution time.
  - Do **not** emit the internal `respond()` tool-call marker (still recorded in transcript/recordKeeper).
- **Response phase**:
  - Emit **LLM prompt context** (system + history) as **one chunk**.
  - Stream **LLM tokens in real time** by consuming the model’s async iterator (`ChatOpenAI.stream(...)`) and re-emitting each chunk immediately.
- **Keep OpenAI-like SSE envelope** for compatibility with existing UI/tests, but add Bernard trace chunks as additional SSE messages (`choices: []` + `bernard: {...}`) that clients may ignore.
- **Total overhaul**: delete old modules being replaced; no legacy shims left.
- **Comprehensive tests** covering ordering, timing (no buffering), abort/error paths, and OpenAI envelope compatibility.

---

## What’s broken today (and why it can’t be “patched”)

The current streaming route buffers events:

- In [`bernard/app/api/v1/chat/completions/route.ts`](bernard/app/api/v1/chat/completions/route.ts), streaming does:
  - `streamEvents.push(event)` inside `graph.runWithDetails(...)`
  - Only after `runWithDetails` finishes does it loop over `streamEvents` and emit.

So the output stream **cannot be real time** by construction.

Additionally, the current LLM wrapper `ChatModelCaller` only uses `invoke()` (non-stream) and the response harness “streams” by chunking a completed string.

---

## High-level redesign

We’ll build a new streaming spine:

- **DelegateSequencer** (aka “relay pattern” from Tim Etler’s DelegateStream article) provides:
  - `sequence: AsyncGenerator<T>` (what the route consumes)
  - `chain(nextIterable | null)` (inject more streams at any time)

- **Harnesses** become async generators that yield **semantic output items** (`AgentOutputItem`) which the route encodes into SSE.

- **Turn runner** spawns the router/memory/response work in an async task and chains each produced stream into the sequencer.

### Why a sequencer (vs a simple `yield*`)

A plain orchestrator generator can do `yield* router()` then `yield* response()`. That streams sequentially, but doesn’t satisfy the “DelegateStream injection” requirement.

The sequencer explicitly models the “inject new iterables while streaming is in progress” capability, matching the article’s core concept. Even if we don’t exploit parallelism heavily on day 1, the abstraction is the correct foundation.

---

## Streaming contract (wire format)

We keep the existing OpenAI-like envelope used by the UI (`bernard-ui/src/components/ChatInterface.tsx`).

### 1) Normal assistant/tool streaming chunks (existing shape)

Each emitted SSE message is:

```ts
// SSE line payload (JSON), written as: `data: ${JSON.stringify(payload)}\n\n`
{
  id: string,
  object: "chat.completion.chunk",
  created: number,
  model: "bernard-v1",
  choices: [
    {
      index: 0,
      delta: {
        role?: "assistant",
        content?: string,
        tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>,
        tool_outputs?: Array<{ id: string; content: string }>,
      },
      finish_reason: null | "stop",
    }
  ]
}
```

### 2) Bernard trace chunks (new)

Used for “LLM system prompt + user prompt + history (emitted whole…)”.

```ts
{
  id,
  object: "chat.completion.chunk",
  created,
  model: "bernard-v1",
  choices: [],
  bernard: {
    type: "llm_prompt",
    stage: "router" | "response",
    model: string,
    messages: Array<{ role: string; content: unknown; name?: string }>,
  }
}
```

- Existing UI will JSON-parse successfully but ignore because `choices[0]` is absent.
- Future clients can use the `bernard` field to render debug/trace views.

---

## Target execution flow (matches `docs/STREAMING-PLAN.md`)

We will enforce the following ordering (each bullet is one or more yielded SSE payloads):

1. **User prompt**: recorded by recordKeeper (no stream chunk required).
2. **router LLM prompt context**: emit one `bernard.type="llm_prompt"` chunk; record via `recordLLMCall`.
3. **router tool call**: emit one `delta.tool_calls=[...]` chunk; record as part of transcript append.
4. Repeat (2)-(3) for additional router iterations.
5. **router tool results**: emit one `delta.tool_outputs=[{id,content}]` per tool result as each tool finishes; record tool result metrics + transcript tool messages.
6. **router respond() marker**: recorded in transcript, **NOT emitted**.
7. **Response LLM prompt context**: emit one `bernard.type="llm_prompt"` chunk; record via `recordLLMCall` at completion.
8. **Response streaming**: emit `delta.content` chunks in real time from the model’s async iterator.

---

## Files to delete first (clean-slate replacement)

These will be removed at the start of implementation (then rebuilt in new locations):

- [`bernard/app/api/v1/chat/completions/route.ts`](bernard/app/api/v1/chat/completions/route.ts)
- [`bernard/app/api/v1/chat/completions/streaming-helper.ts`](bernard/app/api/v1/chat/completions/streaming-helper.ts)
- [`bernard/lib/agent.ts`](bernard/lib/agent.ts) (current “graph wrapper” around the orchestrator)
- [`bernard/agent/orchestrator/orchestrator.ts`](bernard/agent/orchestrator/orchestrator.ts)
- [`bernard/agent/orchestrator/factory.ts`](bernard/agent/orchestrator/factory.ts)
- [`bernard/agent/orchestrator/config.ts`](bernard/agent/orchestrator/config.ts)
- [`bernard/agent/harness/lib/types.ts`](bernard/agent/harness/lib/types.ts) (replaced with streaming-first types)
- [`bernard/agent/harness/router/router.harness.ts`](bernard/agent/harness/router/router.harness.ts)
- [`bernard/agent/harness/respond/respond.harness.ts`](bernard/agent/harness/respond/respond.harness.ts)
- [`bernard/agent/harness/memory/memory.harness.ts`](bernard/agent/harness/memory/memory.harness.ts) (rewritten stub)

We’ll also remove any now-unused helpers (e.g. `chatChunks.ts`) once compilation proves they’re dead.

---

## New modules (replacement architecture)

### A) Delegate streaming primitives

Create a focused streaming folder:

- [`bernard/agent/streaming/delegateSequencer.ts`](bernard/agent/streaming/delegateSequencer.ts)
- [`bernard/agent/streaming/sse.ts`](bernard/agent/streaming/sse.ts)

#### `delegateSequencer` (core theory + code)

This is the “relay pattern” (ordered consumption of parallel production) described in the DelegateStream article.

```ts
export type AnyIterable<T> = AsyncIterable<T> | Iterable<T>;
export type Chainable<T> = AnyIterable<T> | null;

export function createDelegateSequencer<T>() {
  const queue: Promise<Chainable<T>>[] = [];
  let resolveNext: (it: Chainable<T>) => void;

  const enqueuePromise = () => {
    const { promise, resolve } = Promise.withResolvers<Chainable<T>>();
    queue.push(promise);
    resolveNext = (it) => {
      enqueuePromise();
      resolve(it);
    };
  };

  enqueuePromise();

  const sequence = (async function* () {
    let it: Chainable<T> | undefined;
    while ((it = await queue.shift())) {
      yield* it;
    }
  })();

  return {
    sequence,
    chain: (it: Chainable<T>) => resolveNext(it),
  };
}
```

### B) Streaming-first types

- [`bernard/agent/streaming/types.ts`](bernard/agent/streaming/types.ts)

Key types:

- `BernardTraceChunk` (llm_prompt, etc.)
- `BernardDeltaChunk` (content/tool_calls/tool_outputs)
- `AgentOutputItem = BernardTraceChunk | BernardDeltaChunk`

### C) LLM wrappers (non-stream + stream)

Replace the current `LLMCaller` contract with a streaming-capable interface:

- [`bernard/agent/llm/llm.ts`](bernard/agent/llm/llm.ts)
- [`bernard/agent/llm/chatOpenAI.ts`](bernard/agent/llm/chatOpenAI.ts)

Design:

- `complete(...) -> Promise<{ message; text; toolCalls; usage; trace }>`
- `streamText(...) -> AsyncIterable<{ delta: string }>` plus final metadata returned separately.

Implementation uses LangChain’s streaming API:

- `ChatOpenAI.stream(...)` yields chunks as an async iterable (per LangChainJS docs).
- Reference: `ChatOpenAI.stream` usage in LangChainJS docs: `/langchain-ai/langchainjs` (provider README) and LangGraphJS token streaming examples.

### D) Harnesses as async generators

- [`bernard/agent/harness/router/routerHarness.ts`](bernard/agent/harness/router/routerHarness.ts)
- [`bernard/agent/harness/respond/responseHarness.ts`](bernard/agent/harness/respond/responseHarness.ts)
- [`bernard/agent/harness/memory/memoryHarness.ts`](bernard/agent/harness/memory/memoryHarness.ts)

Each harness becomes:

```ts
export interface StreamingHarness<TIn, TOut> {
  run(input: TIn, ctx: HarnessContext): AsyncGenerator<AgentOutputItem, TOut>;
}
```

#### router harness streaming behavior

- On each model call:
  - `yield { type:"bernard_trace", bernard:{ type:"llm_prompt", ... } }` once.
  - call model **non-streaming** to obtain tool calls.
- For each tool call (except respond):
  - `yield` one `delta.tool_calls=[...]` chunk **before execution**.
  - execute tool with timeout.
  - `yield` one `delta.tool_outputs=[{...}]` chunk **after result**.

#### Response harness streaming behavior

- `yield` one `llm_prompt` trace chunk.
- call `streamText()` and for each delta token:
  - `yield` `delta.content = token` immediately.

### E) Turn runner (agentic loop)

- [`bernard/agent/loop/chatCompletionsTurn.ts`](bernard/agent/loop/chatCompletionsTurn.ts)

Responsibilities:

- Build initial conversation snapshot (from merged messages).
- Append user/persistable messages to recordKeeper.
- Run router + memory (memory can remain a stub initially).
- Update conversation thread with tool messages.
- Run response and persist the final assistant message.

Crucially: it returns **both** a stream and a final result without buffering:

```ts
export function runChatCompletionTurn(...): {
  stream: AsyncIterable<AgentOutputItem>;
  result: Promise<FinalTurnResult>;
}
```

Internally:

- create `const { sequence, chain } = createDelegateSequencer<AgentOutputItem>()`
- start an async task that chains:
  - router harness generator
  - response harness generator
  - then `chain(null)`
- return `{ stream: sequence, result: taskPromise }`

### F) API route rewrite

Rewrite:

- [`bernard/app/api/v1/chat/completions/route.ts`](bernard/app/api/v1/chat/completions/route.ts)

New behavior:

- If `stream !== true`: run `result` to completion and return a single JSON response (same as today).
- If `stream === true`:
  - Create `ReadableStream<Uint8Array>` that `for await` consumes `turn.stream` and writes SSE frames immediately.
  - Emit the initial `{delta:{role:"assistant"}}` chunk once.
  - Emit finish chunk + optional usage + `[DONE]` when `turn.result` resolves.

We will **not** collect events in arrays.

### G) (Optional) completions endpoint follow-up

Because `bernard/app/api/v1/completions/route.ts` currently depends on `buildGraph` (which we’re deleting), we will either:

- Migrate it to a simplified “response-only” streaming runner, or
- Replace it with a thin wrapper around the same response harness.

(Implementation will be included so the repo stays coherent.)

---

## LangGraph usage decision

LangGraphJS supports `streamEvents(...)` and token-level events (`on_chat_model_stream`) as an async iterable (see `/langchain-ai/langgraphjs` docs). However:

- Our required emission semantics are **domain-specific** (e.g. don’t emit `respond()` calls; emit tool results whole; emit prompt contexts as single trace chunks).
- Implementing the loop directly is simpler, more testable, and avoids importing LangGraph’s event taxonomy into our API contract.

We will therefore:

- Use **LangChain ChatOpenAI streaming** directly for response token streaming.
- Keep LangGraph available for future multi-node graphs, but not required for this overhaul.

---

## Hazards + mitigations (and how we’ll test)

### 1) “Looks streamed” but still buffered

- **Hazard**: accidentally accumulating deltas then yielding at the end (like today).
- **Mitigation**: structure code so the route consumes a single async iterable and writes per-item immediately.
- **Test**: a deterministic async generator that blocks on a deferred promise between yields; assert first SSE chunk arrives before the deferred resolves.

### 2) Client disconnect / abort handling

- **Hazard**: model stream continues running after client disconnects.
- **Mitigation**: plumb an `AbortSignal` from the request/ReadableStream cancel into the turn runner and LLM/tool calls.
- **Test**: cancel the reader early; assert LLM stream abort hook was invoked.

### 3) Tool output size + SSE frame size

- **Hazard**: large tool outputs cause giant SSE messages.
- **Mitigation**: keep “whole tool results” but add a configurable truncation policy for **streaming** (not for recordKeeper), e.g. `STREAM_TOOL_OUTPUT_MAX_CHARS`.
- **Test**: tool result > limit yields truncated output with explicit marker; recordKeeper still stores full ToolMessage.

### 4) Double-recording or missing recordKeeper entries

- **Hazard**: moving logic into generators can cause duplicate `appendMessages` calls.
- **Mitigation**: define a single “persistence boundary” per phase.
- **Test**: stub recordKeeper and assert exact call counts + payload shapes.

### 5) Tool call ID mapping

- **Hazard**: tool outputs must reference the tool call id for UI correlation.
- **Mitigation**: enforce a single source of truth for toolCallId; propagate into `tool_outputs` chunks.
- **Test**: stream contains `tool_calls[0].id === tool_outputs[0].id` for the same tool execution.

### 6) Usage emission

- **Hazard**: streaming path fails to emit `usage` when `stream_options.include_usage` is true.
- **Mitigation**: accumulate usage in `turn.result` and emit a terminal usage chunk, preserving existing behavior.
- **Test**: streaming response includes a usage frame when requested.

---

## Test suite plan (server + streaming)

We will rewrite/replace tests that cover deleted modules, and add new tests for timing.

### New/updated tests (minimum)

- `bernard/tests/delegateSequencer.test.ts`
  - sequences iterables in order
  - supports chaining next iterable after consumption begins
  - terminates on `null`

- `bernard/tests/chatCompletions.streaming.test.ts`
  - **real-time**: first token arrives before completion
  - tool call + tool output are single-frame chunks
  - `respond()` marker is not emitted
  - bernard trace frames (`choices: []`, `bernard.llm_prompt`) appear at the right times

- Update `bernard/tests/openai.routes.behavior.test.ts`
  - keep expectations about role chunk, tool_calls, content, usage, [DONE]
  - add assertions for bernard trace chunks (optional, behind feature flag if desired)

- Update/replace `bernard/tests/harness.router.test.ts` and `bernard/tests/harness.respond.test.ts`
  - move from callback-style `onStreamEvent` to consuming async generators

- Update/replace `bernard/tests/agent.test.ts` and `bernard/tests/orchestrator.test.ts`
  - replace `buildGraph` and orchestrator tests with new turn runner tests

### Streaming timing test technique (example)

Use a fake LLM stream that yields one token, then awaits a deferred promise. In the test, begin reading the HTTP response stream, and assert the first SSE chunk is readable before resolving the deferred.

---

## Mermaid: new dataflow (stream injection)

```mermaid
flowchart TD
  httpReq[HTTP_POST_/chat/completions] --> runner[runChatCompletionTurn]
  runner --> seq[DelegateSequencer]
  router[routerHarness_stream] -->|chain()| seq
  response[ResponseHarness_stream] -->|chain()| seq
  seq --> sse[SSE_Encoder]
  sse --> httpRes[HTTP_SSE_Response]

  runner --> rk[RecordKeeper]
  router --> rk
  response --> rk
```

---

## Implementation todos

- **delete-legacy**: Delete the files listed above and remove any now-unused exports/imports.
- **delegate-sequencer**: Implement `createDelegateSequencer` and unit tests.
- **streaming-types**: Define `AgentOutputItem` + SSE encoding helpers.
- **llm-streaming**: Implement `ChatOpenAI` streaming wrapper using `ChatOpenAI.stream(...)` and add tests with a fake async iterable.
- **router-harness**: Rebuild router harness as an async generator; ensure tool calls/results are emitted whole; recordKeeper integration preserved.
- **response-harness**: Rebuild response harness to stream token deltas from the LLM async iterator.
- **turn-runner**: Implement `runChatCompletionTurn` returning `{ stream, result }`.
- **route-chat-completions**: Rewrite streaming path to `for await` over `turn.stream` and write SSE per item.
- **route-completions**: Update `/completions` endpoint to no longer depend on deleted `buildGraph`.
- **tests-overhaul**: Update existing route/harness/orchestrator tests to the new architecture; add timing tests.

---

## Acceptance criteria

- `/api/v1/chat/completions` streaming emits:
  - tool calls/results as they happen (no post-hoc replay)
  - response tokens in real time
  - `[DONE]` terminator
  - optional usage terminal frame
- No buffered arrays of stream events exist in the new codepath.
- Old orchestrator/graph wrapper/harness callback streaming code is fully deleted.
- Test suite passes and includes at least one timing-based regression test proving real-time behavior.