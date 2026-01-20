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

  try {
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
  } catch (error) {
    console.error('Thread search error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isConnectionError = error instanceof Error && (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('fetch failed') ||
      error.name === 'TypeError'
    )

    return NextResponse.json(
      { 
        error: isConnectionError 
          ? 'Cannot connect to LangGraph service' 
          : 'Internal server error'
      },
      { status: isConnectionError ? 503 : 500 }
    )
  }
}
