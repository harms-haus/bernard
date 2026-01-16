import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/server-helpers';
import { logger } from '@/lib/logging/logger';
import { getTokenStore } from '@/lib/auth/tokenStore';
import { ok, error } from '@/lib/api/response';

export async function GET(_request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return error("Admin required", 403)

    const store = getTokenStore();
    const tokens = await store.list();

    const sanitizedTokens = tokens.map(({ token, ...rest }) => {
      void token;
      return { ...rest, status: rest.status === 'revoked' ? 'disabled' : rest.status };
    });

    logger.info({ action: 'tokens.read', adminId: admin.user.id, count: tokens.length });
    return ok(sanitizedTokens)
  } catch (e) {
    logger.error({ error: e }, 'Failed to list tokens');
    return error("Failed to list tokens", 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return error("Admin required", 403)

    const body = await request.json() as { name: string };
    const { name } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Token name is required' }, { status: 400 });
    }

    const store = getTokenStore();
    const record = await store.create(name);

    logger.info({ action: 'tokens.create', adminId: admin.user.id, tokenId: record.id, name: record.name });
    return NextResponse.json({
      token: {
        id: record.id,
        name: record.name,
        status: record.status,
        createdAt: record.createdAt,
        token: record.token
      }
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create token';
    logger.error({ error }, 'Failed to create token');
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
