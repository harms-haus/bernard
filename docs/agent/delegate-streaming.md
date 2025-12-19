# Delegate Streaming Architecture

Bernard uses a **Delegate Streaming** architecture to provide real-time, event-driven feedback for complex AI workflows. This system is built on native JavaScript async generators and provides a highly performant, low-complexity alternative to traditional state machines.

## Core Concepts

A **DelegateStream** is an async generator that yields standardized events (`AgentOutputItem`). These events can represent anything from raw text deltas to internal "tracing" events like tool calls or LLM prompt details.

Benefits:
- **Simplicity**: No external state management libraries required.
- **Latency**: Results are pushed to the client as soon as pieces are generated, rather than waiting for the entire turn to complete.
- **Transparency**: Allows developers (and users with trace enabled) to see exactly what the agent is doing in real-time.

## The "Awaiting" Antipattern

A common mistake when working with streaming generators is **awaiting the generator to finish** before yielding its items.

**❌ INCORRECT (Invalidates Streaming):**
```typescript
async function* mySlowGenerator(input) {
  const result = await someLongRunningProcess(input); // BLOCKS everything
  yield result;
}
```

If you await a process that returns a full result set, you have effectively created a non-streaming system. The client will see a long pause followed by a sudden burst of data, which degrades the user experience.

**✅ CORRECT (True Streaming):**
```typescript
async function* myHarness(input) {
  const stream = await llm.streamText(input);
  yield* stream; // Immediately forwards pieces as they arrive
}
```

### Why it's Beneficial

By yielding events as they occur:
1. **Perceived Performance**: The UI can show a "Thinking..." status or start typing the first word of a response while the rest is still being generated.
2. **Streaming Chaining**: One harness can start processing while another is still yielding, allowing for pipelined execution.
3. **Traceability**: If a tool call hangs, you see exactly *which* tool is hanging in real-time, rather than waiting for a timeout on the whole request.

## Implementation Guidelines

1. **Manual Forwarding**: When nesting generators, use manual loops to capture and possibly transform events.
   ```typescript
   for await (const event of nestedHarness(context)) {
     yield transform(event);
   }
   ```
2. **Avoid Buffering**: Do not collect yielded items into an array unless you absolutely must.
3. **Standardized Events**: Always use the `AgentOutputItem` union type to ensure compatibility across the system.
4. **Error Propagation**: Ensure that errors in the generator are caught and yielded as `error` events so the client can handle them gracefully without crashing the whole stream.
