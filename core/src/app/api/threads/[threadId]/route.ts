import { NextRequest } from 'next/server'
import { proxyToLangGraph } from '@/lib/langgraph/proxy'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params
  return proxyToLangGraph(request, `/threads/${threadId}`)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params
  return proxyToLangGraph(request, `/threads/${threadId}`, { method: 'DELETE' })
}
