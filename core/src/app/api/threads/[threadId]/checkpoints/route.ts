import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/server-helpers';
import { createClient } from 'redis';
import { parseCheckpointKey } from '@/lib/checkpoint/redis-key';
import { logger } from '@/lib/logging/logger';
import { loadsTyped } from '@/lib/checkpoint/serde';
import { getLangGraphUrl } from '@/lib/langgraph/proxy';

/**
 * Convert base64 string back to Uint8Array after reading from Redis.
 */
function jsonValueToBuffer(base64: string): Uint8Array {
  // Use Buffer for proper base64 decoding in Node.js
  if (typeof Buffer !== "undefined") {
    return Buffer.from(base64, "base64");
  }
  // Fallback for browser environments
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const dynamic = 'force-dynamic';

interface CheckpointHistoryItem {
  checkpoint_id: string;
  checkpoint_ns: string;
  parent_checkpoint_id: string | null;
  checkpoint_ts: number;
  step: number | undefined;
  source: string | undefined;
  message_ids: string[];  // IDs of messages in this checkpoint's state
}


async function verifyThreadOwnership(threadId: string, userId: string): Promise<boolean> {
  try {
    const threadsBaseUrl = process.env.BERNARD_AGENT_URL || process.env.LANGGRAPH_API_URL || 'http://localhost:2024';
    const response = await fetch(`${threadsBaseUrl}/threads/${threadId}`, {
      method: 'GET',
      headers: { 'content-type': 'application/json' }
    });

    if (!response.ok) {
      return false;
    }

    const thread = await response.json();
    return thread.user_id === userId || thread.metadata?.user_id === userId;
  } catch {
    return false;
  }
}

/**
 * GET /api/threads/[threadId]/checkpoints
 *
 * Returns checkpoint history with parent relationships for branching support.
 * Queries Redis directly to include checkpoint_id and parent_checkpoint_id.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const session = await getSession();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Verify ownership
  const isOwner = await verifyThreadOwnership(threadId, userId);
  if (!isOwner) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  let redis: ReturnType<typeof createClient> | null = null;
  try {
    // Create Redis client (using same config as RedisSaver)
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    redis = createClient({ url: redisUrl });
    await redis.connect();

    const pattern = `checkpoint:${threadId}:*`;
    
    // Use SCAN instead of keys() to avoid blocking
    const keys: string[] = [];
    let cursor = 0;
    do {
      const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      keys.push(...result.keys);
    } while (cursor !== 0);

    if (keys.length === 0) {
      return NextResponse.json({ checkpoints: [] });
    }

    // Fetch all checkpoint data
    const checkpointPromises = keys.map(async (key: string) => {
      const data = await redis!.json.get(key) as Record<string, unknown> | null;
      if (!data) return null;

      const parsed = parseCheckpointKey(key);

      // Extract message IDs from the checkpoint state
      let messageIds: string[] = [];

      try {
        const checkpointFieldStr = data.checkpoint as string;
        const checkpointType = data.checkpoint_type as string;

        if (checkpointType && checkpointFieldStr) {
          // Deserialize the checkpoint to get message IDs
          const checkpoint = await loadsTyped<Record<string, unknown>>(
            checkpointType,
            jsonValueToBuffer(checkpointFieldStr)
          );

          // Extract message IDs from checkpoint state values
          const values = checkpoint.channel_values as Record<string, unknown> | undefined;
          const messages = values?.messages as Array<{ id: string } | undefined> | undefined;

          if (Array.isArray(messages)) {
            messageIds = messages
              .filter((m): m is { id: string } => m !== undefined && typeof m.id === 'string')
              .map(m => m.id);
          }
        }
      } catch (error) {
        // If we can't deserialize, continue without message IDs
        logger.warn({ key, error: (error as Error).message }, 'Failed to deserialize checkpoint for message IDs');
      }

      return {
        checkpoint_id: parsed.checkpointId,
        checkpoint_ns: parsed.checkpointNs,
        parent_checkpoint_id: data.parent_checkpoint_id as string | null,
        checkpoint_ts: data.checkpoint_ts as number,
        step: data.step as number | undefined,
        source: data.source as string | undefined,
        message_ids: messageIds,
      };
    });

    const checkpoints = (await Promise.all(checkpointPromises)).filter((c): c is CheckpointHistoryItem => c !== null);

    // Sort by timestamp descending (newest first)
    checkpoints.sort((a: CheckpointHistoryItem, b: CheckpointHistoryItem) => b.checkpoint_ts - a.checkpoint_ts);

    // Build a map for quick parent lookup
    const checkpointMap = new Map<string, CheckpointHistoryItem>();
    for (const cp of checkpoints) {
      checkpointMap.set(cp.checkpoint_id, cp);
    }

    // Build result with safe parent references (only IDs, not full objects)
    const result = Array.from(checkpointMap.values()).map(cp => {
      const resultItem: CheckpointHistoryItem & { parent?: Pick<CheckpointHistoryItem, 'checkpoint_id' | 'checkpoint_ts' | 'step' | 'source'> } = { ...cp };
      if (cp.parent_checkpoint_id) {
        const parent = checkpointMap.get(cp.parent_checkpoint_id);
        if (parent) {
          // Only include non-nested fields to avoid circular references
          resultItem.parent = {
            checkpoint_id: parent.checkpoint_id,
            checkpoint_ts: parent.checkpoint_ts,
            step: parent.step,
            source: parent.source,
          };
        }
      }
      return resultItem;
    });

    return NextResponse.json({
      checkpoints: result,
      total: checkpoints.length,
    });

  } catch (error) {
    logger.error({ threadId, error: error instanceof Error ? error : String(error), stack: error instanceof Error ? error.stack : undefined }, 'Failed to fetch checkpoint history');
    return NextResponse.json(
      { error: 'Failed to fetch checkpoint history' },
      { status: 500 }
    );
  } finally {
    if (redis) {
      try {
        await redis.quit();
      } catch (quitError) {
        logger.warn({ threadId, error: quitError instanceof Error ? quitError.message : String(quitError) }, 'Failed to close Redis connection');
      }
    }
  }
}
