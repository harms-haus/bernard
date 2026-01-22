import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/server-helpers';
import { createClient } from 'redis';
import { parseCheckpointKey } from '@/lib/checkpoint/redis-key';
import { logger } from '@/lib/logging/logger';
import { loadsTyped } from '@/lib/checkpoint/serde';

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

interface CheckpointWithParent extends CheckpointHistoryItem {
  parent?: CheckpointHistoryItem;
}

async function verifyThreadOwnership(threadId: string, userId: string): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:2024/threads/${threadId}`, {
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

  try {
    // Create Redis client (using same config as RedisSaver)
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const redis = createClient({ url: redisUrl });
    await redis.connect();

    const pattern = `checkpoint:${threadId}:*`;
    const keys = await redis.keys(pattern);

    if (keys.length === 0) {
      await redis.quit();
      return NextResponse.json({ checkpoints: [] });
    }

    // Fetch all checkpoint data
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

    await redis.quit();

    // Sort by timestamp descending (newest first)
    checkpoints.sort((a: CheckpointHistoryItem, b: CheckpointHistoryItem) => b.checkpoint_ts - a.checkpoint_ts);

    // Build a map for quick parent lookup
    const checkpointMap = new Map<string, CheckpointWithParent>();
    for (const cp of checkpoints) {
      checkpointMap.set(cp.checkpoint_id, { ...cp, parent: undefined });
    }

    // Link parents
    for (const cp of checkpointMap.values()) {
      if (cp.parent_checkpoint_id) {
        const parent = checkpointMap.get(cp.parent_checkpoint_id);
        if (parent) {
          cp.parent = parent;
        }
      }
    }

    return NextResponse.json({
      checkpoints: Array.from(checkpointMap.values()),
      total: checkpoints.length,
    });

  } catch (error) {
    logger.error({ threadId, error: (error as Error).message }, 'Failed to fetch checkpoint history');
    return NextResponse.json(
      { error: 'Failed to fetch checkpoint history', details: (error as Error).message },
      { status: 500 }
    );
  }
}
