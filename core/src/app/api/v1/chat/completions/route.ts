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
    const { messages, model, thread_id, stream } = body as {
      messages: Array<{ role: string; content: string }>;
      model: string;
      thread_id?: string;
      stream?: boolean;
    };

    let threadId = thread_id;

    if (!threadId) {
      const thread = await client.threads.create();
      threadId = thread.thread_id;
    }

    // Non-streaming: use create() + join()
    if (!stream) {
      const assistantId = model || 'bernard_agent';
      const run = await client.runs.create(
        threadId,
        assistantId,
        {
          input: { messages },
        }
      );
      // Wait for run to complete using join()
      const result = await client.runs.join(threadId, run.run_id);
      return NextResponse.json(result);
    }

    // Streaming: use stream() with proper event handling
    const runStream = client.runs.stream(
      threadId,
      model || 'bernard_agent',
      {
        input: { messages },
        streamMode: ['messages'] as const,
      }
    );

    const encoder = new TextEncoder();
    let messageCount = 0;

    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of runStream) {
            const chunkAny = chunk as Record<string, unknown>;
            const eventType = String(chunkAny.event || '');

            // Handle messages/complete events (contains the AI response)
            if (eventType === 'messages/complete' || eventType === 'messages') {
              const data = chunkAny.data as unknown[];
              if (Array.isArray(data)) {
                // Find AI message in the array
                for (const msg of data) {
                  const msgObj = msg as Record<string, unknown>;
                  if (msgObj?.type === 'ai' && msgObj?.content) {
                    const content = Array.isArray(msgObj.content)
                      ? msgObj.content.map((c: Record<string, unknown>) => {
                          // Handle different content formats
                          if (typeof c === 'string') return c;
                          return (c as Record<string, unknown>).text || (c as Record<string, unknown>).content || '';
                        }).join('')
                      : String(msgObj.content);

                    if (content) {
                      messageCount++;
                      const sseData = JSON.stringify({
                        id: `chatcmpl-${Date.now()}`,
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model: model || 'bernard_agent',
                        choices: [{ index: 0, delta: { content }, finish_reason: null }],
                      });
                      controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
                    }
                  }
                }
              }
            }

            // Handle completion (done, run_done, or any status indicating completion)
            if (eventType === 'done' || eventType === 'run_done' || chunkAny.status === 'done') {
              const sseData = JSON.stringify({
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: model || 'bernard_agent',
                choices: [{ index: 0, delta: {}, finish_reason: messageCount > 0 ? 'stop' : 'length' }],
              });
              controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              break;
            }
          }
        } catch (error) {
          console.error('Stream error:', error);
          // Send error as SSE
          const errorData = JSON.stringify({
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: model || 'bernard_agent',
            choices: [{ index: 0, delta: { content: `Error: ${(error as Error).message}` }, finish_reason: 'stop' }],
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
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
  } catch (error) {
    console.error('Chat completions error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Internal server error' },
      { status: 500 }
    );
  }
}
