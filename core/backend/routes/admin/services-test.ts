import { Hono } from 'hono'
import { requireAdmin } from '../../utils/auth'
import { fetchHAEntities } from '@/lib/home-assistant/rest-client'
import { getPlexServerIdentity } from '@/lib/plex/media-search'
import { getOverseerrClient } from '@/lib/overseerr/validation'

const servicesTestRoutes = new Hono()

// POST /api/admin/services/test/home-assistant - Test Home Assistant connection
servicesTestRoutes.post('/home-assistant', async (c) => {
  const session = await requireAdmin(c)
  if (!session) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json()
  const { baseUrl, accessToken } = body

  if (!baseUrl) {
    return c.json({
      status: 'failed',
      error: 'Home Assistant base URL is required',
      errorType: 'configuration',
      testedAt: new Date().toISOString(),
    }, 400)
  }

  if (!accessToken) {
    return c.json({
      status: 'failed',
      error: 'Home Assistant access token is required',
      errorType: 'configuration',
      testedAt: new Date().toISOString(),
    }, 400)
  }

  try {
    const entities = await fetchHAEntities(baseUrl, accessToken)
    return c.json({
      status: 'success',
      message: `Successfully connected. Found ${entities.length} entities.`,
      testedAt: new Date().toISOString(),
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    let errorType: 'configuration' | 'unauthorized' | 'connection' | 'server_error' | 'unknown' = 'unknown'

    if (errorMessage.includes('authentication') || errorMessage.includes('401') || errorMessage.includes('403')) {
      errorType = 'unauthorized'
    } else if (errorMessage.includes('timed out') || errorMessage.includes('Failed to fetch')) {
      errorType = 'connection'
    } else if (errorMessage.includes('API error')) {
      errorType = 'server_error'
    } else if (errorMessage.includes('base URL') || errorMessage.includes('access token')) {
      errorType = 'configuration'
    }

    return c.json({
      status: 'failed',
      error: errorMessage,
      errorType,
      testedAt: new Date().toISOString(),
    })
  }
})

// POST /api/admin/services/test/overseerr - Test Overseerr connection
servicesTestRoutes.post('/overseerr', async (c) => {
  const session = await requireAdmin(c)
  if (!session) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json()
  const { baseUrl, apiKey } = body

  if (!baseUrl) {
    return c.json({
      status: 'failed',
      error: 'Overseerr base URL is required',
      errorType: 'configuration',
      testedAt: new Date().toISOString(),
    }, 400)
  }

  if (!apiKey) {
    return c.json({
      status: 'failed',
      error: 'Overseerr API key is required',
      errorType: 'configuration',
      testedAt: new Date().toISOString(),
    }, 400)
  }

  try {
    const overseerrResult = getOverseerrClient({ baseUrl, apiKey })
    if (!overseerrResult.ok) {
      return c.json({
        status: 'failed',
        error: overseerrResult.reason,
        errorType: 'configuration',
        testedAt: new Date().toISOString(),
      }, 400)
    }

    const client = overseerrResult.client
    const searchResults = await client.search('test', 1)

    return c.json({
      status: 'success',
      message: `Successfully connected to Overseerr.`,
      testedAt: new Date().toISOString(),
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    let errorType: 'configuration' | 'unauthorized' | 'connection' | 'server_error' | 'unknown' = 'unknown'

    if (errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('unauthorized')) {
      errorType = 'unauthorized'
    } else if (errorMessage.includes('Unexpected token') || errorMessage.includes('JSON')) {
      errorType = 'server_error'
    } else if (errorMessage.includes('timed out') || errorMessage.includes('Failed to fetch') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNREFUSED')) {
      errorType = 'connection'
    } else if (errorMessage.includes('base URL') || errorMessage.includes('API key') || errorMessage.includes('Invalid Overseerr')) {
      errorType = 'configuration'
    } else if (errorMessage.includes('Overseerr API error')) {
      errorType = 'server_error'
    }

    return c.json({
      status: 'failed',
      error: errorMessage,
      errorType,
      testedAt: new Date().toISOString(),
    })
  }
})

// POST /api/admin/services/test/plex - Test Plex connection
servicesTestRoutes.post('/plex', async (c) => {
  const session = await requireAdmin(c)
  if (!session) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json()
  const { baseUrl, token } = body

  if (!baseUrl) {
    return c.json({
      status: 'failed',
      error: 'Plex base URL is required',
      errorType: 'configuration',
      testedAt: new Date().toISOString(),
    }, 400)
  }

  if (!token) {
    return c.json({
      status: 'failed',
      error: 'Plex token is required',
      errorType: 'configuration',
      testedAt: new Date().toISOString(),
    }, 400)
  }

  try {
    const { machineIdentifier } = await getPlexServerIdentity({ baseUrl, token })
    return c.json({
      status: 'success',
      message: 'Successfully connected to Plex server',
      machineIdentifier,
      testedAt: new Date().toISOString(),
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    let errorType: 'configuration' | 'unauthorized' | 'connection' | 'server_error' | 'unknown' = 'unknown'

    if (errorMessage.includes('authentication') || errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('Unauthorized')) {
      errorType = 'unauthorized'
    } else if (errorMessage.includes('timed out') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNREFUSED')) {
      errorType = 'connection'
    } else if (errorMessage.includes('Invalid Plex baseUrl') || errorMessage.includes('Invalid URL') || errorMessage.includes('baseUrl and token are required')) {
      errorType = 'configuration'
    } else if (errorMessage.includes('machine identifier not found')) {
      errorType = 'server_error'
    }

    return c.json({
      status: 'failed',
      error: errorMessage,
      errorType,
      testedAt: new Date().toISOString(),
    })
  }
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
