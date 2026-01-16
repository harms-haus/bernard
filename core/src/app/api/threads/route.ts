import { NextRequest } from 'next/server'
import { proxyToLangGraph } from '@/lib/langgraph/proxy'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.toString()
  const path = `/threads${query ? `?${query}` : ''}`
  return proxyToLangGraph(request, path)
}

export async function POST(request: NextRequest) {
  return proxyToLangGraph(request, '/threads')
}
