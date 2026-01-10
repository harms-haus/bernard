import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/helpers';
import { logger } from '@/lib/logging/logger';
import { TaskRecordKeeper } from '@/lib/infra';
import { getRedis } from '@/lib/infra';

function getTaskKeeper() {
  return new TaskRecordKeeper(getRedis());
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await requireAuth(request);
    if (authUser instanceof NextResponse) return authUser;

    const { id } = await params;
    const keeper = getTaskKeeper();

    const result = await keeper.recallTask(id);
    if (!result) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to get task');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
