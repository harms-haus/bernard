import { NextRequest, NextResponse } from 'next/server'
import { proxyToLangGraph } from '@/lib/langgraph/proxy'

export const dynamic = 'force-dynamic'

/**
 * Proxy to LangGraph server's /info endpoint.
 * This is called by the LangGraph SDK to fetch server metadata.
 */
export async function GET(request: NextRequest) {
  return proxyToLangGraph(request, '/info')
}
