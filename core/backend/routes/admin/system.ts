import { Hono } from 'hono'
import { requireAdmin } from '../../utils/auth'
import { getSettingsStore, initializeSettingsStore } from '../../../src/lib/config/settingsStore'
import { getRedis } from '../../../src/lib/infra/redis'

let initialized = false

async function getStore() {
  if (!initialized) {
    await initializeSettingsStore(undefined, getRedis())
    initialized = true
  }
  return getSettingsStore()
}

const systemRoutes = new Hono()

// GET /api/admin/system/limits - Get system limits
systemRoutes.get('/limits', async (c) => {
  const session = await requireAdmin(c)
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  const store = await getStore()
  const limits = await store.getLimits()
  return c.json({ limits })
})

// GET /api/admin/system/backups - Get backups
systemRoutes.get('/backups', async (c) => {
  const session = await requireAdmin(c)
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  const store = await getStore()
  const backups = await store.getBackups()
  return c.json({ backups: backups || [] })
})

// GET /api/admin/system/oauth - Get OAuth configuration
systemRoutes.get('/oauth', async (c) => {
  const session = await requireAdmin(c)
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  const store = await getStore()
  const oauth = await store.getOAuth()
  return c.json({ oauth })
})

export default systemRoutes
