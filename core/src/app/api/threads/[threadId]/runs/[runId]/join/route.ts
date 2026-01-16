import { NextRequest } from 'next/server'
import { proxyToLangGraph } from '@/lib/langgraph/proxy'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string; runId: string }> }
) {
  const { threadId, runId } = await params
  return proxyToLangGraph(request, `/threads/${threadId}/runs/${runId}/join`)
}
