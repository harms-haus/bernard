import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/server-helpers';
import { logger } from '@/lib/logging/logger';
import { getUserStore } from '@/lib/auth/userStore';
import { SettingsManager } from '@/lib/config/appSettings';

function getSettingsManager() {
  return SettingsManager.getInstance();
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const store = getUserStore();
    const users = await store.list();

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

    const settings = await getSettingsManager().getLimits();
    if (!settings.allowUserCreation) {
      return NextResponse.json({ error: 'User creation is disabled' }, { status: 403 });
    }

    const body = await request.json() as { id: string; displayName: string; isAdmin: boolean };
    const { id, displayName, isAdmin } = body;

    if (!id || !displayName || typeof isAdmin !== 'boolean') {
      return NextResponse.json({ error: 'id, displayName, and isAdmin are required' }, { status: 400 });
    }

    const store = getUserStore();
    const user = await store.create({ id, displayName, isAdmin });

    logger.info({ action: 'users.create', adminId: session.user.id, userId: user.id });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create user';
    logger.error({ error }, 'Failed to create user');
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
