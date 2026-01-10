import { NextRequest, NextResponse } from 'next/server';
import Redis from 'ioredis';
import { logger } from '@/lib/logging/logger';

const REDIS_URL = process.env['REDIS_URL'] || 'redis://localhost:6379';

function getRedis(): Redis {
  return new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });
}

const CHECKPOINT_PATTERNS = [
  /^checkpoints:([^:]+):([^:]+)/,
  /^checkpoint:([^:]+)::(.+)/,
  /^langgraph:checkpoints:([^:]+):([^:]+)/,
  /^checkpoint_write:([^:]+)::([^:]+)/,
];

function parseCheckpointKey(key: string): { threadId: string; checkpointId: string } | null {
  for (const pattern of CHECKPOINT_PATTERNS) {
    const match = key.match(pattern);
    if (match) {
      return { threadId: match[1], checkpointId: match[2] };
    }
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const threadId = resolvedParams.id;
    const redis = getRedis();
    await redis.connect();

    const checkpoints: Array<{ id: string; timestamp: string }> = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await redis.scan(cursor, 'MATCH', `*checkpoints*${threadId}*`, 'COUNT', 50);
      cursor = newCursor;
      for (const key of keys) {
        const parsed = parseCheckpointKey(key);
        if (parsed && parsed.threadId === threadId) {
          const timestamp = parsed.checkpointId.length >= 8
            ? (() => {
                try {
                  const ts = parseInt(parsed.checkpointId.substring(0, 8), 16) * 1000;
                  return isNaN(ts) ? new Date().toISOString() : new Date(ts).toISOString();
                } catch {
                  return new Date().toISOString();
                }
              })()
            : new Date().toISOString();
          checkpoints.push({ id: parsed.checkpointId, timestamp });
        }
      }
    } while (cursor !== '0');

    await redis.quit();

    if (checkpoints.length === 0) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: threadId,
      checkpoints: checkpoints.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      checkpointCount: checkpoints.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get thread');
    return NextResponse.json({
      error: 'Failed to get thread',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const threadId = resolvedParams.id;
    const body = await request.json();
    const { name } = body as { name?: string };

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const redis = getRedis();
    await redis.connect();
    await redis.set(`bernard:thread:${threadId}`, JSON.stringify({ name, updatedAt: new Date().toISOString() }));
    await redis.quit();

    return NextResponse.json({ id: threadId, name, updated: true });
  } catch (error) {
    logger.error({ error }, 'Failed to update thread');
    return NextResponse.json({
      error: 'Failed to update thread',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const threadId = resolvedParams.id;
    const redis = getRedis();
    await redis.connect();

    let cursor = '0';
    let deletedCount = 0;

    do {
      const [newCursor, keys] = await redis.scan(cursor, 'MATCH', `*${threadId}*`, 'COUNT', 100);
      cursor = newCursor;
      if (keys.length > 0) {
        const threadKeys = keys.filter(k => {
          const parsed = parseCheckpointKey(k);
          return parsed && parsed.threadId === threadId;
        });

        if (threadKeys.length > 0) {
          await redis.del(...threadKeys);
          deletedCount += threadKeys.length;
        }
      }
    } while (cursor !== '0');

    await redis.del(`bernard:thread:${threadId}`);
    await redis.quit();

    return NextResponse.json({ id: threadId, deletedCheckpoints: deletedCount, deleted: true });
  } catch (error) {
    logger.error({ error }, 'Failed to delete thread');
    return NextResponse.json({
      error: 'Failed to delete thread',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
