import { NextRequest, NextResponse } from 'next/server'
import { proxyToLangGraph, getLangGraphUrl } from '@/lib/langgraph/proxy'
import { getSession } from '@/lib/auth/server-helpers'
import { logger } from '@/lib/logging/logger'

export const dynamic = 'force-dynamic'

async function verifyThreadOwnership(threadId: string, userId: string): Promise<{ isOwner: boolean; thread: Record<string, unknown> | null }> {
  try {
    const response = await fetch(getLangGraphUrl(`/threads/${threadId}`), {
      method: 'GET',
      headers: { 'content-type': 'application/json' }
    })

    if (!response.ok) {
      logger.warn({ threadId, status: response.status }, 'Failed to fetch thread');
      return { isOwner: false, thread: null }
    }

    const thread = await response.json()

    // Check if thread belongs to user (thread.user_id or thread.metadata?.user_id)
    const isOwner = thread.user_id === userId || thread.metadata?.user_id === userId
    return { isOwner, thread }
  } catch (error) {
    logger.warn({ threadId, error: (error as Error).message }, 'Error checking ownership');
    return { isOwner: false, thread: null }
  }
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

  // Verify ownership before allowing access
  const { isOwner } = await verifyThreadOwnership(threadId, userId)
  if (!isOwner) {
    logger.info({ threadId, userId }, 'Thread access denied - not owner');
    return NextResponse.json({ error: 'Not authorized to view this thread' }, { status: 403 })
  }
  return proxyToLangGraph(request, `/threads/${threadId}`)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params
  const session = await getSession()
  const userId = session?.user?.id

  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  // Verify ownership before delete
  const { isOwner } = await verifyThreadOwnership(threadId, userId)
  if (!isOwner) {
    logger.info({ threadId, userId }, 'Thread delete denied - not owner');
    return NextResponse.json({ error: 'Not authorized to delete this thread' }, { status: 403 })
  }

  return proxyToLangGraph(request, `/threads/${threadId}`, { method: 'DELETE' })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params
  const session = await getSession()
  const userId = session?.user?.id

  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  // Verify ownership before rename
  const { isOwner } = await verifyThreadOwnership(threadId, userId)
  if (!isOwner) {
    logger.info({ threadId, userId }, 'Thread rename denied - not owner');
    return NextResponse.json({ error: 'Not authorized to rename this thread' }, { status: 403 })
  }

  return proxyToLangGraph(request, `/threads/${threadId}`, { method: 'PATCH', userId })
}
