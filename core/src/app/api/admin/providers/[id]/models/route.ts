import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/server-helpers';
import { logger } from '@/lib/logging/logger';
import { getSettingsStore, initializeSettingsStore } from '@/lib/config/settingsStore';
import { getRedis } from '@/lib/infra/redis';

interface OpenAIModelsResponse {
  data?: Array<{ id: string; object: string; created: number; owned_by: string }>;
}

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

    let models: Array<{ id: string; object: string; created: number; owned_by: string }> = [];
    let fetchError: string | null = null;

    const normalizedBase = provider.baseUrl.replace(/\/$/, '');
    const modelsUrl = normalizedBase.endsWith('/v1')
      ? `${normalizedBase}/models`
      : `${normalizedBase}/v1/models`;

    try {
      const response = await fetch(modelsUrl, {
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        fetchError = `Provider returned ${response.status}: ${response.statusText}${errorText ? ` - ${errorText}` : ''}`;
      } else {
        const data = await response.json() as OpenAIModelsResponse;
        models = data.data || [];
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      fetchError = `Failed to connect to provider: ${errorMessage}`;
    }

    if (fetchError) {
      logger.error({ error: fetchError, providerId: id }, 'Failed to fetch models from provider');
      return NextResponse.json({
        error: fetchError,
        providerId: id
      }, { status: 502 });
    }

    logger.info({ action: 'providers.models.read', adminId: admin.user.id, providerId: id, count: models.length });
    return NextResponse.json(models);
  } catch (error) {
    logger.error({ error }, 'Failed to get provider models');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
