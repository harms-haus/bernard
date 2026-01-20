# Thinking Indicator Implementation Plan

**Created:** 2026-01-20
**Status:** Revised - Ready for Implementation
**Estimated Effort:** 1 hour (reduced from 1-2 hours)
**Owner:** Bernard AI Agent

---

## Overview

Implement custom progress messages and a thinking indicator for the Bernard AI agent using LangGraph's custom streaming capabilities. This will show users visual feedback during long-running tool operations while maintaining the constraint that final output is plain text for TTS (no markdown/emojis).

**Key Change**: Use the EXISTING `ProgressIndicator` component instead of creating a new `ThinkingIndicator` component. This reduces implementation from ~81 lines to ~32 lines.

---

## Background

### Current State

Bernard already has foundational progress infrastructure:

```typescript
// core/src/agents/bernard/utils.ts
export function createProgressReporter(config: LangGraphRunnableConfig, toolName: string) {
  return {
    report: (message: string) =>
      config['writer']?.({
        _type: "tool_progress",
        tool: toolName,
        phase: "step",
        message,
      }),
    reset: () =>
      config['writer']?.({
        _type: "tool_progress",
        tool: toolName,
        phase: "complete",
        message: "Done",
      }),
  };
}
```

### What's Missing

1. **Custom stream mode not enabled** in the streaming endpoint
2. **No UI component** for displaying the thinking indicator
3. **Frontend doesn't capture** `tool_progress` custom events yet

---

## Architecture

### Event Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER REQUEST                                 │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│  Next.js API (/api/bernard/stream)                              │
│  client.runs.stream(..., streamMode: ['messages', 'updates', 'custom']) │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│  Bernard Agent (Port 2024)                                      │
│                                                                  │
│  Tool function:                                                 │
│  progress.report("Searching...");                               │
│  config.writer({ _type: "tool_progress", message: "..." });     │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│  SSE Stream                                                     │
│  { type: "custom", data: { _type: "tool_progress", ... } }      │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│  Frontend StreamProvider                                        │
│  onCustomEvent() → mutate({ latestProgress: {...} })           │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│  React State Update                                             │
│  ProgressIndicator component re-renders                         │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│  UI Display                                                     │
│  ┌─────────────────────────────────────────┐                    │
│  │ ● ● ● Searching for results...           │                    │
│  └─────────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

### Progress Message Types

| Phase | When to Use | Example |
|-------|-------------|---------|
| `step` | During long operations | "Searching...", "Processing item 5/10..." |
| `complete` | When tool finishes | "Done" (auto-reset) |

---

## Implementation Details

### Step 1: Enable Custom Stream Mode

**File:** `core/src/app/api/bernard/stream/route.ts`

```typescript
const runStream = client.runs.stream(
  threadId,
  'bernard_agent',
  {
    input: { messages, userRole },
    streamMode: ['messages', 'updates', 'custom'] as const,  // ADD 'custom'
    multitaskStrategy: 'interrupt',
  }
);
```

**Lines to change:** ~1

---

### Step 2: Enhance Progress Reporter with Timestamp

**File:** `core/src/agents/bernard/utils.ts`

```typescript
export type ProgressReporter = {
  report: (message: string) => void;
  reset: () => void;
};

export function createProgressReporter(config: LangGraphRunnableConfig, toolName: string): ProgressReporter {
  return {
    report: (message: string) =>
      config['writer']?.({
        _type: "tool_progress",
        tool: toolName,
        phase: "step",
        message,
        timestamp: Date.now(),  // ADD for ordering
      }),
    reset: () =>
      config['writer']?.({
        _type: "tool_progress",
        tool: toolName,
        phase: "complete",
        message: "Done",
      }),
  };
}
```

**Lines to change:** ~5

---

### Step 3: Update StreamProvider with Custom Events

**File:** `core/src/providers/StreamProvider.tsx`

```typescript
import { useStream } from "@langchain/langgraph-sdk/react";

export interface ToolProgressEvent {
  type: "progress" | "step" | "complete" | "error";
  tool: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

interface StreamProviderProps {
  children: ReactNode;
  apiUrl: string;
  assistantId: string;
  threadId?: string | null;
}

export function StreamProvider({ children, apiUrl, assistantId, threadId }: StreamProviderProps) {
  const streamValue = useStream<StateType, {
    UpdateType: {
      messages?: Message[] | Message | string;
      ui?: (UIMessage | RemoveUIMessage)[] | UIMessage | RemoveUIMessage;
    };
    CustomEventType: UIMessage | RemoveUIMessage;
  }>({
    apiUrl,
    assistantId,
    threadId: threadId ?? null,
    onCustomEvent: (event, options) => {
      // Handle tool_progress events
      if ('_type' in event && event._type === "tool_progress") {
        const progressEvent: ToolProgressEvent = {
          type: event.phase === "complete" ? "complete" : "progress",
          tool: event.tool,
          message: event.message,
          timestamp: event.timestamp,
        };
        options.mutate((prev) => ({
          ...prev,
          latestProgress: progressEvent,
        }));
        return;
      }
      // Handle UI messages
      options.mutate((prev) => {
        const ui = uiMessageReducer(prev.ui ?? [], event);
        return { ...prev, ui };
      });
    },
  });

  return (
    <StreamContext.Provider value={streamValue as StreamContextType & { latestProgress: ToolProgressEvent | null }}>
      {children}
    </StreamContext.Provider>
  );
}
```

**Lines to change:** ~20

---

### Step 4: Use Existing ProgressIndicator Component

**File:** `core/src/components/chat/ChatMessages.tsx`

The existing `ProgressIndicator` component at `core/src/components/chat/messages/progress.tsx` already:
- Uses `useStreamContext()` to access `stream.latestProgress`
- Displays progress messages with pulsing indicator animation
- Resets when loading completes

**Only need to ensure proper integration:**

```typescript
export function ChatMessages() {
  const { messages, isLoading } = useStreamContext();

  return (
    <div className="flex flex-col gap-4">
      {/* Regular messages */}
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {/* Progress indicator - already implemented, just needs integration */}
      <ProgressIndicator />
    </div>
  );
}
```

**Lines to change:** ~5 (ensure ProgressIndicator is imported and used)

---

### Step 5: Add Progress Indicator to Chat Messages

**File:** `core/src/components/chat/messages/index.ts`

Ensure the ProgressIndicator is exported from the messages module:

```typescript
export { ProgressIndicator } from "./progress";
```

**Lines to change:** ~1

---

## Files Summary

| File | Action | Lines |
|------|--------|-------|
| `core/src/app/api/bernard/stream/route.ts` | Add `'custom'` to streamMode | 1 |
| `core/src/agents/bernard/utils.ts` | Add ToolProgressEvent type | 5 |
| `core/src/providers/StreamProvider.tsx` | Export ToolProgressEvent & add latestProgress | 20 |
| `core/src/components/chat/messages/progress.tsx` | **Already exists** - verify integration | 0 |
| `core/src/components/chat/messages/index.ts` | Export ProgressIndicator | 1 |
| `core/src/components/chat/ChatMessages.tsx` | Integrate ProgressIndicator | 5 |
| **Total** | | **~32 lines** |

---

## Constraints Verification

| Constraint | Status | Notes |
|------------|--------|-------|
| No markdown/emojis in output | ✅ | Progress messages are visual-only in UI |
| Plain text for TTS | ✅ | Final responses unchanged |
| No cross-service imports | ✅ | Uses existing patterns only |
| Result types | ✅ | Existing patterns maintained |
| TypeScript strict mode | ✅ | All types properly defined |
| Reuse existing components | ✅ | Uses `ProgressIndicator` instead of creating new |

---

## Research Sources

### Official Documentation
- [LangGraph Streaming Guide](https://docs.langchain.com/oss/python/langgraph/streaming)
- [LangGraph JS Streaming](https://langchain-ai.github.io/langgraphjs/how-tos/stream-updates/)
- [Thinking in LangGraph](https://docs.langchain.com/oss/python/langgraph/thinking-in-langgraph)

### GitHub Examples
- [Bernard Agent Implementation](../core/src/agents/bernard/)
- [LangGraph Custom Streaming Examples](https://github.com/langchain-ai/langgraphjs/tree/main/examples/ui-react/src/examples/custom-streaming/)
- [ProgressCard Component](https://github.com/langchain-ai/langgraphjs/blob/main/examples/ui-react/src/examples/custom-streaming/components/ProgressCard.tsx)

### Community Resources
- [GitHub Discussion: Progress Indicators](https://github.com/langchain-ai/langgraph/discussions/4071)
- [Stack Overflow: Custom Events](https://stackoverflow.com/questions/79179756/how-to-custom-stream-events-in-langgraph)
- [LangChain Forum: Progress Streaming](https://forum.langchain.com/t/streaming-llm-generated-updates-of-progress/224)

---

## UI Mockup

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  User: What's the weather in San Francisco?                     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ ● ● ● Getting weather data for San Francisco...        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                         │    │
│  │  The current weather in San Francisco:                  │    │
│  │                                                         │    │
│  │  - Temperature: 68°F (20°C)                             │    │
│  │  - Conditions: Partly cloudy                            │    │
│  │  - Humidity: 72%                                        │    │
│  │  - Wind: 12 mph from the WNW                           │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Note**: Uses existing `ProgressIndicator` component with pulsing dots animation, consistent with codebase design language.

---

## Testing Plan

### Unit Tests
1. ✅ Progress reporter emits correct structure (already tested)
2. StreamProvider correctly captures custom events
3. ✅ ProgressIndicator renders with correct props (already tested)
4. ✅ ProgressIndicator hides when no progress (already tested)

### Integration Tests
1. End-to-end stream with progress messages
2. Multiple progress messages during single tool execution
3. Progress clears after tool completion
4. Concurrent progress updates from multiple tools

### Manual Tests
1. Trigger web search tool and verify progress indicator appears
2. Trigger media search tool and verify multi-step progress
3. Verify no progress messages in final TTS output
4. Test reconnection behavior on stream interruption

---

## Rollout Strategy

### Phase 1: Backend Only
1. Enable custom stream mode in API route
2. Verify progress reporter utility is correctly emitting events
3. Test with existing tools that already use progress reporter (web-search, etc.)

### Phase 2: Frontend Foundation
1. Update StreamProvider to capture custom events and expose `latestProgress`
2. Add `ToolProgressEvent` type export
3. Verify custom events are being received

### Phase 3: UI Integration
1. ✅ ProgressIndicator component already exists at `core/src/components/chat/messages/progress.tsx`
2. Export ProgressIndicator from messages module
3. Integrate into ChatMessages component
4. Test with real tool executions

### Phase 4: Polish
1. ✅ Animations and transitions already implemented via Framer Motion
2. Test with all existing tools
3. Verify accessibility (screen readers, keyboard nav)
4. Performance testing with rapid progress updates

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Progress messages slow down streaming | Medium | Use efficient serialization, batch updates if needed |
| Memory leaks from accumulated progress | Low | Clear progress on completion, use weak references |
| Missing writer in config | Low | Use optional chaining `config['writer']?.()` |
| Type errors in StreamProvider | Medium | Add proper TypeScript types as specified |

---

## Success Criteria

- [ ] Custom stream mode enabled and working
- [ ] Progress events captured in StreamProvider
- [ ] ProgressIndicator component renders during tool execution
- [ ] Progress clears when tool completes
- [ ] No regressions in existing functionality
- [ ] TypeScript compilation passes without errors
- [ ] All existing tests pass

---

## References

### Internal
- [Bernard Agent Source Code](../core/src/agents/bernard/)
- [Streaming Route](../core/src/app/api/bernard/stream/route.ts)
- [Progress Reporter Utility](../core/src/agents/bernard/utils.ts)
- [StreamProvider Implementation](../core/src/providers/StreamProvider.tsx)

### External
- [LangGraph SDK React](https://github.com/langchain-ai/langgraphjs/tree/main/libs/sdk-react)
- [LangGraph Streaming Concepts](https://langchain-ai.github.io/langgraph/concepts/streaming/)
- [AG-UI Protocol](https://github.com/ag-ui-protocol/ag-ui)

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-20 | Bernard AI | Initial plan |
| 1.1 | 2026-01-20 | Bernard AI | Use existing `ProgressIndicator` component instead of creating new `ThinkingIndicator`; reduced implementation from ~81 lines to ~32 lines |

---

**Plan Status:** Ready for Implementation (Revised)
**Key Change:** Reuses existing `ProgressIndicator` component at `core/src/components/chat/messages/progress.tsx` instead of creating a new `ThinkingIndicator` component.
