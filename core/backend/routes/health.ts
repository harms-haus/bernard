import { Hono } from 'hono'
import { handleHealthCheck } from '../../src/lib/api/health'
import {
  getHealthMonitor,
  HealthStreamUpdate,
  HealthStreamSnapshot,
} from '../../src/lib/services/HealthMonitor'
import { logger } from '../../src/lib/logging/logger'

const healthRoutes = new Hono()

// GET /api/health - Health check
healthRoutes.get('/', async (c) => {
  const response = await handleHealthCheck(c.req.raw as any)
  return c.body(await response.text(), response.status, Object.fromEntries(response.headers.entries()))
})

// GET /api/health/ok - Simple health check
healthRoutes.get('/ok', async (c) => {
  return c.json({ status: 'ok' })
})

// GET /api/health/ready - Readiness check
healthRoutes.get('/ready', async (c) => {
  // Port existing readiness checks (Redis, Bernard agent, etc.)
  return c.json({ status: 'ready' })
})

// GET /api/health/stream - Stream health updates (SSE)
healthRoutes.get('/stream', async (c) => {
  const encoder = new TextEncoder()
  const monitor = getHealthMonitor()

  // Ensure monitor is running
  if (!monitor.isRunning()) {
    monitor.start()
  }

  const stream = new ReadableStream({
    async start(controller) {
      let controllerClosed = false

      const closeController = () => {
        if (!controllerClosed) {
          controllerClosed = true
          try {
            controller.close()
          } catch {
            // Controller already closed
          }
        }
      }

      const sendUpdate = (update: HealthStreamUpdate) => {
        if (controllerClosed) return
        try {
          const data = JSON.stringify(update)
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        } catch {
          // Skip encoding errors
        }
      }

      try {
        // Send initial snapshot of all services
        const snapshot: HealthStreamSnapshot = await monitor.getSnapshot()

        // Send each service as individual events for consistency with streaming updates
        for (const service of snapshot.services) {
          sendUpdate({
            ...service,
            isChange: false,
          })
        }

        // Subscribe to real-time updates
        const unsubscribe = monitor.subscribe(sendUpdate)

        // Cleanup on disconnect
        c.req.raw.signal.addEventListener('abort', () => {
          unsubscribe()
          closeController()
        })
      } catch (error) {
        logger.error({ error }, '[HealthStream] Stream error')
        closeController()
      }
    },
  })

  return c.body(stream, 200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Accel-Buffering': 'no',
  })
})

export default healthRoutes
