import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/server-helpers';
import { logger } from '@/lib/logging/logger';
import { getRedis } from '@/lib/infra/redis';
import type { UserRecord, UserRole } from '@/lib/auth/types';

type UserStatus = 'active' | 'disabled' | 'deleted';

function betterAuthUserKey(id: string) {
  return `ba:m:user:${id}`;
}

async function getBetterAuthUser(id: string): Promise<UserRecord | null> {
  const redis = getRedis();
  const data = await redis.hgetall(betterAuthUserKey(id));
  if (!data || Object.keys(data).length === 0) return null;

  const user: UserRecord = {
    id: data.id || id,
    displayName: data.name || data.email || id,
    role: (data.role as UserRole) || 'user',
    status: data.emailVerified ? 'active' : 'disabled',
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || data.createdAt || new Date().toISOString(),
    email: data.email,
    avatarUrl: data.image,
  };

  return user;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin()
    if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

    const { id } = await params;
    const user = await getBetterAuthUser(id);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    logger.info({ action: 'users.read_one', adminId: admin, userId: id });
    return NextResponse.json({ user });
  } catch (error) {
    logger.error({ error }, 'Failed to get user');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin()
    if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

    const { id } = await params;
    const body = await request.json() as { displayName?: string; role?: UserRole; status?: UserStatus };
    const { displayName, role, status } = body;

    if (!displayName && role === undefined && !status) {
      return NextResponse.json({ error: 'At least one field is required' }, { status: 400 });
    }

    const redis = getRedis();
    const key = betterAuthUserKey(id);
    const existing = await redis.hgetall(key);
    if (!existing || !existing['id']) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updates: Record<string, string> = { updatedAt: new Date().toISOString() };
    if (displayName) updates['name'] = displayName;
    if (role !== undefined) updates['role'] = role;
    if (status) {
      // For status, we update emailVerified field
      updates['emailVerified'] = status === 'active' ? 'true' : '';
    }

    await redis.hset(key, updates);

    const updated = await getBetterAuthUser(id);
    if (!updated) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    logger.info({ action: 'users.update', adminId: admin, userId: id, updates });
    return NextResponse.json({ user: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update user';
    logger.error({ error }, 'Failed to update user');
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin()
    if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

    const { id } = await params;
    const redis = getRedis();
    const key = betterAuthUserKey(id);
    const existing = await redis.hgetall(key);

    if (!existing || !existing['id']) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Actually delete the user from Redis
    await redis.del(key);

    logger.info({ action: 'users.delete', adminId: admin, userId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to delete user');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
