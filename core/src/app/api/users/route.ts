import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/server-helpers';
import { logger } from '@/lib/logging/logger';
import { getRedis } from '@/lib/infra/redis';
import type { UserRecord, UserRole } from '@/lib/auth/types';

// BetterAuth stores users at:
// - ba:s:user:ids (set of user IDs)
// - ba:m:user:{id} (hash of user data)

function betterAuthUserKey(id: string) {
  return `ba:m:user:${id}`;
}

function betterAuthUserIdsKey() {
  return `ba:s:user:ids`;
}

async function getBetterAuthUsers(): Promise<UserRecord[]> {
  const redis = getRedis();
  const userIds = await redis.smembers(betterAuthUserIdsKey());

  const users = await Promise.all(
    userIds.map(async (id) => {
      const data = await redis.hgetall(betterAuthUserKey(id));
      if (!data || Object.keys(data).length === 0) return null;

      // Transform BetterAuth user to UserRecord format
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
    })
  );

  return users.filter((u): u is UserRecord => u !== null);
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const users = await getBetterAuthUsers();

    logger.info({ action: 'users.read', adminId: session, count: users.length });
    return NextResponse.json({ users });
  } catch (error) {
    logger.error({ error }, 'Failed to list users');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json() as { id: string; displayName: string; role: UserRole };
    const { id, displayName, role } = body;

    if (!id || !displayName || !role) {
      return NextResponse.json({ error: 'id, displayName, and role are required' }, { status: 400 });
    }

    const redis = getRedis();
    const key = betterAuthUserKey(id);
    const existing = await redis.hgetall(key);
    if (existing && existing['id']) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }

    const now = new Date().toISOString();
    await redis.hset(key, {
      id,
      name: displayName,
      email: id,
      role: role,
      emailVerified: '',
      createdAt: now,
      updatedAt: now,
      image: '',
    });
    await redis.sadd(betterAuthUserIdsKey(), id);

    const user: UserRecord = {
      id,
      displayName,
      role,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      email: id,
    };

    logger.info({ action: 'users.create', adminId: session.user?.id || session, userId: user.id });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create user';
    logger.error({ error }, 'Failed to create user');
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
