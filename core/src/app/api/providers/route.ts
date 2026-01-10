import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/helpers';
import { logger } from '@/lib/logging/logger';
import { SettingsStore } from '@/lib/config/settingsStore';

function getSettingsStore() {
  return new SettingsStore();
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const store = getSettingsStore();
    const providers = await store.getProviders();
    logger.info({ action: 'providers.read', adminId: admin.user.id, count: providers.length });
    return NextResponse.json(providers);
  } catch (error) {
    logger.error({ error }, 'Failed to get providers');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (admin instanceof NextResponse) return admin;

    const body = await request.json() as { name: string; baseUrl: string; apiKey: string; type?: 'openai' | 'ollama' };
    const { name, baseUrl, apiKey, type = 'openai' } = body;

    if (!name || !baseUrl || !apiKey) {
      return NextResponse.json({ error: 'name, baseUrl, and apiKey are required' }, { status: 400 });
    }

    const store = getSettingsStore();
    const models = await store.getModels();
    const providers = models.providers || [];

    if (providers.some((p: { name: string }) => p.name === name)) {
      return NextResponse.json({ error: 'Provider with this name already exists' }, { status: 400 });
    }

    const newProvider = await store.addProvider({ name, baseUrl, apiKey, type });
    logger.info({ action: 'providers.create', adminId: admin.user.id, providerId: newProvider.id });
    return NextResponse.json(newProvider, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Failed to create provider');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
