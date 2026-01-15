import { NextRequest } from 'next/server'
import { handleAutoRename } from '@/lib/api/thread-auto-rename'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params
  const body = await request.json().catch(() => ({}))
  return handleAutoRename(threadId, body)
}
