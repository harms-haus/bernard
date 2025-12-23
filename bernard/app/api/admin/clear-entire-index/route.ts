import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/app/api/_lib/admin';
import { clearEntireIndex } from '@/app/api/_lib/embeddingIndex';

export async function POST(req: NextRequest) {
  const auth = await requireAdminRequest(req);
  if ('error' in auth) return auth.error;

  const { reqLog } = auth;

  try {
    reqLog.log.info({ event: 'clear-entire-index.start' });

    const result = await clearEntireIndex();

    reqLog.log.info({
      event: 'clear-entire-index.completed',
      success: result.success,
      conversationsQueued: result.conversationsQueued,
      keysDeleted: result.keysDeleted
    });

    reqLog.success(200);
    return NextResponse.json(result);
  } catch (error) {
    reqLog.log.error({
      event: 'clear-entire-index.failed',
      error: error instanceof Error ? error.message : String(error)
    });
    reqLog.failure(500, 'Failed to clear entire index');
    return NextResponse.json(
      { error: 'Failed to clear entire index' },
      { status: 500 }
    );
  }
}
