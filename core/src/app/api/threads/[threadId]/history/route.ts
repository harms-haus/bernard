import { NextRequest, NextResponse } from 'next/server'
import { proxyToLangGraph, getLangGraphUrl } from '@/lib/langgraph/proxy'
import { getSession } from '@/lib/auth/server-helpers'
import { logger } from '@/lib/logging/logger'
import { createClient } from 'redis'
import { parseCheckpointKey } from '@/lib/checkpoint/redis-key'
import { loadsTyped } from '@/lib/checkpoint/serde'

export const dynamic = 'force-dynamic'

/**
 * Convert base64 string back to Uint8Array after reading from Redis.
 */
function jsonValueToBuffer(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(base64, "base64");
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function verifyThreadOwnership(threadId: string, userId: string): Promise<boolean> {
  try {
    const response = await fetch(getLangGraphUrl(`/threads/${threadId}`), {
      method: 'GET',
      headers: { 'content-type': 'application/json' }
    })

    if (!response.ok) {
      logger.warn({ threadId, status: response.status }, 'Failed to fetch thread for history');
      return false
    }

    const thread = await response.json()

    // Check if thread belongs to user (thread.user_id or thread.metadata?.user_id)
    const isOwner = thread.user_id === userId || thread.metadata?.user_id === userId
    return isOwner
  } catch (error) {
    logger.warn({ threadId, error: (error as Error).message }, 'Error checking ownership for history');
    return false
  }
}

/**
 * Fetch checkpoint data from Redis and build a map of message IDs to checkpoint IDs.
 * This is needed because the LangGraph server doesn't include checkpoint info in history.
 */
async function fetchCheckpointMap(threadId: string): Promise<Map<string, { checkpoint_id: string; parent_checkpoint_id: string | null }>> {
  try {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const redis = createClient({ url: redisUrl });
    await redis.connect();

    const pattern = `checkpoint:${threadId}:*`;
    const keys = await redis.keys(pattern);

    if (keys.length === 0) {
      await redis.quit();
      return new Map();
    }

    const checkpointPromises = keys.map(async (key: string) => {
      const data = await redis.json.get(key) as Record<string, unknown> | null;
      if (!data) return null;

      const parsed = parseCheckpointKey(key);

      // Extract message IDs from the checkpoint state
      let messageIds: string[] = [];

      try {
        const checkpointFieldStr = data.checkpoint as string;
        const checkpointType = data.checkpoint_type as string;

        if (checkpointType && checkpointFieldStr) {
          const checkpoint = await loadsTyped<Record<string, unknown>>(
            checkpointType,
            jsonValueToBuffer(checkpointFieldStr)
          );

          const values = checkpoint.channel_values as Record<string, unknown> | undefined;
          const messages = values?.messages as Array<{ id: string } | undefined> | undefined;

          if (Array.isArray(messages)) {
            messageIds = messages
              .filter((m): m is { id: string } => m !== undefined && typeof m.id === 'string')
              .map(m => m.id);
          }
        }
      } catch (error) {
        logger.warn({ key, error: (error as Error).message }, 'Failed to deserialize checkpoint');
      }

      return {
        checkpoint_id: parsed.checkpointId,
        parent_checkpoint_id: data.parent_checkpoint_id as string | null,
        message_ids: messageIds,
        checkpoint_ts: data.checkpoint_ts as number,
      };
    });

    const checkpoints = (await Promise.all(checkpointPromises)).filter((c): c is NonNullable<typeof checkpoints[number]> => c !== null);
    await redis.quit();

    // Sort by timestamp ascending (oldest first) to match history order
    checkpoints.sort((a, b) => a.checkpoint_ts - b.checkpoint_ts);

    // Build map: message_id -> { checkpoint_id, parent_checkpoint_id }
    // For messages that appear in multiple checkpoints, use the most recent one
    const messageToCheckpoint = new Map<string, { checkpoint_id: string; parent_checkpoint_id: string | null }>();

    for (const cp of checkpoints) {
      for (const messageId of cp.message_ids) {
        // Only add if not already present (keep first/oldest occurrence)
        if (!messageToCheckpoint.has(messageId)) {
          messageToCheckpoint.set(messageId, {
            checkpoint_id: cp.checkpoint_id,
            parent_checkpoint_id: cp.parent_checkpoint_id,
          });
        }
      }
    }

    return messageToCheckpoint;
  } catch (error) {
    logger.error({ threadId, error: (error as Error).message }, 'Failed to fetch checkpoint map');
    return new Map();
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params
  const session = await getSession()
  const userId = session?.user?.id

  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  // Verify ownership before allowing access to history
  const isOwner = await verifyThreadOwnership(threadId, userId)
  if (!isOwner) {
    logger.info({ threadId, userId }, 'History access denied - not owner');
    return NextResponse.json({ error: 'Not authorized to view this thread history' }, { status: 403 })
  }

  // Fetch the original history from LangGraph server
  const originalResponse = await proxyToLangGraph(request, `/threads/${threadId}/history`)
  const originalData = await originalResponse.json() as Array<{ values: { messages: Array<{ id: string }> }; [key: string]: unknown }>;

  // Fetch checkpoint data from Redis
  const checkpointMap = await fetchCheckpointMap(threadId);

  // Inject checkpoint info into each state
  const enhancedData = originalData.map((state) => {
    const messages = state.values?.messages ?? [];
    // For each message in this state, check if we have checkpoint info
    // We use the last message in the state to determine the checkpoint for this state
    const lastMessage = messages[messages.length - 1];
    const checkpointInfo = lastMessage?.id ? checkpointMap.get(lastMessage.id) : undefined;

    if (checkpointInfo) {
      return {
        ...state,
        checkpoint: {
          thread_id: threadId,
          checkpoint_ns: '',
          checkpoint_id: checkpointInfo.checkpoint_id,
          checkpoint_map: undefined,
        },
      };
    }

    return state;
  });

  return NextResponse.json(enhancedData);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params
  const session = await getSession()
  const userId = session?.user?.id

  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  // Verify ownership before allowing access to history
  const isOwner = await verifyThreadOwnership(threadId, userId)
  if (!isOwner) {
    logger.info({ threadId, userId }, 'History access denied - not owner');
    return NextResponse.json({ error: 'Not authorized to view this thread history' }, { status: 403 })
  }

  // Fetch the original history from LangGraph server
  const originalResponse = await proxyToLangGraph(request, `/threads/${threadId}/history`)
  const originalData = await originalResponse.json() as Array<{ values: { messages: Array<{ id: string }> }; [key: string]: unknown }>;

  // Fetch checkpoint data from Redis
  const checkpointMap = await fetchCheckpointMap(threadId);

  // Inject checkpoint info into each state
  const enhancedData = originalData.map((state) => {
    const messages = state.values?.messages ?? [];
    // For each message in this state, check if we have checkpoint info
    // We use the last message in the state to determine the checkpoint for this state
    const lastMessage = messages[messages.length - 1];
    const checkpointInfo = lastMessage?.id ? checkpointMap.get(lastMessage.id) : undefined;

    if (checkpointInfo) {
      return {
        ...state,
        checkpoint: {
          thread_id: threadId,
          checkpoint_ns: '',
          checkpoint_id: checkpointInfo.checkpoint_id,
          checkpoint_map: undefined,
        },
      };
    }

    return state;
  });

  return NextResponse.json(enhancedData);
}
