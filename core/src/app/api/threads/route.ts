import { NextRequest } from 'next/server'
import { proxyToLangGraph } from '@/lib/langgraph/proxy'
import { getSession } from '@/lib/auth/server-helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getSession()
  const userId = session?.user?.id

  const { searchParams } = new URL(request.url)

  // Remove any existing user_id from searchParams to prevent authorization bypass
  // and duplicate entries - only use the trusted authenticated user_id
  const sanitizedParams = new URLSearchParams(searchParams)
  sanitizedParams.delete("user_id")

  const query = sanitizedParams.toString()

  // Add user_id filter with the trusted authenticated userId
  const path = `/threads${query ? `?${query}&user_id=${userId}` : `?user_id=${userId}`}`
  return proxyToLangGraph(request, path)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  const userId = session?.user?.id

  // Pass userId to inject into request body for thread creation
  return proxyToLangGraph(request, '/threads', { userId })
}
