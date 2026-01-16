import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/server-helpers';
import { logger } from '@/lib/logging/logger';
import { getTokenStore } from '@/lib/auth/tokenStore';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    if (!session) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { id } = await params;
    const store = getTokenStore();
    const token = await store.get(id);

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    const { token: _secret, ...result } = token;
    void _secret;
    logger.info({ action: 'tokens.read_one', adminId: session.user.id, tokenId: id });
    return NextResponse.json({ token: { ...result, status: result.status === 'revoked' ? 'disabled' : result.status } });
  } catch (error) {
    logger.error({ error }, 'Failed to get token');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    if (!session) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { id } = await params;
    const body = await request.json() as { name?: string; status?: 'active' | 'disabled' };
    const { name, status } = body;

    if (!name && !status) {
      return NextResponse.json({ error: 'At least one field (name or status) is required' }, { status: 400 });
    }

    const store = getTokenStore();
    const updates: { name?: string; status?: 'active' | 'revoked' } = {};

    if (name) updates.name = name;
    if (status) updates.status = status === 'disabled' ? 'revoked' : 'active';

    const updated = await store.update(id, updates);

    if (!updated) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    logger.info({ action: 'tokens.update', adminId: session.user.id, tokenId: id, updates });
    const { token: _secret, ...result } = updated;
    void _secret;
    return NextResponse.json({ token: { ...result, status: result.status === 'revoked' ? 'disabled' : result.status } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update token';
    logger.error({ error }, 'Failed to update token');
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    if (!session) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { id } = await params;
    const store = getTokenStore();
    const deleted = await store.delete(id);

    if (!deleted) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    logger.info({ action: 'tokens.delete', adminId: session.user.id, tokenId: id });
    return NextResponse.json({}, { status: 204 });
  } catch (error) {
    logger.error({ error }, 'Failed to delete token');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
