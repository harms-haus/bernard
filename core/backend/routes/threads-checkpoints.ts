import { Hono } from 'hono'
import { getSession } from '../utils/auth'
import { handleAutoRename } from '../../src/lib/api/thread-auto-rename'
import { logger } from '../../src/lib/logging/logger'
import { createClient } from 'redis'
import { parseCheckpointKey } from '../../src/lib/checkpoint/redis-key'
import { loadsTyped } from '../../src/lib/checkpoint/serde'
import { getLangGraphUrl } from '../utils/proxy'

function jsonValueToBuffer(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64')
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

interface CheckpointHistoryItem {
  checkpoint_id: string
  checkpoint_ns: string
  parent_checkpoint_id: string | null
  checkpoint_ts: number
  step: number | undefined
  source: string | undefined
  message_ids: string[]
}

async function verifyThreadOwnership(threadId: string, userId: string): Promise<boolean> {
  try {
    const threadsBaseUrl = process.env.BERNARD_AGENT_URL || process.env.LANGGRAPH_API_URL || 'http://localhost:2024'
    const response = await fetch(`${threadsBaseUrl}/threads/${threadId}`, {
      method: 'GET',
      headers: { 'content-type': 'application/json' }
    })

    if (!response.ok) {
      return false
    }

    const thread = await response.json()
    return thread.user_id === userId || thread.metadata?.user_id === userId
  } catch {
    return false
  }
}

const checkpointsRoutes = new Hono()

// GET /api/threads/:threadId/checkpoints - Get checkpoint history
checkpointsRoutes.get('/:threadId/checkpoints', async (c) => {
  const { threadId } = c.req.param()
  const session = await getSession(c)
  const userId = session?.user?.id

  if (!userId) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  // Verify ownership
  const isOwner = await verifyThreadOwnership(threadId, userId)
  if (!isOwner) {
    return c.json({ error: 'Not authorized' }, 403)
  }

  let redis: ReturnType<typeof createClient> | null = null
  try {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'
    redis = createClient({ url: redisUrl })
    await redis.connect()

    const pattern = `checkpoint:${threadId}:*`
    
    const keys: string[] = []
    let cursor = 0
    do {
      const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 })
      cursor = result.cursor
      keys.push(...result.keys)
    } while (cursor !== 0)

    if (keys.length === 0) {
      return c.json({ checkpoints: [] })
    }

    const checkpointPromises = keys.map(async (key: string) => {
      const data = await redis!.json.get(key) as Record<string, unknown> | null
      if (!data) return null

      const parsed = parseCheckpointKey(key)

      let messageIds: string[] = []

      try {
        const checkpointFieldStr = data.checkpoint as string
        const checkpointType = data.checkpoint_type as string

        if (checkpointType && checkpointFieldStr) {
          const checkpoint = await loadsTyped<Record<string, unknown>>(
            checkpointType,
            jsonValueToBuffer(checkpointFieldStr)
          )

          const values = checkpoint.channel_values as Record<string, unknown> | undefined
          const messages = values?.messages as Array<{ id: string } | undefined> | undefined

          if (Array.isArray(messages)) {
            messageIds = messages
              .filter((m): m is { id: string } => m !== undefined && typeof m.id === 'string')
              .map(m => m.id)
          }
        }
      } catch (error) {
        logger.warn({ key, error: (error as Error).message }, 'Failed to deserialize checkpoint for message IDs')
      }

      return {
        checkpoint_id: parsed.checkpointId,
        checkpoint_ns: parsed.checkpointNs,
        parent_checkpoint_id: data.parent_checkpoint_id as string | null,
        checkpoint_ts: data.checkpoint_ts as number,
        step: data.step as number | undefined,
        source: data.source as string | undefined,
        message_ids: messageIds,
      }
    })

    const checkpoints = (await Promise.all(checkpointPromises)).filter((c): c is CheckpointHistoryItem => c !== null)

    checkpoints.sort((a: CheckpointHistoryItem, b: CheckpointHistoryItem) => b.checkpoint_ts - a.checkpoint_ts)

    const checkpointMap = new Map<string, CheckpointHistoryItem>()
    for (const cp of checkpoints) {
      checkpointMap.set(cp.checkpoint_id, cp)
    }

    const result = Array.from(checkpointMap.values()).map(cp => {
      const resultItem: CheckpointHistoryItem & { parent?: Pick<CheckpointHistoryItem, 'checkpoint_id' | 'checkpoint_ts' | 'step' | 'source'> } = { ...cp }
      if (cp.parent_checkpoint_id) {
        const parent = checkpointMap.get(cp.parent_checkpoint_id)
        if (parent) {
          resultItem.parent = {
            checkpoint_id: parent.checkpoint_id,
            checkpoint_ts: parent.checkpoint_ts,
            step: parent.step,
            source: parent.source,
          }
        }
      }
      return resultItem
    })

    return c.json({
      checkpoints: result,
      total: checkpoints.length,
    })
  } catch (error) {
    logger.error({ threadId, error: error instanceof Error ? error : String(error) }, 'Failed to fetch checkpoint history')
    return c.json({ error: 'Failed to fetch checkpoint history' }, 500)
  } finally {
    if (redis) {
      try {
        await redis.quit()
      } catch (quitError) {
        logger.warn({ threadId, error: quitError instanceof Error ? quitError.message : String(quitError) }, 'Failed to close Redis connection')
      }
    }
  }
})

// GET /api/threads/:threadId/history - Get thread history (proxied with checkpoint enrichment)
checkpointsRoutes.get('/:threadId/history', async (c) => {
  const { threadId } = c.req.param()
  const session = await getSession(c)
  const userId = session?.user?.id

  if (!userId) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  // Verify ownership
  const isOwner = await verifyThreadOwnership(threadId, userId)
  if (!isOwner) {
    return c.json({ error: 'Not authorized' }, 403)
  }

  // Proxy to LangGraph and enrich with checkpoint data
  // This is a simplified version - the full implementation would enrich the response
  const response = await fetch(getLangGraphUrl(`/threads/${threadId}/history`), {
    method: 'GET',
    headers: { 'content-type': 'application/json' }
  })

  if (!response.ok) {
    return c.json({ error: 'Failed to fetch history' }, response.status)
  }

  const history = await response.json()
  return c.json(history)
})

// POST /api/threads/:threadId/auto-rename - Auto-rename thread
checkpointsRoutes.post('/:threadId/auto-rename', async (c) => {
  try {
    const authUser = await getSession(c)
    if (!authUser) return c.json({ error: 'Session required' }, 403)

    const { threadId } = c.req.param()
    const body = await c.req.json().catch(() => ({}))
    const response = await handleAutoRename(threadId, body)
    return c.body(await response.text(), response.status, Object.fromEntries(response.headers.entries()))
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.error({ error: errorMessage }, 'Failed to perform auto-rename')
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default checkpointsRoutes
