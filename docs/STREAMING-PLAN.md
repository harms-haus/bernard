# Bernard Streaming Implementation Analysis

## Problem Statement

We need to figure out why the streaming isn't working end-to-end. This is what it should look like:

**Expected Flow:**
- User: prompt [recorded in recordKeeper]
- LLM: system prompt + user prompt + history (emitted whole, with context to the output stream) [recorded]
- router: LLM response -> tool call (no streaming, emitted whole to the output stream) [recorded]
- LLM: system prompt + user prompt + history (emitted whole, with context to the output stream) [recorded]
- router: LLM response -> tool call (emitted whole, with context to the output stream) [recorded]
- router: tool result (emitted whole to the output stream) [recorded]
- router: tool result (emitted whole to the output stream) [recorded]
- LLM: system prompt + user prompt + history (emitted whole, with context to the output stream) [recorded]
- router: LLM response -> respond() (NOT emitted to the output stream) [recorded]
- LLM: system prompt + user prompt + history (emitted whole, with context to the output stream) [recorded]
- Response: LLM response -> stream begins (stream is mirrored to the output stream) [recorded]

## Current Implementation Analysis

### What Works ✅

1. **User prompts are recorded** via `recordKeeper.appendMessages()` in orchestrator
2. **Tool calls are streamed** via `onStreamEvent()` in router harness:
   - Lines 506-511 in `router.harness.ts` emit `tool_call` events
   - Lines 609-618 in `router.harness.ts` emit `tool_response` events
3. **Tool responses are recorded** in record keeper via `recordToolResult()`
4. **Final response content is chunked** in API endpoint via `chunkContent()`

### What's Missing ❌

1. **LLM calls are NOT streamed to output**
   - All harnesses (`router`, `memory`, `respond`) use `stream: false`
   - LLM calls with full context are only recorded as system messages via `recordLLMCall()`
   - No real-time visibility into model's thinking process

2. **Response harness doesn't support streaming**
   - `ResponseHarness.run()` doesn't accept `onStreamEvent` parameter
   - Final response generation cannot be streamed to output stream

3. **API endpoint only streams final response**
   - `streamChatCompletion()` only chunks final content, not intermediate LLM calls
   - Users don't see step-by-step process

## Root Cause

The streaming issues stem from **three fundamental gaps**:

### 1. Missing LLM Call Streaming
**Problem**: The `LLMCaller.call()` method and all harnesses use `stream: false`
**Evidence**: 
- `router.harness.ts:862`: `stream: false`
- `respond.harness.ts:65`: No stream parameter
- `memory.harness.ts`: Similar pattern

**Impact**: LLM calls with full context (system prompt + user prompt + history) are not emitted to output stream in real-time

### 2. Response Harness Doesn't Support Streaming
**Problem**: `ResponseHarness.run()` doesn't accept `onStreamEvent` parameter
**Evidence**: Method signature at line 52 in `respond.harness.ts`
**Impact**: The final response generation cannot be streamed to output stream

### 3. Final Response Streaming is Chunked at API Level Only
**Problem**: The `streamChatCompletion()` function only chunks final response content
**Evidence**: Lines 375-378 in `route.ts` only stream `contentChunks`
**Impact**: Users don't see detailed step-by-step process, only final answer

## Required Fixes

To achieve the expected end-to-end streaming, the following changes are needed:

### 1. Enable LLM Streaming in All Harnesses
- Change `stream: false` to `stream: true` in all LLM calls
- Handle streaming responses and emit chunks via `onStreamEvent`
- Update `LLMCallConfig` and `LLMResponse` types to support streaming

### 2. Add Streaming Support to Response Harness
- Add `onStreamEvent` parameter to `ResponseHarness.run()`
- Stream LLM response chunks during final response generation
- Update `Harness` interface to require streaming support

### 3. Update API Endpoint to Stream LLM Calls
- Modify `streamChatCompletion()` to emit LLM context and responses to output stream
- Add new event types for LLM calls and context streaming
- Stream intermediate LLM calls, not just tool calls and final response

### 4. Update StreamEvent Types
- Add event types for:
  - `llm_call_start` with context
  - `llm_call_chunk` with partial responses
  - `llm_call_complete` with final response
  - `context_update` with full conversation context

## Implementation Priority

1. **High Priority**: Enable LLM streaming in router harness (most critical for user experience)
2. **Medium Priority**: Add streaming support to response harness
3. **Medium Priority**: Update API endpoint to stream LLM calls
4. **Low Priority**: Update memory harness streaming

## Files to Modify

1. `bernard/agent/harness/lib/types.ts` - Update streaming types
2. `bernard/agent/harness/router/router.harness.ts` - Enable LLM streaming
3. `bernard/agent/harness/respond/respond.harness.ts` - Add streaming support
4. `bernard/agent/harness/memory/memory.harness.ts` - Enable LLM streaming
5. `bernard/app/api/v1/chat/completions/route.ts` - Update streaming logic
6. `bernard/lib/agent.ts` - Update graph wrapper for streaming

## Testing Strategy

1. Test with streaming enabled in development
2. Verify all expected events are emitted to output stream
3. Check that recordKeeper captures all events correctly
4. Validate OpenAI-compatible streaming format

## Conclusion

The core issue is that the current implementation only streams tool interactions but misses the crucial LLM call streaming that would show the model's thinking process and context to users in real-time. This creates a disconnected experience where users only see tool calls/responses but not the underlying LLM reasoning.