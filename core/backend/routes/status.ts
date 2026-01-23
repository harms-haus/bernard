import { Hono } from 'hono'
import { denyGuest } from '../utils/auth'
import { logger } from '../../src/lib/logging/logger'
import Redis from 'ioredis'

interface StatusData {
  status: 'online' | 'degraded' | 'offline'
  uptimeSeconds: number
  startedAt: string
  version?: string
  lastActivityAt: string
  activeConversations: number
  tokensActive: number
  queueSize: number
  notes?: string
  services?: Array<{
    name: string
    port: number
    description: string
    status: 'online' | 'degraded' | 'offline'
    error?: string
    logs?: string[]
  }>
}

const statusRoutes = new Hono()

statusRoutes.get('/', async (c) => {
  try {
    // Deny guest users when requesting service details
    // Guests can view basic status without authentication
    const { searchParams } = new URL(c.req.url)
    const includeServices = searchParams.get('services') === 'true'
    const includeLogs = searchParams.get('logs') === 'true'

    if (includeServices) {
      const session = await denyGuest(c)
      if (!session) {
        return c.json({ error: 'Authentication required' }, 401)
      }
    }

    const BERNARD_AGENT_URL = process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:2024'
    const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
    const BERNARD_UI_URL = process.env.BERNARD_UI_URL || 'http://127.0.0.1:8810'
    const VLLM_URL = process.env.VLLM_URL || 'http://127.0.0.1:8860'
    const WHISPER_URL = process.env.WHISPER_URL || 'http://127.0.0.1:8870'
    const KOKORO_URL = process.env.KOKORO_URL || 'http://127.0.0.1:8880'

    const statusData: StatusData = {
      status: 'online',
      uptimeSeconds: Math.floor(process.uptime()),
      startedAt: new Date(Date.now() - Math.floor(process.uptime() * 1000)).toISOString(),
      version: process.env.npm_package_version,
      lastActivityAt: new Date().toISOString(),
      activeConversations: 0,
      tokensActive: 0,
      queueSize: 0,
    }

    if (includeServices) {
      const services: Array<{
        name: string
        port: number
        description: string
        status: 'online' | 'degraded' | 'offline'
        error?: string
        logs?: string[]
      }> = []

      // Check Redis
      try {
        const redisClient = new Redis(REDIS_URL, { lazyConnect: true })
        await redisClient.connect()
        const ping = await redisClient.ping()
        services.push({
          name: 'Redis',
          port: parseInt(new URL(REDIS_URL).port || '6379'),
          description: 'Cache and session storage',
          status: ping === 'PONG' ? 'online' : 'degraded',
        })
        await redisClient.quit()
      } catch (error) {
        services.push({
          name: 'Redis',
          port: parseInt(new URL(REDIS_URL).port || '6379'),
          description: 'Cache and session storage',
          status: 'offline',
          error: error instanceof Error ? error.message : String(error),
          logs: includeLogs ? ['Failed to connect to Redis'] : undefined,
        })
      }

      // Check Bernard Agent
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 2000)

        const response = await fetch(`${BERNARD_AGENT_URL}/info`, {
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        services.push({
          name: 'Bernard Agent',
          port: parseInt(new URL(BERNARD_AGENT_URL).port || '2024'),
          description: 'AI agent and chat processing',
          status: response.ok ? 'online' : 'degraded',
        })
      } catch (error) {
        services.push({
          name: 'Bernard Agent',
          port: parseInt(new URL(BERNARD_AGENT_URL).port || '2024'),
          description: 'AI agent and chat processing',
          status: 'offline',
          error: error instanceof Error ? error.message : String(error),
          logs: includeLogs ? ['Failed to connect to Bernard agent'] : undefined,
        })
      }

      // Check Bernard UI
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 2000)

        const response = await fetch(`${BERNARD_UI_URL}/`, {
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        services.push({
          name: 'Bernard UI',
          port: parseInt(new URL(BERNARD_UI_URL).port || '8810'),
          description: 'Web interface',
          status: response.ok ? 'online' : 'degraded',
        })
      } catch (error) {
        services.push({
          name: 'Bernard UI',
          port: parseInt(new URL(BERNARD_UI_URL).port || '8810'),
          description: 'Web interface',
          status: 'offline',
          error: error instanceof Error ? error.message : String(error),
          logs: includeLogs ? ['Failed to connect to Bernard UI'] : undefined,
        })
      }

      // Check VLLM
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 2000)

        const response = await fetch(`${VLLM_URL}/health`, {
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        services.push({
          name: 'VLLM',
          port: parseInt(new URL(VLLM_URL).port || '8860'),
          description: 'Text embeddings',
          status: response.ok ? 'online' : 'degraded',
        })
      } catch (error) {
        services.push({
          name: 'VLLM',
          port: parseInt(new URL(VLLM_URL).port || '8860'),
          description: 'Text embeddings',
          status: 'offline',
          error: error instanceof Error ? error.message : String(error),
          logs: includeLogs ? ['Failed to connect to VLLM'] : undefined,
        })
      }

      // Check Whisper
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 2000)

        const response = await fetch(`${WHISPER_URL}/health`, {
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        services.push({
          name: 'Whisper',
          port: parseInt(new URL(WHISPER_URL).port || '8870'),
          description: 'Speech-to-text',
          status: response.ok ? 'online' : 'degraded',
        })
      } catch (error) {
        services.push({
          name: 'Whisper',
          port: parseInt(new URL(WHISPER_URL).port || '8870'),
          description: 'Speech-to-text',
          status: 'offline',
          error: error instanceof Error ? error.message : String(error),
          logs: includeLogs ? ['Failed to connect to Whisper'] : undefined,
        })
      }

      // Check Kokoro
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 2000)

        const response = await fetch(`${KOKORO_URL}/health`, {
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        services.push({
          name: 'Kokoro',
          port: parseInt(new URL(KOKORO_URL).port || '8880'),
          description: 'Text-to-speech',
          status: response.ok ? 'online' : 'degraded',
        })
      } catch (error) {
        services.push({
          name: 'Kokoro',
          port: parseInt(new URL(KOKORO_URL).port || '8880'),
          description: 'Text-to-speech',
          status: 'offline',
          error: error instanceof Error ? error.message : String(error),
          logs: includeLogs ? ['Failed to connect to Kokoro'] : undefined,
        })
      }

      // Check this API server itself
      services.push({
        name: 'Core API',
        port: Number(process.env.PORT) || 3456,
        description: 'Bernard core API server',
        status: 'online',
      })

      statusData.services = services

      // Determine overall status
      const offlineServices = services.filter(s => s.status === 'offline')
      const degradedServices = services.filter(s => s.status === 'degraded')

      if (offlineServices.length > 0) {
        statusData.status = 'offline'
        statusData.notes = `Offline services: ${offlineServices.map(s => s.name).join(', ')}`
      } else if (degradedServices.length > 0) {
        statusData.status = 'degraded'
        statusData.notes = `Degraded services: ${degradedServices.map(s => s.name).join(', ')}`
      }
    }

    return c.json(statusData)
  } catch (error) {
    logger.error({ error }, 'Failed to get status')
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default statusRoutes
