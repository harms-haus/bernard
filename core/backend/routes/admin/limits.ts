import { Hono } from 'hono'
import { requireAdmin } from '../../utils/auth'
import { LimitsSettingsSchema, getSettingsStore, initializeSettingsStore } from '../../../src/lib/config/settingsStore'
import { getRedis } from '../../../src/lib/infra/redis'

let initialized = false

async function getStore() {
  if (!initialized) {
    await initializeSettingsStore(undefined, getRedis())
    initialized = true
  }
  return getSettingsStore()
}

const limitsRoutes = new Hono()

// GET /api/admin/limits - Get limits settings
limitsRoutes.get('/', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin access required' }, 403)

  const store = await getStore()
  const limits = await store.getLimits()
  return c.json(limits)
})

// PUT /api/admin/limits - Update limits settings
limitsRoutes.put('/', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin access required' }, 403)

  const body = await c.req.json()
  const parsed = LimitsSettingsSchema.parse(body)
  const store = await getStore()
  await store.setLimits(parsed)
  return c.json(parsed)
})

export default limitsRoutes
