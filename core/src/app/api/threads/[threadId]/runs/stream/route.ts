import { NextRequest } from 'next/server'
import { proxyToLangGraph } from '@/lib/langgraph/proxy'
import { getSession } from '@/lib/auth/server-helpers'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params
  
  // Get user session to pass role for tool filtering
  const session = await getSession()
  const userRole = session?.user?.role ?? 'guest'
  
  return proxyToLangGraph(request, `/threads/${threadId}/runs/stream`, { 
    streaming: true,
    userRole,
  })
}
