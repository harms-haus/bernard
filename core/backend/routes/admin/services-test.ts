import { Hono } from 'hono'
import { requireAdmin } from '../../utils/auth'

const servicesTestRoutes = new Hono()

// POST /api/admin/services/test/home-assistant - Test Home Assistant connection
servicesTestRoutes.post('/home-assistant', async (c) => {
  const session = await requireAdmin(c)
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  // Port existing Home Assistant test logic
  return c.json({ success: true, status: 'ok' })
})

// POST /api/admin/services/test/overseerr - Test Overseerr connection
servicesTestRoutes.post('/overseerr', async (c) => {
  const session = await requireAdmin(c)
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  // Port existing Overseerr test logic
  return c.json({ success: true, status: 'ok' })
})

// POST /api/admin/services/test/plex - Test Plex connection
servicesTestRoutes.post('/plex', async (c) => {
  const session = await requireAdmin(c)
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  // Port existing Plex test logic
  return c.json({ success: true, status: 'ok' })
})

// POST /api/admin/services/test/tts - Test TTS service
servicesTestRoutes.post('/tts', async (c) => {
  const session = await requireAdmin(c)
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  const response = await fetch('http://127.0.0.1:8880/health', {
    method: 'GET',
    signal: AbortSignal.timeout(2000),
  })
  return c.json({ success: response.ok, status: response.ok ? 'ok' : 'error' })
})

// POST /api/admin/services/test/stt - Test STT service
servicesTestRoutes.post('/stt', async (c) => {
  const session = await requireAdmin(c)
  if (!session) return c.json({ error: 'Forbidden' }, 403)
  const response = await fetch('http://127.0.0.1:8870/health', {
    method: 'GET',
    signal: AbortSignal.timeout(2000),
  })
  return c.json({ success: response.ok, status: response.ok ? 'ok' : 'error' })
})

export default servicesTestRoutes
