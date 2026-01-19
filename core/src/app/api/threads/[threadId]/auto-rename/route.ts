import { NextRequest, NextResponse } from 'next/server'
import { handleAutoRename } from '@/lib/api/thread-auto-rename'
import { requireAuth } from '@/lib/auth/server-helpers'
import { logger } from '@/lib/logging/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const authUser = await requireAuth()
    if (!authUser) return NextResponse.json({ error: 'Session required' }, { status: 403 })

    const { threadId } = await params
    const body = await request.json().catch(() => ({}))
    return handleAutoRename(threadId, body)
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'Failed to perform auto-rename');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
