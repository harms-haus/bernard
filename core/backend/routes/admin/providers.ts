import { Hono } from 'hono'
import { requireAdmin } from '../../utils/auth'
import { logger } from '../../../src/lib/logging/logger'
import { getSettingsStore, initializeSettingsStore } from '../../../src/lib/config/settingsStore'
import { getRedis } from '../../../src/lib/infra/redis'
import { ProviderSchema } from '../../../src/lib/config/appSettings'

let initialized = false

async function getStore() {
  if (!initialized) {
    await initializeSettingsStore(undefined, getRedis())
    initialized = true
  }
  return getSettingsStore()
}

const providersRoutes = new Hono()

// GET /api/admin/providers - List providers
providersRoutes.get('/', async (c) => {
  try {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ error: 'Admin access required' }, 403)

    const store = await getStore()
    const providers = await store.getProviders()
    logger.info({ action: 'providers.read', adminId: admin.user.id, count: providers.length })
    return c.json(providers)
  } catch (error) {
    logger.error({ error }, 'Failed to get providers')
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /api/admin/providers - Create provider
providersRoutes.post('/', async (c) => {
  try {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ error: 'Admin access required' }, 403)

    const body = await c.req.json() as { name: string; baseUrl: string; apiKey: string; type?: 'openai' | 'ollama' }
    const { name, baseUrl, apiKey, type = 'openai' } = body

    if (!name || !baseUrl || !apiKey) {
      return c.json({ error: 'name, baseUrl, and apiKey are required' }, 400)
    }

    const store = await getStore()
    const models = await store.getModels()
    const providers = models.providers || []

    if (providers.some((p: { name: string }) => p.name === name)) {
      return c.json({ error: 'Provider with this name already exists' }, 400)
    }

    const newProvider = await store.addProvider({ name, baseUrl, apiKey, type })
    logger.info({ action: 'providers.create', adminId: admin.user.id, providerId: newProvider.id })
    return c.json(newProvider, 201)
  } catch (error) {
    logger.error({ error }, 'Failed to create provider')
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /api/admin/providers/:id - Get provider details
providersRoutes.get('/:id', async (c) => {
  try {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ error: 'Admin access required' }, 403)

    const { id } = c.req.param()
    const store = await getStore()
    const providers = await store.getProviders()
    const provider = providers.find((p: { id: string }) => p.id === id)

    if (!provider) {
      return c.json({ error: 'Provider not found' }, 404)
    }

    return c.json(provider)
  } catch (error) {
    logger.error({ error }, 'Failed to get provider')
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// PUT /api/admin/providers/:id - Update provider
providersRoutes.put('/:id', async (c) => {
  try {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ error: 'Admin access required' }, 403)

    const { id } = c.req.param()
    const body = await c.req.json() as { name?: string; baseUrl?: string; apiKey?: string }

    const store = await getStore()
    const updatedProvider = await store.updateProvider(id, body)

    if (!updatedProvider) {
      return c.json({ error: 'Provider not found' }, 404)
    }

    logger.info({ action: 'providers.update', adminId: admin.user.id, providerId: id })
    return c.json(updatedProvider)
  } catch (error) {
    logger.error({ error }, 'Failed to update provider')
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// DELETE /api/admin/providers/:id - Delete provider
providersRoutes.delete('/:id', async (c) => {
  try {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ error: 'Admin access required' }, 403)

    const { id } = c.req.param()
    const store = await getStore()
    const deleted = await store.deleteProvider(id)

    if (!deleted) {
      return c.json({ error: 'Provider not found' }, 404)
    }

    logger.info({ action: 'providers.delete', adminId: admin.user.id, providerId: id })
    return c.body(null, 204)
  } catch (error) {
    logger.error({ error }, 'Failed to delete provider')
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /api/admin/providers/:id/models - Get provider models
providersRoutes.get('/:id/models', async (c) => {
  try {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ error: 'Admin access required' }, 403)

    const { id } = c.req.param()
    // Port existing provider models logic
    return c.json({ models: [] })
  } catch (error) {
    logger.error({ error }, 'Failed to get provider models')
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /api/admin/providers/:id/test - Test provider
providersRoutes.post('/:id/test', async (c) => {
  try {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ error: 'Admin access required' }, 403)

    const { id } = c.req.param()
    // Port existing provider test logic
    return c.json({ success: true, result: {} })
  } catch (error) {
    logger.error({ error }, 'Failed to test provider')
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default providersRoutes
