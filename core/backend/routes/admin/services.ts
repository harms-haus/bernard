import { Hono } from 'hono'
import { requireAdmin } from '../../utils/auth'
import { getSettingsStore, ServicesSettingsSchema, initializeSettingsStore } from '../../../src/lib/config/settingsStore'
import { getRedis } from '../../../src/lib/infra/redis'
import { error, ok, badRequest } from '../../../src/lib/api/response'
import { logger } from '../../../src/lib/logging/logger'

let initialized = false

async function getStore() {
  if (!initialized) {
    await initializeSettingsStore(undefined, getRedis())
    initialized = true
  }
  return getSettingsStore()
}

const servicesRoutes = new Hono()

// GET /api/admin/services - Get services settings
servicesRoutes.get('/', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json(error('Admin required', 403).data, 403)

  const store = await getStore()
  const services = await store.getServices()
  return c.json(ok(services).data, ok(services).status)
})

// PUT /api/admin/services - Update services settings
servicesRoutes.put('/', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json(error('Admin required', 403).data, 403)

  try {
    const body = await c.req.json()
    const parsed = ServicesSettingsSchema.safeParse(body)

    if (!parsed.success) {
      return c.json(badRequest(parsed.error.issues.map(i => i.message).join(', ')).data, badRequest('').status)
    }

    const store = await getStore()
    const saved = await store.setServices(parsed.data)
    return c.json(ok(saved).data, ok(saved).status)
  } catch (e) {
    logger.error({ error: (e as Error).message }, 'Failed to save services settings')
    return c.json(error('Failed to save services settings', 500).data, 500)
  }
})

export default servicesRoutes
