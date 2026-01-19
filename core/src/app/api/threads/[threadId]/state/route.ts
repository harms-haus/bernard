import { NextRequest, NextResponse } from 'next/server'
import { proxyToLangGraph, getLangGraphUrl } from '@/lib/langgraph/proxy'
import { getSession } from '@/lib/auth/server-helpers'

export const dynamic = 'force-dynamic'

async function verifyThreadOwnership(threadId: string, userId: string): Promise<{ isOwner: boolean; thread: Record<string, unknown> | null }> {
  try {
    const response = await fetch(getLangGraphUrl(`/threads/${threadId}`), {
      method: 'GET',
      headers: { 'content-type': 'application/json' }
    })

    if (!response.ok) {
      return { isOwner: false, thread: null }
    }

    const thread = await response.json()
    const isOwner = thread.user_id === userId || thread.metadata?.user_id === userId
    return { isOwner, thread }
  } catch {
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
    return NextResponse.json({ error: 'Not authorized to view this thread' }, { status: 403 })
  }

  return proxyToLangGraph(request, `/threads/${threadId}/state`)
}

export async function PUT(
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
    return NextResponse.json({ error: 'Not authorized to modify this thread' }, { status: 403 })
  }

  return proxyToLangGraph(request, `/threads/${threadId}/state`, { method: 'PUT' })
}
