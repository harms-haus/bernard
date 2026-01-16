import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/server-helpers';
import { logger } from '@/lib/logging/logger';
import { SettingsStore } from '@/lib/config/settingsStore';

function getSettingsStore() {
  return new SettingsStore();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    if (!session) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { id } = await params;
    const store = getSettingsStore();
    const providers = await store.getProviders();
    const provider = providers.find((p: { id: string }) => p.id === id);

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    const testResult = await store.testProviderConnection(provider);

    logger.info({
      action: 'providers.test',
      adminId: session.user.id,
      providerId: id,
      status: testResult.status
    });

    return NextResponse.json({
      ...testResult,
      testedAt: new Date().toISOString()
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error }, 'Failed to test provider');
    return NextResponse.json({
      status: 'failed',
      error: errorMessage,
      testedAt: new Date().toISOString()
    }, { status: 500 });
  }
}
