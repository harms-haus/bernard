import { NextRequest, NextResponse } from 'next/server'
import { proxyToLangGraph, getLangGraphUrl } from '@/lib/langgraph/proxy'
import { getSession } from '@/lib/auth/server-helpers'
import { logger } from '@/lib/logging/logger'

export const dynamic = 'force-dynamic'

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

  return proxyToLangGraph(request, `/threads/${threadId}/history`)
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

  return proxyToLangGraph(request, `/threads/${threadId}/history`)
}
