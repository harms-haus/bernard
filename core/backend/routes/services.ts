import { Hono } from 'hono'
import { getServiceManager } from '../../src/lib/api/factory'
import { ok, error } from '../../src/lib/api/response'
import { requireAuth } from '../utils/auth'
import { handleGetService, handleServiceCommand } from '../../src/lib/api/services-dynamic'

const servicesRoutes = new Hono()

// GET /api/services - List all service statuses
servicesRoutes.get('/', async (c) => {
  try {
    const session = await requireAuth(c)
    if (!session) return c.json({ error: 'Session required' }, 403)

    const manager = getServiceManager()
    const statuses = await manager.getAllStatus()
    return c.json(ok(statuses).data, ok(statuses).status)
  } catch {
    return c.json(error('Failed to get service status', 500).data, 500)
  }
})

// GET /api/services/:service - Get service status
servicesRoutes.get('/:service', async (c) => {
  const session = await requireAuth(c)
  if (!session) return c.json(error('Session required', 401).data, 401)
  const { service } = c.req.param()
  const response = await handleGetService(service)
  return c.body(await response.text(), response.status, Object.fromEntries(response.headers.entries()))
})

// POST /api/services/:service - Execute service command
servicesRoutes.post('/:service', async (c) => {
  const session = await requireAuth(c)
  if (!session) return c.json(error('Session required', 401).data, 401)
  const { service } = c.req.param()
  const body = await c.req.json().catch(() => ({}))
  const response = await handleServiceCommand(service, body)
  return c.body(await response.text(), response.status, Object.fromEntries(response.headers.entries()))
})

export default servicesRoutes
