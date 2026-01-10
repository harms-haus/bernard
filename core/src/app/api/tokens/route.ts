import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/helpers';
import { logger } from '@/lib/logging/logger';
import { TokenStore } from '@/lib/auth/tokenStore';
import { getRedis } from '@/lib/infra/redis';

function getTokenStore() {
  return new TokenStore(getRedis());
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const store = getTokenStore();
    const tokens = await store.list();

    const sanitizedTokens = tokens.map(({ token, ...rest }) => {
      void token;
      return { ...rest, status: rest.status === 'revoked' ? 'disabled' : rest.status };
    });

    logger.info({ action: 'tokens.read', adminId: admin.user.id, count: tokens.length });
    return NextResponse.json({ tokens: sanitizedTokens });
  } catch (error) {
    logger.error({ error }, 'Failed to list tokens');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (admin instanceof NextResponse) return admin;

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
