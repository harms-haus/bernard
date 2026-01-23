import { Hono } from 'hono'
import { requireAdmin } from '../../utils/auth'
import { OAuthSettingsSchema, getSettingsStore, initializeSettingsStore } from '../../../src/lib/config/settingsStore'
import { getRedis } from '../../../src/lib/infra/redis'

let initialized = false

async function getStore() {
  if (!initialized) {
    await initializeSettingsStore(undefined, getRedis())
    initialized = true
  }
  return getSettingsStore()
}

const oauthRoutes = new Hono()

// GET /api/admin/oauth - Get OAuth settings
oauthRoutes.get('/', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin access required' }, 403)

  const store = await getStore()
  const oauth = await store.getOAuth()
  return c.json(oauth)
})

// PUT /api/admin/oauth - Update OAuth settings
oauthRoutes.put('/', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ error: 'Admin access required' }, 403)

  const body = await c.req.json()
  const parsed = OAuthSettingsSchema.parse(body)
  const store = await getStore()
  await store.setOAuth(parsed)
  return c.json(parsed)
})

export default oauthRoutes
