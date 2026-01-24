import { Hono } from 'hono'
import { requireAdmin } from '../../utils/auth'
import { BackupSettingsSchema, getSettingsStore, initializeSettingsStore } from '../../../src/lib/config/settingsStore'
import { getRedis } from '../../../src/lib/infra/redis'

let initialized = false

async function getStore() {
  if (!initialized) {
    await initializeSettingsStore(undefined, getRedis())
    initialized = true
  }
  return getSettingsStore()
}

const backupsRoutes = new Hono()

// GET /api/admin/backups - Get backups settings
backupsRoutes.get('/', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin access required' }, 403)

  const store = await getStore()
  const backups = await store.getBackups()
  return c.json(backups || {})
})

// PUT /api/admin/backups - Update backups settings
backupsRoutes.put('/', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin access required' }, 403)

  const body = await c.req.json()
  const parsed = BackupSettingsSchema.parse(body)
  const store = await getStore()
  await store.setBackups(parsed)
  return c.json(parsed)
})

export default backupsRoutes
