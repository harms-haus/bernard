import { NextRequest, NextResponse } from 'next/server';
import { initChatModel } from 'langchain/chat_models/universal';
import { Client } from '@langchain/langgraph-sdk';
import { resolveModel } from '@/lib/config/models';
import { logger } from '@/lib/logging/logger';

interface AutoRenameRequest {
  firstMessage?: string;
  messages?: Array<{ type: string; content: unknown }>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let threadId: string | undefined;
  
  try {
    const resolvedParams = await params;
    threadId = resolvedParams.id;
    const body = await request.json() as AutoRenameRequest;
    const { firstMessage, messages } = body;

    let conversationText: string;
    if (messages && messages.length > 0) {
      conversationText = messages
        .map(m => {
          const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          return `[${m.type}]: ${content}`;
        })
        .join('\n\n');
    } else if (firstMessage) {
      conversationText = firstMessage;
    } else {
      return NextResponse.json({ error: 'firstMessage or messages is required' }, { status: 400 });
    }

    logger.info({ threadId, hasMessages: !!messages }, 'Starting auto-rename');

    const { id: modelId, options } = await resolveModel('utility');
    const namingModel = await initChatModel(modelId, options);

    const min = 3;
    const max = 5;
    const prompt = '';

    const fullPrompt = 'Generate a concise title for this conversation.\n\n' +
      prompt + (prompt ? '\n\n' : '') +
      `Your title must be between ${min} and ${max} words.\n\n` +
      `The conversation so far is:\n${conversationText}`;

    const response = await namingModel.invoke([
      { role: 'user', content: fullPrompt }
    ]);

    const title = typeof response.content === 'string'
      ? response.content.trim().replace(/"/g, '')
      : 'New Chat';

    let finalTitle = title;
    if (finalTitle.length > 50) {
      finalTitle = finalTitle.substring(0, 47) + '...';
    }

    logger.info({ threadId, title: finalTitle }, 'Generated title');

    const client = new Client({
      apiUrl: process.env['LANGGRAPH_API_URL'] ?? 'http://localhost:2024',
    });

    await client.threads.update(threadId, {
      metadata: {
        name: finalTitle,
        created_at: new Date().toISOString()
      },
    });

    logger.info({ threadId, name: finalTitle }, 'Thread renamed successfully');

    return NextResponse.json({
      success: true,
      threadId,
      name: finalTitle,
    });
  } catch (error) {
    logger.error({ error, threadId }, 'Failed to auto-rename thread');
    return NextResponse.json({
      error: 'Failed to auto-rename thread',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
