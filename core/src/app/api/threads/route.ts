import { NextRequest } from 'next/server'
import { proxyToLangGraph } from '@/lib/langgraph/proxy'
import { getSession } from '@/lib/auth/server-helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getSession()
  const userId = session?.user?.id

  const { searchParams } = new URL(request.url)
  const query = searchParams.toString()

  // Add user_id filter if user is authenticated
  const path = `/threads${query ? `?${query}${userId ? `&user_id=${userId}` : ''}` : userId ? `?user_id=${userId}` : ''}`
  return proxyToLangGraph(request, path)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  const userId = session?.user?.id

  // Pass userId to inject into request body for thread creation
  return proxyToLangGraph(request, '/threads', { userId })
}
