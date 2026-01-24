import { Hono } from 'hono'
import { getLogStreamer } from '../../src/lib/services/LogStreamer'
import { requireAuth } from '../utils/auth'
import { SERVICES } from '../../src/lib/services/ServiceConfig'

const logsRoutes = new Hono()

// GET /api/logs/stream?service=<service> - Stream logs for a service (SSE)
logsRoutes.get('/stream', async (c) => {
  const session = await requireAuth(c)
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const service = c.req.query('service') || 'all'
  
  // Validate service parameter
  if (service !== 'all') {
    // Validate service ID against known services
    const validServiceIds = [...Object.keys(SERVICES), 'shared']
    if (!validServiceIds.includes(service)) {
      return c.json({ error: 'Invalid service ID' }, 400)
    }
    
    // Validate service string pattern to prevent path traversal
    // Allow alphanumeric, dashes, underscores only
    if (!/^[a-zA-Z0-9_-]+$/.test(service)) {
      return c.json({ error: 'Invalid service ID format' }, 400)
    }
  }
  
  const logStreamer = getLogStreamer()
  const encoder = new TextEncoder()

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

      const sendLogEntry = (entry: ReturnType<typeof logStreamer.parseLogLine>) => {
        if (controllerClosed) return
        try {
          const data = JSON.stringify(entry)
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        } catch {
          // Skip encoding errors
        }
      }

      const sendError = (error: Error) => {
        if (controllerClosed) return
        try {
          const data = JSON.stringify({ error: error.message })
          controller.enqueue(encoder.encode(`event: error\ndata: ${data}\n\n`))
        } catch {
          // Skip encoding errors
        }
      }

      try {
        const cleanupFunctions: Array<() => void> = []

        // Handle "all" service - stream from all services
        if (service === 'all') {
          const serviceIds = [...Object.keys(SERVICES), 'shared']

          for (const serviceId of serviceIds) {
            // Check if log file exists before watching
            const logExists = await logStreamer.logExists(serviceId)
            if (!logExists) {
              continue
            }

            // Watch each service's log
            try {
              await logStreamer.watchLog(
                serviceId,
                (entry) => {
                  sendLogEntry(entry)
                },
                (error) => {
                  // Log error but don't send to client to avoid spam
                  console.error(`Error watching log for ${serviceId}:`, error)
                }
              )

              // Store cleanup function
              cleanupFunctions.push(() => {
                logStreamer.unwatchLog(serviceId).catch(() => {
                  // Ignore cleanup errors
                })
              })
            } catch (error) {
              // Skip services that fail to start watching
              console.error(`Failed to start watching log for ${serviceId}:`, error)
              continue
            }
          }
        } else {
          // Single service streaming
          const logExists = await logStreamer.logExists(service)
          if (!logExists) {
            sendError(new Error(`Log file not found for service: ${service}`))
            closeController()
            return
          }

          try {
            await logStreamer.watchLog(
              service,
              (entry) => {
                sendLogEntry(entry)
              },
              (error) => {
                sendError(error)
              }
            )

            // Store cleanup function
            cleanupFunctions.push(() => {
              logStreamer.unwatchLog(service).catch(() => {
                // Ignore cleanup errors
              })
            })
          } catch (error) {
            sendError(error as Error)
            closeController()
            return
          }
        }

        // Cleanup on disconnect (for both "all" and single service)
        c.req.raw.signal.addEventListener('abort', () => {
          cleanupFunctions.forEach((cleanup) => cleanup())
          closeController()
        })

        // Send keepalive every 30 seconds to prevent timeout
        const keepalive = setInterval(() => {
          if (controllerClosed) {
            clearInterval(keepalive)
            return
          }
          controller.enqueue(encoder.encode(': keepalive\n\n'))
        }, 30000)

        // Cleanup keepalive on disconnect
        c.req.raw.signal.addEventListener('abort', () => {
          clearInterval(keepalive)
        })
      } catch (error) {
        sendError(error as Error)
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
    'Connection': 'keep-alive',
  })
})

export default logsRoutes
