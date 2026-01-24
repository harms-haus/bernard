import { Hono } from 'hono'
import { requireAdmin } from '../../utils/auth'
import { ModelsSettingsSchema, getSettingsStore, initializeSettingsStore } from '../../../src/lib/config/settingsStore'
import { getRedis } from '../../../src/lib/infra/redis'

let initialized = false

async function getStore() {
  if (!initialized) {
    await initializeSettingsStore(undefined, getRedis())
    initialized = true
  }
  return getSettingsStore()
}

const modelsRoutes = new Hono()

// GET /api/admin/models - Get models settings
modelsRoutes.get('/', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin access required' }, 403)

  const store = await getStore()
  const models = await store.getModels()
  return c.json(models)
})

// PUT /api/admin/models - Update models settings
modelsRoutes.put('/', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin access required' }, 403)

  const body = await c.req.json()
  const parsed = ModelsSettingsSchema.parse(body)
  const store = await getStore()
  const saved = await store.setModels(parsed)
  return c.json(saved)
})

export default modelsRoutes
