import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/server-helpers';
import { logger } from '@/lib/logging/logger';
import { getSettingsStore, initializeSettingsStore } from '@/lib/config/settingsStore';
import { getRedis } from '@/lib/infra/redis';

let initialized = false;

async function getStore() {
  if (!initialized) {
    await initializeSettingsStore(undefined, getRedis());
    initialized = true;
  }
  return getSettingsStore();
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const resolvedParams = await params;
    const { id } = resolvedParams;
    const store = await getStore();
    const providers = await store.getProviders();
    const provider = providers.find((p: { id: string }) => p.id === id);

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    return NextResponse.json(provider);
  } catch (error) {
    logger.error({ error }, 'Failed to get provider');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { id } = await params;
    const body = await request.json() as { name?: string; baseUrl?: string; apiKey?: string };

    const store = await getStore();
    const updatedProvider = await store.updateProvider(id, body);

    if (!updatedProvider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    logger.info({ action: 'providers.update', adminId: admin.user.id, providerId: id });
    return NextResponse.json(updatedProvider);
  } catch (error) {
    logger.error({ error }, 'Failed to update provider');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { id } = await params;
    const store = await getStore();
    const deleted = await store.deleteProvider(id);

    if (!deleted) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    logger.info({ action: 'providers.delete', adminId: admin.user.id, providerId: id });
    return NextResponse.json({}, { status: 204 });
  } catch (error) {
    logger.error({ error }, 'Failed to delete provider');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
