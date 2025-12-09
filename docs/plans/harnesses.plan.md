# Harness Architecture Plan (replacement-focused)

## Objectives

- Replace Bernard’s current intent gathering and response inner workings with harness-based modules.
- Relocate intent-only tools and intent system prompt into the intent harness directory.
- Relocate BernardSystemPrompt (response system prompt) into the response harness directory.
- Centralize model selection/config in the orchestrator; harnesses receive preconfigured LLM callers.
- Preserve phase flow: Ingest → Gather (Intent + Memory) → Respond → Recover; Memory/Utility stay stubs for now.

## Replacement & Migration Scope

- Intent: retire existing intent gathering code; move its logic/tools/prompts into `agent/harness/intent/`.
- Response: retire existing response generation code; move BernardSystemPrompt and response logic into `agent/harness/respond/`.
- Model selection: refactor any model-choice logic from existing code into orchestrator config/factories.
- RecordKeeper: refactor to fit within the new harness framework. Reuse what you can, but none of it is sacred as long as it still keeps an accurate representation of what happened and gathers statistics as it currently does.
- Ensure orchestrator now invokes harnesses instead of legacy flow; legacy entry points become thin wrappers or are removed.

## Directory & File Map

- `bernard/agent/orchestrator/`
  - `orchestrator.ts` – main loop using new harnesses
  - `config.ts` – model names, timeouts, limits; model selection moved here
  - `factory.ts` – wire harness instances with LLM callers
- `bernard/agent/record-keeper/`
  - `record-keeper.ts`, `types.ts` – conversation normalization/append
- `bernard/agent/harness/lib/`
  - `types.ts`, `prompts.ts`, `errors.ts` – shared contracts/helpers
- `bernard/agent/harness/intent/`
  - `intent.harness.ts` – iterative intent harness (replacing old intent code)
  - `prompts.ts` – intent system prompt (moved)
  - `tools/` – intent-only tools (moved here)
- `bernard/agent/harness/memory/`
  - `memory.harness.ts` – stub
- `bernard/agent/harness/respond/`
  - `respond.harness.ts` – response harness (replacing old response code)
  - `prompts.ts` – BernardSystemPrompt moved here
- `bernard/agent/harness/utility/`
  - `utility.harness.ts` – stub
- Tests: `bernard/tests/agent/**`

## Core Contracts (LLM + Harness base)

```ts
// bernard/agent/harness/lib/types.ts
export interface LLMCallConfig { model: string; messages: ChatMessage[]; temperature?: number; maxTokens?: number; stream?: boolean; }
export interface LLMCaller { call(input: LLMCallConfig): Promise<LLMResponse>; }
export interface HarnessContext { conversation: ConversationThread; config: HarnessConfig; now: () => Date; }
export interface Harness<TIn, TOut> { run(input: TIn, ctx: HarnessContext): Promise<HarnessResult<TOut>>; }
export interface HarnessResult<T> { output: T; done: boolean; trace?: HarnessTrace; error?: HarnessError; }
```

## Orchestrator (model selection here)

- Holds config for per-phase model names/timeouts; builds/injects LLMCaller instances.
- Flow: Ingest (RecordKeeper.ingest) → Gather (Intent + Memory in parallel) → Respond (single call) → Recover (append/log).
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
}
```


## Intent Harness (replaces old intent code)

- Iterative LLM loop; stop on blank/done/max iterations. Uses intent system prompt from `intent/prompts.ts`. Intent-only tools live in `intent/tools/`.
```ts
// bernard/agent/harness/intent/intent.harness.ts
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


## Response Harness (replaces old response code)

- Single LLM call using BernardSystemPrompt from `respond/prompts.ts`; uses intent + memories.
```ts
// bernard/agent/harness/respond/respond.harness.ts
export class ResponseHarness implements Harness<ResponseInput, ResponseOutput> {
  constructor(private llm: LLMCaller) {}
  async run(input, ctx) {
    const res = await this.llm.call({ model: ctx.config.responseModel, messages: buildResponsePrompt(input, ctx) });
    return { output: { text: res.text, toolCalls: res.toolCalls ?? [] }, done: true };
  }
}
```


## Memory Harness (stub)

```ts
export class MemoryHarness implements Harness<MemoryInput, MemoryOutput> {
  async run() { return { output: { memories: [] }, done: true }; }
}
```

## Utility Harness (stub)

- Placeholder for future LLM-assisted tools; no-op `run` for now.

## Prompt Helpers & Placement

- `intent/prompts.ts`: intent system prompt + builders; imports intent tools as needed.
- `respond/prompts.ts`: BernardSystemPrompt + response prompt builder.
- Shared small helpers in `harness/lib/prompts.ts` if generic (e.g., turn-to-message mapping), otherwise keep domain-local.

## Relationships & Isolation

- Only orchestrator coordinates harnesses; harnesses don’t import each other.
- RecordKeeper is the single writer of conversation history; harnesses read snapshots.
- Model selection/config lives in orchestrator config/factory; harnesses receive LLMCaller already bound to proper model.
- Intent-only tools co-located in `intent/tools/` to keep domain boundaries clear.

## Migration Notes

- Remove/replace legacy intent gathering and response entry points with harness invocations through orchestrator.
- Move existing intent tools and prompts into `intent/` and update imports.
- Move BernardSystemPrompt into `respond/prompts.ts` and update imports.
- Extract any model-choice logic from legacy code into `orchestrator/config.ts` and factories wiring LLMCaller.

## Testing Plan

- Orchestrator sequencing: Intent + Memory parallel; Response awaits; Recover appends assistant turn.
- Intent harness: stops on blank/done; respects max iterations (fake LLMCaller).
- RecordKeeper: ingestion normalization; append; recent(n) slicing.

## Deliverables (implementation phase)

- New structure with TS implementations/stubs and relocated prompts/tools.
- Orchestrator config handling model selection; harnesses use injected callers.
- Minimal tests under `bernard/tests/agent/**` with fake LLMCaller fixtures.