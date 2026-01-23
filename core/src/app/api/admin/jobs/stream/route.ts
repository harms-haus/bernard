import { requireAdmin } from '@/lib/auth/server-helpers';
import { NextRequest, NextResponse } from 'next/server';
import { QueueEvents } from 'bullmq';
import { getBullMQRedis } from '@/lib/infra/redis';
import { WORKER_QUEUE_CONFIG } from '@/lib/infra/worker-queue/config';

/**
 * GET /api/admin/jobs/stream
 *
 * Server-Sent Events (SSE) stream for real-time job updates.
 * Requires admin role.
 *
 * Emits events:
 * - job:queued - Job added to queue
 * - job:started - Job started processing
 * - job:finished - Job completed successfully
 * - job:errored - Job failed
 * - job:progress - Job progress update
 * - job:delayed - Job scheduled for future
 * - job:cancelled - Job cancelled
 * - job:stalled - Job stalled
 */
export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const queueEvents = new QueueEvents(WORKER_QUEUE_CONFIG.name, {
        connection: getBullMQRedis() as any,
        prefix: WORKER_QUEUE_CONFIG.prefix,
      });

      let isClosed = false;

      const sendEvent = (event: string, data: Record<string, unknown>) => {
        if (isClosed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Queue events mapped to SSE event names
      queueEvents.on('waiting', ({ jobId }) => sendEvent('job:queued', { jobId }));
      queueEvents.on('active', ({ jobId }) => sendEvent('job:started', { jobId }));
      queueEvents.on('completed', ({ jobId, returnvalue }) => sendEvent('job:finished', { jobId, result: returnvalue }));
      queueEvents.on('failed', ({ jobId, failedReason }) => sendEvent('job:errored', { jobId, error: failedReason }));
      queueEvents.on('progress', ({ jobId, data }) => sendEvent('job:progress', { jobId, progress: data }));
      queueEvents.on('delayed', ({ jobId }) => sendEvent('job:delayed', { jobId }));
      queueEvents.on('removed', ({ jobId }) => sendEvent('job:cancelled', { jobId }));
      queueEvents.on('stalled', ({ jobId }) => sendEvent('job:stalled', { jobId }));

      // Send keepalive every 30 seconds to prevent timeout
      const keepalive = setInterval(() => {
        if (isClosed) {
          clearInterval(keepalive);
          return;
        }
        controller.enqueue(encoder.encode(': keepalive\n\n'));
      }, 30000);

      // Cleanup on client disconnect
      req.signal.addEventListener('abort', async () => {
        if (isClosed) return;
        isClosed = true;
        clearInterval(keepalive);
        try {
          await queueEvents.close();
        } finally {
          try {
            controller.close();
          } catch {
            // Controller may already be closed
          }
        }
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
