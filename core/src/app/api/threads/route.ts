import { NextRequest, NextResponse } from 'next/server'
import { requireAuth as requireAuthFn } from '@/lib/auth/helpers'
import Redis from 'ioredis'

const REDIS_URL = process.env['REDIS_URL'] || 'redis://localhost:6379'

interface ThreadListItem {
  id: string
  name?: string
  createdAt: string
  lastTouchedAt: string
  messageCount?: number
}

function getRedis(): Redis {
  return new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  })
}

const CHECKPOINT_PATTERNS = [
  /^checkpoints:([^:]+):([^:]+)/,
  /^checkpoint:([^:]+)::(.+)/,
  /^langgraph:checkpoints:([^:]+):([^:]+)/,
  /^checkpoint_write:([^:]+)::([^:]+)/,
]

function parseCheckpointKey(key: string): { threadId: string; checkpointId: string } | null {
  for (const pattern of CHECKPOINT_PATTERNS) {
    const match = key.match(pattern)
    if (match) {
      return { threadId: match[1], checkpointId: match[2] }
    }
  }
  return null
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthFn(request)
  if (auth instanceof NextResponse) return auth

  try {
    const redis = getRedis()
    await redis.connect()

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const checkpointKeys = new Set<string>()
    let cursor = '0'

    do {
      const [newCursor, keys] = await redis.scan(cursor, 'MATCH', '*checkpoint*', 'COUNT', 100)
      cursor = newCursor
      for (const key of keys) {
        checkpointKeys.add(key)
      }
    } while (cursor !== '0' && checkpointKeys.size < limit + offset + 100)

    const threadMap = new Map<string, { name?: string; createdAt: string; lastTouchedAt: string; checkpointIds: Set<string> }>()

    for (const key of checkpointKeys) {
      const parsed = parseCheckpointKey(key)
      if (parsed) {
        const { threadId, checkpointId } = parsed

        if (!threadMap.has(threadId)) {
          threadMap.set(threadId, {
            name: undefined,
            createdAt: new Date().toISOString(),
            lastTouchedAt: new Date().toISOString(),
            checkpointIds: new Set(),
          })
        }
        const thread = threadMap.get(threadId)!
        thread.checkpointIds.add(checkpointId)

        if (checkpointId.length >= 8) {
          const timestamp = parseInt(checkpointId.substring(0, 8), 16) * 1000
          if (!isNaN(timestamp)) {
            const checkpointTime = new Date(timestamp)
            thread.lastTouchedAt = checkpointTime.toISOString()
            if (!thread.createdAt || checkpointTime < new Date(thread.createdAt)) {
              thread.createdAt = checkpointTime.toISOString()
            }
          }
        }
      }
    }

    const threadMetadataKeys = new Set<string>()
    cursor = '0'
    do {
      const [newCursor, keys] = await redis.scan(cursor, 'MATCH', 'bernard:thread:*', 'COUNT', 100)
      cursor = newCursor
      for (const key of keys) {
        threadMetadataKeys.add(key)
      }
    } while (cursor !== '0')

    for (const key of threadMetadataKeys) {
      try {
        const data = await redis.get(key)
        if (data) {
          const parsed = JSON.parse(data) as { name?: string }
          if (parsed.name) {
            const threadId = key.split(':').pop()
            if (threadId && threadMap.has(threadId)) {
              threadMap.get(threadId)!.name = parsed.name
            }
          }
        }
      } catch (e) {
        void e
      }
    }

    await redis.quit()

    const threads: ThreadListItem[] = Array.from(threadMap.entries())
      .map(([id, data]) => ({
        id,
        name: data.name,
        createdAt: data.createdAt,
        lastTouchedAt: data.lastTouchedAt,
        messageCount: data.checkpointIds.size,
      }))
      .sort((a, b) => new Date(b.lastTouchedAt).getTime() - new Date(a.lastTouchedAt).getTime())

    const paginatedThreads = threads.slice(offset, offset + limit)

    return NextResponse.json({
      threads: paginatedThreads,
      total: threads.length,
      hasMore: offset + limit < threads.length,
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to list threads',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
