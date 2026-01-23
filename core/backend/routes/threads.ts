import { Hono } from 'hono'
import { proxyToLangGraph, getLangGraphUrl } from '../utils/proxy'
import { getSession } from '../utils/auth'
import { logger } from '../../src/lib/logging/logger'

const threadsRoutes = new Hono()

async function verifyThreadOwnership(threadId: string, userId: string): Promise<{ isOwner: boolean; thread: Record<string, unknown> | null }> {
  try {
    const response = await fetch(getLangGraphUrl(`/threads/${threadId}`), {
      method: 'GET',
      headers: { 'content-type': 'application/json' }
    })

    if (!response.ok) {
      logger.warn({ threadId, status: response.status }, 'Failed to fetch thread')
      return { isOwner: false, thread: null }
    }

    const thread = await response.json()

    // Check if thread belongs to user (thread.user_id or thread.metadata?.user_id)
    const isOwner = thread.user_id === userId || thread.metadata?.user_id === userId
    return { isOwner, thread }
  } catch (error) {
    logger.warn({ threadId, error: (error as Error).message }, 'Error checking ownership')
    return { isOwner: false, thread: null }
  }
}

// GET /api/threads - List threads (requires userId filtering)
threadsRoutes.get('/', async (c) => {
  const session = await getSession(c)
  const userId = session?.user?.id

  if (!userId) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  const { searchParams } = new URL(c.req.url)

  // Remove any existing user_id from searchParams to prevent authorization bypass
  const sanitizedParams = new URLSearchParams(searchParams)
  sanitizedParams.delete('user_id')

  const query = sanitizedParams.toString()

  // Add user_id filter with the trusted authenticated userId
  const path = `/threads${query ? `?${query}&user_id=${userId}` : `?user_id=${userId}`}`
  return proxyToLangGraph(c, path)
})

// POST /api/threads - Create thread (inject userId into metadata)
threadsRoutes.post('/', async (c) => {
  const session = await getSession(c)
  const userId = session?.user?.id

  if (!userId) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  // Pass userId to inject into request body for thread creation
  return proxyToLangGraph(c, '/threads', { userId })
})

// GET /api/threads/:threadId - Get thread (verify ownership)
threadsRoutes.get('/:threadId', async (c) => {
  const { threadId } = c.req.param()
  const session = await getSession(c)
  const userId = session?.user?.id

  if (!userId) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  // Verify ownership before allowing access
  const { isOwner } = await verifyThreadOwnership(threadId, userId)
  if (!isOwner) {
    logger.info({ threadId, userId }, 'Thread access denied - not owner')
    return c.json({ error: 'Not authorized to view this thread' }, 403)
  }
  return proxyToLangGraph(c, `/threads/${threadId}`)
})

// DELETE /api/threads/:threadId - Delete thread (verify ownership)
threadsRoutes.delete('/:threadId', async (c) => {
  const { threadId } = c.req.param()
  const session = await getSession(c)
  const userId = session?.user?.id

  if (!userId) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  // Verify ownership before delete
  const { isOwner } = await verifyThreadOwnership(threadId, userId)
  if (!isOwner) {
    logger.info({ threadId, userId }, 'Thread delete denied - not owner')
    return c.json({ error: 'Not authorized to delete this thread' }, 403)
  }

  return proxyToLangGraph(c, `/threads/${threadId}`, { method: 'DELETE' })
})

// PATCH /api/threads/:threadId - Update thread (verify ownership)
threadsRoutes.patch('/:threadId', async (c) => {
  const { threadId } = c.req.param()
  const session = await getSession(c)
  const userId = session?.user?.id

  if (!userId) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  // Verify ownership before rename
  const { isOwner } = await verifyThreadOwnership(threadId, userId)
  if (!isOwner) {
    logger.info({ threadId, userId }, 'Thread rename denied - not owner')
    return c.json({ error: 'Not authorized to rename this thread' }, 403)
  }

  return proxyToLangGraph(c, `/threads/${threadId}`, { method: 'PATCH', userId })
})

// POST /api/threads/search - Search threads (server-side filter by userId)
threadsRoutes.post('/search', async (c) => {
  const session = await getSession(c)
  const userId = session?.user?.id
  if (!userId) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  const body = await c.req.json().catch(() => ({}))

  try {
    // Fetch all threads from LangGraph
    const response = await fetch(getLangGraphUrl('/threads/search'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, limit: 100, order: 'desc' })
    })

    if (!response.ok) {
      return c.json(
        { error: 'Failed to fetch threads', message: await response.text() },
        response.status
      )
    }

    let threads = await response.json()

    // Server-side filter by user_id in metadata
    if (Array.isArray(threads)) {
      threads = threads.filter((thread: any) =>
        userId && thread.metadata?.user_id === userId
      )
    }

    return c.json(threads)
  } catch (error) {
    console.error('Thread search error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isConnectionError = error instanceof Error && (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('fetch failed') ||
      error.name === 'TypeError'
    )

    return c.json(
      { 
        error: isConnectionError 
          ? 'Cannot connect to LangGraph service' 
          : 'Internal server error'
      },
      isConnectionError ? 503 : 500
    )
  }
})

// GET /api/threads/:threadId/runs - List runs
threadsRoutes.get('/:threadId/runs', async (c) => {
  const { threadId } = c.req.param()
  const { searchParams } = new URL(c.req.url)
  const query = searchParams.toString()
  const path = `/threads/${threadId}/runs${query ? `?${query}` : ''}`
  return proxyToLangGraph(c, path)
})

// POST /api/threads/:threadId/runs - Create run (inject userRole)
threadsRoutes.post('/:threadId/runs', async (c) => {
  const { threadId } = c.req.param()
  const session = await getSession(c)
  const userRole = session?.user?.role ?? 'guest'
  
  return proxyToLangGraph(c, `/threads/${threadId}/runs`, { userRole })
})

// POST /api/threads/:threadId/runs/stream - Stream thread run events
threadsRoutes.post('/:threadId/runs/stream', async (c) => {
  const { threadId } = c.req.param()
  const session = await getSession(c)
  const userRole = session?.user?.role ?? 'guest'
  
  return proxyToLangGraph(c, `/threads/${threadId}/runs/stream`, { 
    streaming: true,
    userRole,
  })
})

// POST /api/threads/:threadId/runs/:runId/stream - Stream specific run
threadsRoutes.post('/:threadId/runs/:runId/stream', async (c) => {
  const { threadId, runId } = c.req.param()
  const session = await getSession(c)
  const userRole = session?.user?.role ?? 'guest'
  
  return proxyToLangGraph(c, `/threads/${threadId}/runs/${runId}/stream`, { 
    streaming: true,
    userRole,
  })
})

// All other thread routes - transparent proxy with userId injection
threadsRoutes.all('/:threadId/*', async (c) => {
  const session = await getSession(c)
  const userId = session?.user?.id
  const userRole = session?.user?.role || 'guest'

  const path = c.req.path.replace('/api/threads', '/threads')
  return proxyToLangGraph(c, path, { userId, userRole })
})

export default threadsRoutes
