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

    const runStream = client.runs.stream(
      threadId,
      model || 'bernard_agent',
      {
        input: { messages },
        streamMode: stream ? (['messages'] as const) : undefined,
      }
    );

    if (!stream) {
      const result = await runStream;
      return NextResponse.json(result);
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of runStream) {
            const chunkAny = chunk as any;
            if (chunkAny.event === 'messages') {
              const messageChunk = chunkAny.data;
              if (messageChunk?.type === 'ai' && messageChunk.content) {
                const content = Array.isArray(messageChunk.content)
                  ? messageChunk.content.map((c: any) => c.text || c.content || c).join('')
                  : messageChunk.content;

                if (content) {
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
            if (chunkAny.event === 'done' || chunkAny.status === 'done') {
              const sseData = JSON.stringify({
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: model || 'bernard_agent',
                choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
              });
              controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              break;
            }
          }
        } catch (error) {
          console.error('Stream error:', error);
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
