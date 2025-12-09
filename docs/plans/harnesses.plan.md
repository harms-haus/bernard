# Harness Architecture Plan (expanded v2)

## Objectives

- Stand up an agentic loop with clear phase boundaries: Ingest → Gather (Intent + Memory) → Respond → Recover.
- Isolate four harness domains (intent, memory, respond, utility) sharing common contracts; each harness controls its LLM context/stop rules. Memory/Utility ship as stubs now.
- Keep RecordKeeper as single source of truth for conversation history; orchestrator coordinates harnesses and cleanup.

## Directory & File Map

- `bernard/agent/orchestrator/`
  - `orchestrator.ts` (main loop)
  - `config.ts` (per-phase models/timeouts/limits)
- `bernard/agent/record-keeper/`
  - `record-keeper.ts` (ingest/append/get thread)
  - `types.ts` (ConversationThread, Turn, ToolCall, etc.)
- `bernard/agent/harness/lib/`
  - `types.ts` (Harness, HarnessContext, HarnessResult, LLMCaller, traces)
  - `prompts.ts` (shared helpers/builders)
  - `errors.ts` (typed errors/timeout markers)
- `bernard/agent/harness/intent/intent.harness.ts`
- `bernard/agent/harness/memory/memory.harness.ts` (stub)
- `bernard/agent/harness/respond/respond.harness.ts`
- `bernard/agent/harness/utility/utility.harness.ts` (stub)
- Tests under `bernard/tests/agent/**`

## Core Contracts (LLM + Harness base)

```ts
// bernard/agent/harness/lib/types.ts
export interface LLMCallConfig { model: string; messages: ChatMessage[]; temperature?: number; maxTokens?: number; stream?: boolean; }
export interface LLMResponse { text: string; toolCalls?: ToolCall[]; raw?: unknown; }
export interface LLMCaller { call(input: LLMCallConfig): Promise<LLMResponse>; }

export interface HarnessContext {
  conversation: ConversationThread; // read-only from RecordKeeper
  config: HarnessConfig;            // model names, timeouts, limits
  now: () => Date;
}
export interface Harness<TIn, TOut> {
  run(input: TIn, ctx: HarnessContext): Promise<HarnessResult<TOut>>;
}
export interface HarnessResult<T> { output: T; done: boolean; trace?: HarnessTrace; error?: HarnessError; }
```

## Conversation Model (RecordKeeper)

- Normalizes incoming history (user/assistant/tool messages + metadata) into `ConversationThread` (array of `Turn`s with roles and tool calls).
- Exposes append-only API; harnesses consume snapshots.
```ts
// bernard/agent/record-keeper/types.ts
export type Role = 'user' | 'assistant' | 'tool';
export interface Turn { id: string; role: Role; content: string; toolCall?: ToolCall; ts: number; }
export interface ConversationThread { turns: Turn[]; recent(n?: number): Turn[]; }
```
```ts
// bernard/agent/record-keeper/record-keeper.ts
export class RecordKeeper {
  constructor(private readonly store: ConversationStore) {}
  ingest(raw: IncomingConversation): ConversationThread { /* normalize + persist */ }
  append(event: Turn): void { /* persist */ }
  snapshot(): ConversationThread { /* read-only view */ }
}
```


## Orchestrator Flow & Relationships

- Orchestrator owns harness instances and RecordKeeper reference; injects preconfigured LLM callers per harness.
- Sequence: Ingest (RecordKeeper.ingest) → Gather (Promise.all Intent + Memory) → Respond (single call) → Recover (append assistant turn, log traces/errors, metrics, cleanup hooks).
```ts
// bernard/agent/orchestrator/orchestrator.ts
export class Orchestrator {
  constructor(
    private readonly recordKeeper: RecordKeeper,
    private readonly intent: IntentHarness,
    private readonly memory: MemoryHarness,
    private readonly respond: ResponseHarness,
    private readonly utility: UtilityHarness,
  ) {}

  async run(raw: IncomingConversation) {
    const conversation = this.recordKeeper.ingest(raw);
    const ctx: HarnessContext = { conversation, config: buildConfig(), now: () => new Date() };

    const [intentRes, memoryRes] = await Promise.all([
      this.intent.run({ message: raw.latest }, ctx),
      this.memory.run({ query: raw.latest }, ctx),
    ]);

    const responseRes = await this.respond.run({ intent: intentRes.output, memories: memoryRes.output }, ctx);
    await this.recover({ intentRes, memoryRes, responseRes }, ctx);
    return responseRes.output;
  }

  private async recover(results, ctx) {
    if (results.responseRes?.output?.text) {
      this.recordKeeper.append({ role: 'assistant', content: results.responseRes.output.text, ts: Date.now() });
    }
    // TODO: emit logs/metrics, persist traces/errors
  }
}
```


## Harness Designs

### Intent Harness (iterative loop)

- Loops LLM calls until stop: blank text OR parsed `done` flag OR max iterations. Temperature near 0 for determinism.
- Output: structured intent (goal, slots/entities, requested tools, priority, done flag).
```ts
export class IntentHarness implements Harness<IntentInput, IntentOutput> {
  constructor(private llm: LLMCaller, private maxIters = 4) {}
  async run(input, ctx) {
    let intent = defaultIntent();
    for (let i = 0; i < this.maxIters; i++) {
      const res = await this.llm.call({ model: ctx.config.intentModel, messages: buildIntentPrompt(input, ctx), temperature: 0 });
      const parsed = parseIntent(res.text);
      intent = parsed ?? intent;
      if (!res.text.trim() || parsed?.done) break;
    }
    return { output: intent, done: true };
  }
}
```


### Memory Harness (stub)

- Returns empty memories but keeps shape for retrieval later.
```ts
export class MemoryHarness implements Harness<MemoryInput, MemoryOutput> {
  async run() { return { output: { memories: [] }, done: true }; }
}
```


### Response Harness (single call)

- One LLM call using conversation context + intent + memories; returns text + optional tool calls.
```ts
export class ResponseHarness implements Harness<ResponseInput, ResponseOutput> {
  constructor(private llm: LLMCaller) {}
  async run(input, ctx) {
    const res = await this.llm.call({ model: ctx.config.responseModel, messages: buildResponsePrompt(input, ctx) });
    return { output: { text: res.text, toolCalls: res.toolCalls ?? [] }, done: true };
  }
}
```


### Utility Harness (stub)

- Placeholder `run` returning no-op; future LLM-enabled tool glue.

## Prompt Helpers (small examples)

```ts
export function buildIntentPrompt(input: IntentInput, ctx: HarnessContext): ChatMessage[] {
  return [
    sys('Infer user intent, requested tools, and mark done when certain.'),
    ...ctx.conversation.recent(6).map(turnToMsg),
    user(input.message),
  ];
}

export function buildResponsePrompt(input: ResponseInput, ctx: HarnessContext): ChatMessage[] {
  return [
    sys('Respond concisely. If tool calls provided, describe or call them.'),
    sys(JSON.stringify({ intent: input.intent, memories: input.memories })),
    ...ctx.conversation.recent(4).map(turnToMsg),
  ];
}
```

## Config & Factories

- `config.ts`: per-harness model names, timeouts, iteration caps, max context window hints.
- Harness factory wires LLMCaller instances with appropriate model per harness (same underlying client allowed).
- Future: allow overrides via env (OpenRouter model names, timeouts).

## Error/Timeout Handling

- Orchestrator wraps harness calls with timeouts from config; collects `HarnessError` for Recover logging.
- Intent loop bounded by `maxIters` and blank/done checks to avoid infinite calls.
- Recover persists traces/errors; still returns best-effort response if Response succeeded.

## Relationships & Isolation

- Only Orchestrator talks to all harnesses; harnesses do not import each other.
- Harnesses depend solely on lib types + injected `LLMCaller` + `HarnessContext`.
- RecordKeeper is the single writer of conversation history; harnesses are read-only consumers.
- Utility harness remains isolated to avoid coupling until tools need LLM assistance.

## Testing Plan

- Orchestrator sequencing: Intent + Memory parallel; Response awaits; Recover appends assistant turn.
- Intent harness: stops on blank/done; respects max iterations (use fake LLMCaller script responses).
- RecordKeeper: ingestion normalizes roles/order; append adds turns; `recent(n)` slices correctly.

## Deliverables (implementation phase)

- New directories/files as mapped with TS implementations and stubs.
- Config scaffolding for models/timeouts; injectable LLMCaller instances.
- Minimal tests under `bernard/tests/agent/**` using node:test/tsx and fake LLMCaller fixtures.