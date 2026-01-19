import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/server-helpers'
import { getSettingsStore, ServicesSettingsSchema, initializeSettingsStore } from '@/lib/config/settingsStore'
import { getRedis } from '@/lib/infra/redis'
import { error, ok, badRequest } from '@/lib/api/response'
import { logger } from '@/lib/logging/logger';

let initialized = false;

async function getStore() {
  if (!initialized) {
    await initializeSettingsStore(undefined, getRedis());
    initialized = true;
  }
  return getSettingsStore();
}

export async function GET(_request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return error("Admin required", 403)

  const store = await getStore()
  const services = await store.getServices()
  return ok(services)
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return error("Admin required", 403)

  try {
    const body = await request.json()
    const parsed = ServicesSettingsSchema.safeParse(body)

    if (!parsed.success) {
      return badRequest(parsed.error.issues.map(i => i.message).join(', '))
    }

    const store = await getStore()
    const saved = await store.setServices(parsed.data)
    return ok(saved)
  } catch (e) {
    logger.error({ error: (e as Error).message }, 'Failed to save services settings');
    return error('Failed to save services settings', 500)
  }
}
