import { NextRequest, NextResponse } from 'next/server'
import { proxyToLangGraph, getLangGraphUrl } from '@/lib/langgraph/proxy'
import { getSession } from '@/lib/auth/server-helpers'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = await getSession()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))

  // Fetch all threads from LangGraph
  const response = await fetch(getLangGraphUrl('/threads/search'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, limit: 100, order: 'desc' })
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch threads', message: await response.text() },
      { status: response.status }
    )
  }

  let threads = await response.json()

  // Server-side filter by user_id in metadata
  if (Array.isArray(threads)) {
    threads = threads.filter((thread: any) =>
      userId && thread.metadata?.user_id === userId
    )
  }

  return NextResponse.json(threads)
}
