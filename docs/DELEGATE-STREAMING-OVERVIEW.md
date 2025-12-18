DelegateStream Architecture: A Comprehensive Guide

10,000-Foot View: How DelegateStreams Work

The Core Concept
DelegateStreams represent a fundamental shift in how we handle streaming data in Bernard. Instead of relying on complex state machines and external libraries like LangGraph, we've adopted a unified streaming approach built on JavaScript's native async generators and Node.js streams.

The Big Picture
At its core, a DelegateStream is simply an async generator wrapped as a Node.js readable stream. This elegant design provides several key advantages:

Simplicity: No complex state management or external dependencies
Performance: Direct streaming without intermediate buffering
Flexibility: Can handle both structured events and raw text chunks
Compatibility: Works seamlessly with existing HTTP streaming infrastructure
The Streaming Paradigm
Traditional streaming systems often use a pull-based model where consumers request data from producers. DelegateStreams use a push-based model where the stream actively pushes data to consumers as it becomes available.

Traditional: Consumer → Requests → Producer → Returns Data
DelegateStream: Producer → Generates → Stream → Pushes → Consumer
Why This Matters
This approach enables real-time streaming of complex AI workflows where multiple phases (intent analysis, tool execution, response generation) can all be streamed simultaneously without blocking or buffering.

5,000-Foot View: How Our Harnesses Work with DelegateStreams
Harness Architecture Overview
Our harnesses (Intent, Memory, Response) have been redesigned to work seamlessly with the DelegateStream architecture. Each harness now acts as both a stream producer and a stream consumer.

The Harness Streaming Flow
1. Intent Harness Streaming
The Intent Harness is the most complex in terms of streaming behavior:

// Intent Harness Streaming Flow
User Input → LLM Call → Tool Detection → Tool Execution → Stream Events

// Key streaming points:
1. LLM Call Start → Emits "llm_call_start" event
2. LLM Response Chunks → Emits "llm_call_chunk" events  
3. Tool Call Detection → Emits "tool_call" events
4. Tool Execution → Emits "tool_result" events
5. LLM Call Complete → Emits "llm_call_complete" event
2. Memory Harness Streaming
The Memory Harness is simpler but still participates in the streaming:

// Memory Harness Streaming Flow
Query → Memory Search → Results → Stream Events

// Key streaming points:
1. Memory Search Start → Emits "status" event
2. Memory Results → Emits "context_update" events
3. Search Complete → Emits "status" event
3. Response Harness Streaming
The Response Harness handles the final response generation:

// Response Harness Streaming Flow
Context + Intent + Memory → LLM Call → Response Chunks → Stream Events

// Key streaming points:
1. Response Start → Emits "llm_call_start" event
2. Response Chunks → Emits "llm_call_chunk" events
3. Response Complete → Emits "llm_call_complete" event
Harness Coordination
The harnesses work together through the StreamingOrchestrator, which coordinates their execution and aggregates their streams:

// StreamingOrchestrator Flow
1. Initialize unified stream
2. Run Intent Harness → Collect events
3. Run Memory Harness → Collect events  
4. Run Response Harness → Collect events
5. Yield all events through unified stream
Event Forwarding
Each harness forwards events to the orchestrator through a callback mechanism:

// Event forwarding pattern
harness.run(input, context, (event) => {
  // Forward event to orchestrator
  orchestrator.forwardEvent(event);
});
1,000-Foot View: Direct Usage of the Tools
Core DelegateStream Functions
1. delegateStreamFromAsyncGenerator
This is the fundamental function that converts an async generator to a Node.js readable stream:

import { delegateStreamFromAsyncGenerator } from "@/agent/streaming/delegate-stream";

// Create an async generator
async function* myGenerator() {
  yield "Hello";
  yield " ";
  yield "World";
}

// Convert to readable stream
const stream = delegateStreamFromAsyncGenerator(myGenerator());

// Use with HTTP response
response.writeHead(200, {
  "Content-Type": "text/plain",
  "Transfer-Encoding": "chunked"
});
stream.pipe(response);
2. createUnifiedStream
This creates a stream that can handle both JSON events and raw text:

import { createUnifiedStream } from "@/agent/streaming/delegate-stream";

const { stream, addEvent, addText, complete } = createUnifiedStream();

// Add JSON events
addEvent({
  type: "status",
  status: "thinking",
  timestamp: Date.now()
});

// Add text chunks
addText("Hello ");
addText("World");

// Complete the stream
complete();

// Consume the stream
for await (const chunk of stream) {
  console.log(chunk); // "Hello ", "World", etc.
}
3. createStreamingOrchestrator
This creates a high-level orchestrator for managing complex streaming workflows:

import { createStreamingOrchestrator } from "@/agent/streaming/delegate-stream";

const orchestrator = createStreamingOrchestrator();

// Use the orchestrator methods
orchestrator.emitStatus("thinking", { phase: "intent" });
orchestrator.emitToolCall({ id: "call_123", name: "web_search", args: { query: "weather" } });
orchestrator.emitLLMCallChunk("The weather is", "response");
orchestrator.complete();

// Get the stream
const stream = orchestrator.stream;
StreamingOrchestrator Class
Basic Usage
import { StreamingOrchestrator } from "@/agent/streaming/streaming-orchestrator";

// Create orchestrator
const streamingOrchestrator = new StreamingOrchestrator(
  recordKeeper,
  harnessConfig,
  intentHarness,
  memoryHarness,
  respondHarness
);

// Run with streaming
const { stream, result } = await streamingOrchestrator.run({
  conversationId: "conv_123",
  incoming: [userMessage],
  persistable: [userMessage],
  requestId: "req_123",
  turnId: "turn_123"
});

// Consume the stream
for await (const chunk of stream) {
  const event = JSON.parse(chunk);
  console.log("Received event:", event);
}

// Get final result
const finalResult = await result;
Event Handling
// Stream consumption with event handling
const stream = streamingOrchestrator.run(input);

for await (const chunk of stream) {
  try {
    const event = JSON.parse(chunk);
    
    switch (event.type) {
      case "status":
        console.log(`Status: ${event.status}`);
        break;
      case "tool_call":
        console.log(`Tool call: ${event.toolCall.name}`);
        break;
      case "tool_result":
        console.log(`Tool result: ${JSON.stringify(event.toolResult.result)}`);
        break;
      case "llm_call_chunk":
        console.log(`LLM chunk: ${event.llmCallChunk.content}`);
        break;
      case "llm_call_complete":
        console.log(`LLM complete: ${event.llmCallComplete.response}`);
        break;
    }
  } catch {
    // Handle raw text chunks
    console.log(`Text chunk: ${chunk}`);
  }
}
Harness Integration
Intent Harness with Streaming
import { IntentHarness } from "@/agent/harness/intent/intent.harness";

const intentHarness = new IntentHarness(llm, tools, maxIterations);

// Run with streaming
const result = await intentHarness.run(
  { messageText: "What's the weather?" },
  context,
  (event) => {
    // Handle stream events
    console.log("Intent event:", event);
    
    // Forward to orchestrator
    orchestrator.forwardStreamEvent(event);
  }
);
Response Harness with Streaming
import { ResponseHarness } from "@/agent/harness/respond/respond.harness";

const responseHarness = new ResponseHarness(llm);

// Run with streaming
const result = await responseHarness.run(
  {
    intent: intentResult,
    memories: memoryResult,
    availableTools: tools,
    disabledTools: disabledTools
  },
  context,
  (event) => {
    // Handle stream events
    console.log("Response event:", event);
    
    // Forward to orchestrator
    orchestrator.forwardStreamEvent(event);
  }
);
API Route Integration
Streaming Route Implementation
import { StreamingOrchestrator } from "@/agent/streaming/streaming-orchestrator";
import { delegateStreamFromAsyncGenerator } from "@/agent/streaming/delegate-stream";

export async function POST(request: NextRequest) {
  // Parse request
  const body = await request.json();
  
  // Create streaming orchestrator
  const streamingOrchestrator = new StreamingOrchestrator(
    recordKeeper,
    harnessConfig,
    intentHarness,
    memoryHarness,
    respondHarness
  );
  
  // Run with streaming
  const { stream, result } = await streamingOrchestrator.run({
    conversationId: body.conversationId,
    incoming: messages,
    persistable: messages,
    requestId: requestId,
    turnId: turnId
  });
  
  // Convert to readable stream
  const readableStream = delegateStreamFromAsyncGenerator(stream);
  
  // Return streaming response
  return new NextResponse(readableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}
Event Processing Patterns
Client-Side Event Handling
// Client-side stream consumption
const response = await fetch("/api/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Hello" }],
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      
      try {
        const event = JSON.parse(data);
        
        switch (event.type) {
          case "status":
            updateStatus(event.status);
            break;
          case "tool_call":
            showToolCall(event.toolCall);
            break;
          case "tool_result":
            showToolResult(event.toolResult);
            break;
          case "llm_call_chunk":
            appendText(event.llmCallChunk.content);
            break;
        }
      } catch (error) {
        console.error("Failed to parse event:", error);
      }
    }
  }
}
Server-Side Event Aggregation
// Server-side event aggregation
function aggregateStreamEvents(stream) {
  const events = [];
  const textChunks = [];
  
  return {
    async *[Symbol.asyncIterator]() {
      for await (const chunk of stream) {
        try {
          const event = JSON.parse(chunk);
          events.push(event);
          yield { type: 'event', data: event };
        } catch {
          textChunks.push(chunk);
          yield { type: 'text', data: chunk };
        }
      }
    },
    getEvents() { return events; },
    getText() { return textChunks.join(''); }
  };
}
Error Handling and Recovery
Stream Error Handling
// Stream error handling
try {
  const { stream, result } = await streamingOrchestrator.run(input);
  
  for await (const chunk of stream) {
    try {
      const event = JSON.parse(chunk);
      handleEvent(event);
    } catch (error) {
      console.error("Failed to parse chunk:", error);
      // Continue processing other chunks
    }
  }
  
  const finalResult = await result;
  console.log("Final result:", finalResult);
} catch (error) {
  console.error("Stream failed:", error);
  // Handle error appropriately
}
Graceful Degradation
// Graceful degradation for non-streaming clients
export async function POST(request: NextRequest) {
  const body = await request.json();
  
  if (!body.stream) {
    // Non-streaming path
    const streamingOrchestrator = new StreamingOrchestrator(/* ... */);
    const { result } = await streamingOrchestrator.run(input);
    const finalResult = await result;
    
    return NextResponse.json(finalResult);
  }
  
  // Streaming path
  // ... existing streaming logic
}
Performance Optimization
Chunk Size Management
// Optimize chunk sizes for different content types
function optimizeChunks(content: string, contentType: 'text' | 'json' | 'event') {
  switch (contentType) {
    case 'text':
      return chunkContent(content, 8); // Small chunks for text
    case 'json':
      return [JSON.stringify(content)]; // Single chunk for JSON
    case 'event':
      return [JSON.stringify(content) + '\n']; // Line-delimited events
  }
}
Memory Management
// Memory-efficient stream processing
function processStreamInBatches(stream, batchSize = 100) {
  let batch = [];
  
  return {
    async *[Symbol.asyncIterator]() {
      for await (const chunk of stream) {
        batch.push(chunk);
        
        if (batch.length >= batchSize) {
          yield batch;
          batch = [];
        }
      }
      
      if (batch.length > 0) {
        yield batch;
      }
    }
  };
}
This comprehensive guide covers the DelegateStream architecture from high-level concepts down to practical implementation details, providing a complete reference for understanding and working with our new streaming system.