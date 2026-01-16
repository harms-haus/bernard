import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/server-helpers';
import { logger } from '@/lib/logging/logger';
import { getUserStore } from '@/lib/auth/userStore';

type UserStatus = 'active' | 'disabled' | 'deleted';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin()
    if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

    const { id } = await params;
    const store = getUserStore();
    const user = await store.get(id);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    logger.info({ action: 'users.read_one', adminId: admin.user.id, userId: id });
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
    const body = await request.json() as { displayName?: string; isAdmin?: boolean; status?: UserStatus };
    const { displayName, isAdmin, status } = body;

    if (!displayName && isAdmin === undefined && !status) {
      return NextResponse.json({ error: 'At least one field is required' }, { status: 400 });
    }

    const store = getUserStore();
    const updates: { displayName?: string; isAdmin?: boolean; status?: UserStatus } = {};

    if (displayName) updates.displayName = displayName;
    if (isAdmin !== undefined) updates.isAdmin = isAdmin;
    if (status) updates.status = status;

    const updated = await store.update(id, updates);

    if (!updated) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    logger.info({ action: 'users.update', adminId: admin.user.id, userId: id, updates });
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
    const store = getUserStore();
    const deleted = await store.delete(id);

    if (!deleted) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    logger.info({ action: 'users.delete', adminId: admin.user.id, userId: id });
    return NextResponse.json({ user: deleted });
  } catch (error) {
    logger.error({ error }, 'Failed to delete user');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
