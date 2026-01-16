import { NextRequest } from 'next/server'
import { proxyToLangGraph } from '@/lib/langgraph/proxy'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  return proxyToLangGraph(request, '/assistants/search')
}
