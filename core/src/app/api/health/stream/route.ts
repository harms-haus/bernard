import { NextRequest } from 'next/server';
import {
  getHealthMonitor,
  HealthStreamUpdate,
  HealthStreamSnapshot,
} from '@/lib/services/HealthMonitor';
import { logger } from '@/lib/logging/logger';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  const monitor = getHealthMonitor();

  // Ensure monitor is running
  if (!monitor.isRunning()) {
    monitor.start();
  }

  const stream = new ReadableStream({
    async start(controller) {
      let controllerClosed = false;

      const closeController = () => {
        if (!controllerClosed) {
          controllerClosed = true;
          try {
            controller.close();
          } catch {
            // Controller already closed
          }
        }
      };

      const sendUpdate = (update: HealthStreamUpdate) => {
        if (controllerClosed) return;
        try {
          const data = JSON.stringify(update);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // Skip encoding errors
        }
      };

      try {
        // Send initial snapshot of all services
        const snapshot: HealthStreamSnapshot = await monitor.getSnapshot();

        // Send each service as individual events for consistency with streaming updates
        for (const service of snapshot.services) {
          sendUpdate({
            ...service,
            isChange: false,
          });
        }

        // Subscribe to real-time updates
        const unsubscribe = monitor.subscribe(sendUpdate);

        // Cleanup on disconnect
        request.signal.addEventListener('abort', () => {
          unsubscribe();
          closeController();
        });
      } catch (error) {
        logger.error({ error }, '[HealthStream] Stream error');
        closeController();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Accel-Buffering': 'no',
    },
  });
}
