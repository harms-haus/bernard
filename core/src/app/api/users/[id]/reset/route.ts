import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/server-helpers';
import { logger } from '@/lib/logging/logger';
import { getRedis } from '@/lib/infra/redis';

function betterAuthUserKey(id: string) {
  return `ba:m:user:${id}`;
}

async function userExists(id: string): Promise<boolean> {
  const redis = getRedis();
  const data = await redis.hgetall(betterAuthUserKey(id));
  return !!(data && data['id']);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

    const { id } = await params;
    const exists = await userExists(id);

    if (!exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    logger.info({ action: 'users.reset', adminId: admin, userId: id });
    return NextResponse.json({ success: true, message: 'User reset' });
  } catch (error) {
    logger.error({ error }, 'Failed to reset user');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
