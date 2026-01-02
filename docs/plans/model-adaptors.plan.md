# Model Adaptor System Plan

## Overview

Design a model adaptor system for Bernard that adapts specific LLM models to work alongside the LLM caller infrastructure. Model adaptors handle model-specific formatting requirements that differ from standard OpenAI-compatible APIs.

**Key distinction:**
- **LLM Caller**: HOW to make the API call (OpenAI client, OpenRouter, Ollama, etc.)
- **Model Adaptor**: WHAT formatting the specific model requires (Mistral's 9-char tool call IDs, etc.)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    LLM Usage Context                         │
│  (routing.agent.ts, response.agent.ts, server.ts)           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    createLLMCaller()                        │
│                    (factory.ts)                             │
│  Creates LLM caller: ChatOpenAILLMCaller, ChatOllama, etc.  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                Model Adaptor Pipeline                       │
│  (NEW - intercepts before/after LLM call)                   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Input: messages, config, tools                      │   │
│  │                                                      │   │
│  │  1. Find applicable adaptors by MODEL NAME           │   │
│  │     (not provider type - Mistral is a model!)        │   │
│  │                                                      │   │
│  │  2. Chain adaptors: adapt() → adapt() → base call    │   │
│  │                                                      │   │
│  │  3. Response: adaptBack() ← adaptBack() ←            │   │
│  │                                                      │   │
│  │  Output: adapted response                            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Interfaces

### Location: `services/bernard/src/agent/llm/adapters/`

### 1. Adapter Interface

```typescript
interface ModelAdapter {
  /** Human-readable name */
  name: string;
  
  /** Check if this adapter applies to the given model */
  appliesTo(modelName: string): boolean;
  
  /** Adapt LLM call info before sending to caller */
  adapt(callInfo: {
    messages: BaseMessage[];
    config: LLMConfig;
    tools?: StructuredToolInterface[];
  }): {
    messages: BaseMessage[];
    config: LLMConfig;
    tools?: StructuredToolInterface[];
  };
  
  /** Adapt response back after receiving from caller */
  adaptBack(response: LLMResponse | AIMessage): LLMResponse | AIMessage;
}
```

### 2. Registry Pattern

```typescript
class AdapterRegistry {
  /** Register an adapter (called at module load time) */
  register(adapter: ModelAdapter): void;
  
  /** Find all adapters for a given model name */
  findFor(modelName: string): ModelAdapter[];
  
  /** Get all registered adapters */
  all(): ModelAdapter[];
}
```

### 3. Integration with LLMCaller

The `LLMCaller` interface gains optional adapter support:

```typescript
interface LLMCaller {
  complete(messages: BaseMessage[], config: LLMConfig): Promise<LLMResponse>;
  streamText(messages: BaseMessage[], config: LLMConfig): AsyncIterable<string>;
  completeWithTools(
    messages: BaseMessage[], 
    config: LLMConfig, 
    tools?: StructuredToolInterface[]
  ): Promise<AIMessage>;
  
  // NEW: Adapter support
  withAdapters(adapters: ModelAdapter[]): this;
}
```

---

## Mistral Adapter (First Implementation)

### Purpose
Mistral models require tool call IDs to be 9 characters or fewer. The adapter compresses long IDs before sending, then re-inflates them in the response.

### ID Mapping Strategy

**Compression:**
- Generate 9-char alphanumeric ID from original ID using hash
- Maintain bi-directional map: `original ↔ compressed`

**Example:**
```
Original:  "call_abc123def456ghi789"  (24 chars)
Compressed: "ABC123XYZ"               (9 chars)
```

### Implementation

```typescript
class MistralAdapter implements ModelAdapter {
  name = "mistral";
  
  appliesTo(modelName: string): boolean {
    return modelName.toLowerCase().includes("mistral");
  }
  
  adapt(callInfo): { messages, config, tools } {
    // Map tool call IDs to 9-char versions
    // Store mapping for re-inflation
    return { messages: adaptedMessages, config, tools };
  }
  
  adaptBack(response): LLMResponse | AIMessage {
    // Re-inflate compressed IDs back to originals
    return adaptedResponse;
  }
}
```

---

## Directory Structure

```
services/bernard/src/agent/llm/
├── adapters/
│   ├── index.ts              # Exports, registry
│   ├── adapter.interface.ts  # Core interfaces
│   ├── registry.ts           # AdapterRegistry implementation
│   ├── mistral.adapter.ts    # Mistral-specific adapter
│   └── tests/
│       ├── mistral.adapter.test.ts
│       └── registry.test.ts
├── factory.ts                # Updated to apply adapters
├── llm.ts                    # LLMCaller interface
├── chatOpenAI.ts
├── chatOllama.ts
└── ...
```

---

## Factory Integration

```typescript
function createLLMCaller(provider: Provider, model: string): LLMCaller {
  // 1. Create base caller
  const caller = createBaseCaller(provider, model);
  
  // 2. Find applicable adapters for this model
  const adapters = adapterRegistry.findFor(model);
  
  // 3. Wrap with adapters if any apply
  if (adapters.length > 0) {
    return caller.withAdapters(adapters);
  }
  
  return caller;
}
```

---

## Adding New Adapters

To add support for a new model with special requirements:

1. Create `newmodel.adapter.ts` in `adapters/`
2. Implement `ModelAdapter` interface
3. Register in `adapters/index.ts`:
   ```typescript
   import { adapterRegistry } from "./registry";
   import { NewModelAdapter } from "./newmodel.adapter";
   
   // Auto-register on import
   adapterRegistry.register(new NewModelAdapter());
   ```

**Example: Claude with 100KB context window optimization**
```typescript
class ClaudeAdapter implements ModelAdapter {
  name = "claude";
  appliesTo(model) = model.includes("claude");
  
  adapt({ messages, config }) {
    // Maybe truncate very long tool call arguments for Claude
    return { messages, config };
  }
}
```

---

## Testing Strategy

1. **Unit Tests** for each adapter:
   - ID compression/decompression correctness
   - Bi-directional mapping integrity
   - Edge cases (empty IDs, Unicode, etc.)

2. **Integration Tests**:
   - End-to-end with Mistral via OpenRouter
   - Verify tool calls execute correctly with adapted IDs

---

## Files to Create/Modify

### New Files
- `services/bernard/src/agent/llm/adapters/adapter.interface.ts`
- `services/bernard/src/agent/llm/adapters/registry.ts`
- `services/bernard/src/agent/llm/adapters/mistral.adapter.ts`
- `services/bernard/src/agent/llm/adapters/index.ts`
- `services/bernard/src/agent/llm/adapters/tests/mistral.adapter.test.ts`

### Modified Files
- `services/bernard/src/agent/llm/factory.ts` - Apply adapters
- `services/bernard/src/agent/llm/llm.ts` - Add adapter support to interface

---

## Success Criteria

- [ ] Adapters register themselves automatically on import
- [ ] `createLLMCaller()` automatically wraps with applicable adapters
- [ ] Mistral adapter correctly compresses 9-char IDs and re-inflates
- [ ] All existing tests pass (no regression)
- [ ] New adapter can be added by creating one file and importing it
