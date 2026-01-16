import { NextRequest } from 'next/server'
import { proxyToLangGraph } from '@/lib/langgraph/proxy'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params
  const { searchParams } = new URL(request.url)
  const query = searchParams.toString()
  const path = `/threads/${threadId}/runs${query ? `?${query}` : ''}`
  return proxyToLangGraph(request, path)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params
  return proxyToLangGraph(request, `/threads/${threadId}/runs`)
}
