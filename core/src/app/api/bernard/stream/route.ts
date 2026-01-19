import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@langchain/langgraph-sdk';

const LANGGRAPH_API_URL = process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:2024';

const client = new Client({
  apiUrl: LANGGRAPH_API_URL,
});

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { threadId, messages } = body as {
      threadId: string;
      messages: Array<{ role: string; content: string }>;
    };

    if (!threadId) {
      return NextResponse.json(
        { error: 'threadId is required' },
        { status: 400 }
      );
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'messages is required and must be a non-empty array' },
        { status: 400 }
      );
    }

    // Check thread status - if it has a pending run, use interrupt strategy
    let thread = await client.threads.get(threadId);
      if (thread.status === 'busy') {
        // Thread has a running task - use interrupt strategy to allow concurrent execution
        const runStream = client.runs.stream(
          threadId,
          'bernard_agent',
          {
            input: { messages },
            streamMode: ['messages', 'updates'] as const,
            multitaskStrategy: 'interrupt',
          }
        );

        return createStreamResponse(runStream);
      }

      // Check for any pending runs on this thread
      const runs = await client.runs.list(threadId);
      const pendingRun = runs.find(r => r.status === 'pending' || r.status === 'running');
      if (pendingRun) {
        // There's a pending run - use interrupt strategy
        const runStream = client.runs.stream(
          threadId,
          'bernard_agent',
          {
            input: { messages },
            streamMode: ['messages', 'updates'] as const,
            multitaskStrategy: 'interrupt',
          }
        );

      return createStreamResponse(runStream);
    }

    // Thread is idle - proceed normally
    const runStream = client.runs.stream(
      threadId,
      'bernard_agent',
      {
        input: { messages },
        // Use both 'messages' (AI content) and 'updates' (tool calls/results)
        streamMode: ['messages', 'updates'] as const,
      }
    );

    return createStreamResponse(runStream);
  } catch (error) {
    console.error('Stream API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: (error as Error).message },
      { status: 500 }
    );
  }
}

function createStreamResponse(runStream: AsyncIterable<Record<string, unknown>>) {
  const encoder = new TextEncoder();
  let messageCount = 0;

  const responseStream = new ReadableStream({
    async start(controller) {
      let doneSent = false;
      try {
        for await (const chunk of runStream) {
          const chunkAny = chunk as Record<string, unknown>;
          const eventType = String(chunkAny.event || '');

          // Debug: log all events
          console.log(`[stream] Event: ${eventType}`, chunkAny.data ? JSON.stringify(chunkAny.data).slice(0, 200) : 'no data');

          // Handle messages/partial events (token streaming)
          // Note: We skip 'messages/complete' because LangGraph can emit multiple
          // complete events with different IDs for the same message
          if (eventType === 'messages/partial') {
            const data = chunkAny.data as unknown[];
            if (Array.isArray(data)) {
              for (const msg of data) {
                const msgObj = msg as Record<string, unknown>;
                const msgType = String(msgObj?.type || '');

                // Process only AI messages (tool calls are in additional_kwargs)
                if (msgType === 'ai' && msgObj?.id) {
                  // Extract content - handle both string and array formats
                  let content = '';
                  if (msgObj.content) {
                    content = Array.isArray(msgObj.content)
                      ? msgObj.content.map((c: Record<string, unknown>) => {
                          if (typeof c === 'string') return c;
                          return (c as Record<string, unknown>).text || (c as Record<string, unknown>).content || '';
                        }).join('')
                      : String(msgObj.content);
                  }

                  // Extract tool_calls from additional_kwargs (where LangGraph puts them)
                  const additionalKwargs = msgObj.additional_kwargs as Record<string, unknown> | undefined;
                  const toolCallsRaw = additionalKwargs?.tool_calls;
                  // Transform to the format expected by ToolCalls component
                  // This format: { id, name, args } not { id, type, function: {name, arguments} }
                  const toolCalls = toolCallsRaw && Array.isArray(toolCallsRaw)
                    ? (toolCallsRaw as Array<{
                        id: string;
                        function?: { name: string; arguments: string };
                      }>).map(tc => {
                        let args = {};
                        if (tc.function?.arguments) {
                          try {
                            args = JSON.parse(tc.function.arguments);
                          } catch {
                            // Keep as empty object if parse fails
                          }
                        }
                        return {
                          id: tc.id,
                          name: tc.function?.name || 'unknown',
                          args,
                        };
                      })
                    : [];

                  // Skip only if BOTH content AND tool_calls are empty
                  if (!content && toolCalls.length === 0) continue;

                  // Build output message
                  const outMsg: Record<string, unknown> = {
                    type: msgType,
                    id: msgObj.id,
                  };

                  // Add content if present
                  if (content) {
                    outMsg.content = content;
                  }

                  // Add tool_calls if present
                  if (toolCalls.length > 0) {
                    outMsg.tool_calls = toolCalls;
                  }

                  messageCount++;
                  const sseData = JSON.stringify({
                    event: 'messages/partial',
                    data: [outMsg],
                  });
                  controller.enqueue(encoder.encode(`event: messages/partial\ndata: ${sseData}\n\n`));
                }
              }
            }
          }

          // Handle updates events (tool calls, tool results, etc.)
          if (eventType === 'updates') {
            const data = chunkAny.data as { chunk?: Record<string, unknown> } | undefined;
            if (data?.chunk) {
              const chunk = data.chunk;

              // Check for tool results - they come in chunk.tools.messages
              const toolsData = chunk.tools as Record<string, unknown> | undefined;
              if (toolsData?.messages && Array.isArray(toolsData.messages)) {
                for (const msg of toolsData.messages) {
                  const msgObj = msg as Record<string, unknown>;
                  // Tool results have status: "success" or "error"
                  if (msgObj?.status && msgObj?.id) {
                    const content = msgObj.content
                      ? (Array.isArray(msgObj.content)
                          ? msgObj.content.map((c: Record<string, unknown>) => {
                              if (typeof c === 'string') return c;
                              return (c as Record<string, unknown>).text || (c as Record<string, unknown>).content || '';
                            }).join('')
                          : String(msgObj.content))
                      : '';

                    const toolResult = {
                      type: 'tool',
                      id: msgObj.id as string,
                      content,
                      status: msgObj.status,
                      tool_call_id: (msgObj.tool_call_id as string) || '',
                    };

                    const sseData = JSON.stringify({
                      event: 'tool_result',
                      data: [toolResult],
                    });
                    controller.enqueue(encoder.encode(`event: tool_result\ndata: ${sseData}\n\n`));
                  }
                }
              }
            }
          }

          // Handle completion
          if (eventType === 'done' || eventType === 'run_done' || chunkAny.status === 'done') {
            controller.enqueue(encoder.encode(`event: done\ndata: {"event":"done"}\n\n`));
            doneSent = true;
            break;
          }
        }

        // Ensure completion marker is sent
        if (!doneSent) {
          controller.enqueue(encoder.encode(`event: done\ndata: {"event":"done"}\n\n`));
        }
      } catch (error) {
        console.error('Stream error:', error);
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: (error as Error).message })}\n\n`));
        controller.enqueue(encoder.encode(`event: done\ndata: {"event":"done"}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(responseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
