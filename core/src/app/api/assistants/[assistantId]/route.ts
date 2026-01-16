import { NextRequest } from 'next/server'
import { proxyToLangGraph } from '@/lib/langgraph/proxy'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assistantId: string }> }
) {
  const { assistantId } = await params
  return proxyToLangGraph(request, `/assistants/${assistantId}`)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ assistantId: string }> }
) {
  const { assistantId } = await params
  return proxyToLangGraph(request, `/assistants/${assistantId}`, { method: 'DELETE' })
}
