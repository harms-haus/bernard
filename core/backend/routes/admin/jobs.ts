import { Hono } from 'hono'
import { requireAdmin } from '../../utils/auth'
import { listJobs, getQueueStats, getJobHistory, cancelJob, rerunJob, deleteJob } from '../../../src/lib/infra/worker-queue'
import type { ListJobsOptions } from '../../../src/lib/infra/worker-queue'
import { QueueEvents } from 'bullmq'
import { getBullMQRedis } from '../../../src/lib/infra/redis'
import { WORKER_QUEUE_CONFIG } from '../../../src/lib/infra/worker-queue/config'

const jobsRoutes = new Hono()

// GET /api/admin/jobs - List all jobs
jobsRoutes.get('/', async (c) => {
  const session = await requireAdmin(c)
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const { searchParams } = new URL(c.req.url)

  // Parse filter options
  const options: ListJobsOptions = {
    status: searchParams.get('status')?.split(',') as any,
    type: searchParams.get('type')?.split(',') as any,
    limit: parseInt(searchParams.get('limit') || '50'),
    offset: parseInt(searchParams.get('offset') || '0'),
  }

  try {
    const [jobs, stats] = await Promise.all([
      listJobs(options),
      getQueueStats(),
    ])

    return c.json({ jobs, stats })
  } catch (error) {
    console.error('[JobsAPI] Failed to list jobs:', error)
    return c.json(
      { error: 'Failed to list jobs', message: error instanceof Error ? error.message : String(error) },
      500
    )
  }
})

// GET /api/admin/jobs/stats - Get job statistics
jobsRoutes.get('/stats', async (c) => {
  const session = await requireAdmin(c)
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const stats = await getQueueStats()
    return c.json(stats)
  } catch (error) {
    console.error('[JobsAPI] Failed to get queue stats:', error)
    return c.json(
      { error: 'Failed to get stats' },
      500
    )
  }
})

// GET /api/admin/jobs/stream - Stream job updates (SSE)
jobsRoutes.get('/stream', async (c) => {
  const session = await requireAdmin(c)
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const queueEvents = new QueueEvents(WORKER_QUEUE_CONFIG.name, {
        connection: getBullMQRedis() as any,
        prefix: WORKER_QUEUE_CONFIG.prefix,
      })

      let isClosed = false

      const sendEvent = (event: string, data: Record<string, unknown>) => {
        if (isClosed) return
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }

      // Queue events mapped to SSE event names
      queueEvents.on('waiting', ({ jobId }) => sendEvent('job:queued', { jobId }))
      queueEvents.on('active', ({ jobId }) => sendEvent('job:started', { jobId }))
      queueEvents.on('completed', ({ jobId, returnvalue }) => sendEvent('job:finished', { jobId, result: returnvalue }))
      queueEvents.on('failed', ({ jobId, failedReason }) => sendEvent('job:errored', { jobId, error: failedReason }))
      queueEvents.on('progress', ({ jobId, data }) => sendEvent('job:progress', { jobId, progress: data }))
      queueEvents.on('delayed', ({ jobId }) => sendEvent('job:delayed', { jobId }))
      queueEvents.on('removed', ({ jobId }) => sendEvent('job:cancelled', { jobId }))
      queueEvents.on('stalled', ({ jobId }) => sendEvent('job:stalled', { jobId }))

      // Send keepalive every 30 seconds to prevent timeout
      const keepalive = setInterval(() => {
        if (isClosed) {
          clearInterval(keepalive)
          return
        }
        controller.enqueue(encoder.encode(': keepalive\n\n'))
      }, 30000)

      // Cleanup on client disconnect
      c.req.raw.signal.addEventListener('abort', async () => {
        if (isClosed) return
        isClosed = true
        clearInterval(keepalive)
        try {
          await queueEvents.close()
        } finally {
          try {
            controller.close()
          } catch {
            // Controller may already be closed
          }
        }
      })
    },
  })

  return c.body(stream, 200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })
})

// GET /api/admin/jobs/:jobId - Get job details
jobsRoutes.get('/:jobId', async (c) => {
  const session = await requireAdmin(c)
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const { jobId } = c.req.param()

  try {
    const job = await getJobHistory(jobId)

    if (!job) {
      return c.json({ error: 'Job not found' }, 404)
    }

    return c.json(job)
  } catch (error) {
    console.error('[JobsAPI] Failed to get job history:', error)
    return c.json(
      { error: 'Failed to get job', message: error instanceof Error ? error.message : String(error) },
      500
    )
  }
})

// POST /api/admin/jobs/:jobId/cancel - Cancel job
jobsRoutes.post('/:jobId/cancel', async (c) => {
  const session = await requireAdmin(c)
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const { jobId } = c.req.param()

  try {
    await cancelJob(jobId)
    return c.json({ success: true })
  } catch (error) {
    console.error('[JobsAPI] Failed to cancel job:', error)
    return c.json(
      { error: 'Failed to cancel job', message: error instanceof Error ? error.message : String(error) },
      500
    )
  }
})

// POST /api/admin/jobs/:jobId/rerun - Rerun job
jobsRoutes.post('/:jobId/rerun', async (c) => {
  const session = await requireAdmin(c)
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const { jobId } = c.req.param()

  try {
    await rerunJob(jobId)
    return c.json({ success: true })
  } catch (error) {
    console.error('[JobsAPI] Failed to rerun job:', error)
    return c.json(
      { error: 'Failed to rerun job', message: error instanceof Error ? error.message : String(error) },
      500
    )
  }
})

// DELETE /api/admin/jobs/:jobId - Delete job
jobsRoutes.delete('/:jobId', async (c) => {
  const session = await requireAdmin(c)
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const { jobId } = c.req.param()

  try {
    await deleteJob(jobId)
    return c.json({ success: true })
  } catch (error) {
    console.error('[JobsAPI] Failed to delete job:', error)
    return c.json(
      { error: 'Failed to delete job', message: error instanceof Error ? error.message : String(error) },
      500
    )
  }
})

export default jobsRoutes
