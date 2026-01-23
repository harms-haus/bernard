import { Hono } from 'hono'
import { requireAdmin } from '../utils/auth'
import { logger } from '../../src/lib/logging/logger'
import { getTokenStore } from '../../src/lib/auth/tokenStore'
import { ok, error } from '../../src/lib/api/response'

const tokensRoutes = new Hono()

// GET /api/tokens - List tokens (admin only)
tokensRoutes.get('/', async (c) => {
  try {
    const admin = await requireAdmin(c)
    if (!admin) return c.json(error('Admin required', 403).data, 403)

    const store = getTokenStore()
    const tokens = await store.list()

    const sanitizedTokens = tokens.map(({ token, ...rest }) => {
      void token
      return { ...rest, status: rest.status === 'revoked' ? 'disabled' : rest.status }
    })

    logger.info({ action: 'tokens.read', adminId: admin.user.id, count: tokens.length })
    return c.json(ok(sanitizedTokens).data, ok(sanitizedTokens).status)
  } catch (e) {
    logger.error({ error: e }, 'Failed to list tokens')
    return c.json(error('Failed to list tokens', 500).data, 500)
  }
})

// POST /api/tokens - Create token (admin only)
tokensRoutes.post('/', async (c) => {
  try {
    const admin = await requireAdmin(c)
    if (!admin) return c.json(error('Admin required', 403).data, 403)

    const body = await c.req.json() as { name: string }
    const { name } = body

    if (!name || typeof name !== 'string') {
      return c.json({ error: 'Token name is required' }, 400)
    }

    const store = getTokenStore()
    const record = await store.create(name)

    logger.info({ action: 'tokens.create', adminId: admin.user.id, tokenId: record.id, name: record.name })
    return c.json({
      token: {
        id: record.id,
        name: record.name,
        status: record.status,
        createdAt: record.createdAt,
        token: record.token
      }
    }, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create token'
    logger.error({ error: err }, 'Failed to create token')
    return c.json({ error: message }, 400)
  }
})

// GET /api/tokens/:id - Get token details (admin only)
tokensRoutes.get('/:id', async (c) => {
  try {
    const admin = await requireAdmin(c)
    if (!admin) return c.json(error('Admin required', 403).data, 403)

    const { id } = c.req.param()
    const store = getTokenStore()
    const token = await store.get(id)

    if (!token) {
      return c.json(error('Token not found', 404).data, 404)
    }

    const { token: tokenValue, ...rest } = token
    void tokenValue

    return c.json(ok({ ...rest, status: rest.status === 'revoked' ? 'disabled' : rest.status }).data, ok({ ...rest }).status)
  } catch (e) {
    logger.error({ error: e }, 'Failed to get token')
    return c.json(error('Failed to get token', 500).data, 500)
  }
})

// PATCH /api/tokens/:id - Update token (admin only)
tokensRoutes.patch('/:id', async (c) => {
  try {
    const admin = await requireAdmin(c)
    if (!admin) return c.json(error('Admin required', 403).data, 403)

    const { id } = c.req.param()
    const body = await c.req.json() as { name?: string; status?: 'active' | 'disabled' }
    const { name, status } = body

    if (!name && !status) {
      return c.json({ error: 'At least one field (name or status) is required' }, 400)
    }

    const store = getTokenStore()
    const updates: { name?: string; status?: 'active' | 'revoked' } = {}

    if (name) updates.name = name
    if (status) updates.status = status === 'disabled' ? 'revoked' : 'active'

    const updated = await store.update(id, updates)

    if (!updated) {
      return c.json({ error: 'Token not found' }, 404)
    }

    logger.info({ action: 'tokens.update', adminId: admin.user.id, tokenId: id, updates })
    const { token: tokenValue, ...result } = updated
    void tokenValue
    return c.json({ token: { ...result, status: result.status === 'revoked' ? 'disabled' : result.status } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update token'
    logger.error({ error: err }, 'Failed to update token')
    return c.json({ error: message }, 400)
  }
})

// DELETE /api/tokens/:id - Delete token (admin only)
tokensRoutes.delete('/:id', async (c) => {
  try {
    const admin = await requireAdmin(c)
    if (!admin) return c.json(error('Admin required', 403).data, 403)

    const { id } = c.req.param()
    const store = getTokenStore()
    const deleted = await store.delete(id)

    if (!deleted) {
      return c.json({ error: 'Token not found' }, 404)
    }

    logger.info({ action: 'tokens.delete', adminId: admin.user.id, tokenId: id })
    return c.body(null, 204)
  } catch (e) {
    logger.error({ error: e }, 'Failed to delete token')
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default tokensRoutes
