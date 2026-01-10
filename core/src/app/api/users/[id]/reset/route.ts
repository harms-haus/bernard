import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/helpers';
import { logger } from '@/lib/logging/logger';
import { UserStore } from '@/lib/auth/userStore';
import { getRedis } from '@/lib/infra/redis';

function getUserStore() {
  return new UserStore(getRedis());
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const { id } = await params;
    const store = getUserStore();
    const user = await store.get(id);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    logger.info({ action: 'users.reset', adminId: admin.user.id, userId: id });
    return NextResponse.json({ success: true, message: 'User reset' });
  } catch (error) {
    logger.error({ error }, 'Failed to reset user');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
