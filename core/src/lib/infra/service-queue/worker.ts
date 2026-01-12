import { Worker, QueueEvents } from 'bullmq';
import { ServiceManager } from '@/lib/services/ServiceManager';
import { childLogger, logger, type LogContext } from '@/lib/logging/logger';
import type {
  ServiceAction,
  ServiceActionJobData,
  ServiceActionResult,
  ServiceActionResultData,
} from './types';

const QUEUE_NAME = "service-actions";
const QUEUE_PREFIX = "bernard:queue:service-actions";

let serviceWorker: Worker<
  ServiceActionJobData,
  ServiceActionResult,
  string
> | null = null;
let queueEvents: QueueEvents | null = null;

export async function startServiceWorker(): Promise<void> {
  if (serviceWorker) {
    logger.warn("[ServiceQueue] Worker already running");
    return;
  }

  const { getBullMqRedis } = await import('../queue');
  const connection = getBullMqRedis();

  serviceWorker = new Worker<ServiceActionJobData, ServiceActionResult, string>(
    QUEUE_NAME,
    async (job) => {
      const { serviceId, action, requestId } = job.data;
      const context: LogContext = {
        jobId: String(job.id),
        queue: QUEUE_NAME,
        requestId,
        stage: 'processServiceJob',
      };
      const log = childLogger(context);

      try {
        log.info(`[ServiceQueue] Processing ${action} for ${serviceId}`);

        const manager = new ServiceManager();
        let result: ServiceActionResult;

        switch (action) {
          case "start":
            result = await processStart(manager, serviceId);
            break;
          case "stop":
            result = await processStop(manager, serviceId);
            break;
          case "restart":
            result = await processRestart(manager, serviceId);
            break;
          default:
            throw new Error(`Unknown action: ${action}`);
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        log.error(
          { serviceId, action, error: errorMessage },
          `[ServiceQueue] ${action} failed with exception`
        );

        return {
          success: false,
          serviceId,
          action,
          timestamp: new Date(),
          error: errorMessage,
        };
      }
    },
    {
      connection: connection as any,
      prefix: QUEUE_PREFIX,
      concurrency: 1,
    }
  );

  serviceWorker.on('completed', (job) => {
    const context: LogContext = {
      jobId: String(job?.id ?? 'unknown'),
      queue: QUEUE_NAME,
      stage: 'jobCompleted',
    };
    const log = childLogger(context);

    const durationMs =
      job?.processedOn && job?.finishedOn
        ? job.finishedOn - job.processedOn
        : undefined;

    log.info(
      { jobId: job?.id, type: job?.name, durationMs },
      '[ServiceQueue] Job completed'
    );
  });

  serviceWorker.on('failed', (job, error) => {
    const context: LogContext = {
      jobId: String(job?.id ?? 'unknown'),
      queue: QUEUE_NAME,
      stage: 'jobFailed',
    };
    const log = childLogger(context);

    const attempts = job?.attemptsMade ?? 0;
    const maxRetries = job?.opts.attempts || 1;

    log.error(
      {
        jobId: job?.id,
        type: job?.name,
        error: error?.message,
        attempts,
        maxRetries,
        serviceId: job?.data?.serviceId,
      },
      '[ServiceQueue] Job failed'
    );
  });

  serviceWorker.on('error', (error) => {
    logger.error(
      { error: error?.message, stack: error?.stack },
      '[ServiceQueue] Worker error'
    );
  });

  serviceWorker.on('stalled', (jobId) => {
    logger.warn({ jobId }, '[ServiceQueue] Job stalled');
  });

  queueEvents = new QueueEvents(QUEUE_NAME, {
    connection: getBullMqRedis() as any,
    prefix: QUEUE_PREFIX,
  });

  queueEvents.on('completed', ({ jobId, returnvalue }) => {
    logger.debug(
      { jobId, returnvalue },
      '[ServiceQueue] Queue event: completed'
    );
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    logger.warn(
      { jobId, failedReason },
      '[ServiceQueue] Queue event: failed'
    );
  });

  queueEvents.on('error', (error) => {
    logger.error(
      { error: error?.message },
      '[ServiceQueue] Queue event: error'
    );
  });

  logger.info('[ServiceQueue] Worker started (concurrency: 1)');
}

export async function stopServiceWorker(): Promise<void> {
  if (serviceWorker) {
    await serviceWorker.close();
    serviceWorker = null;
  }
  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }
}

async function processStart(
  manager: ServiceManager,
  serviceId: string
): Promise<ServiceActionResult> {
  const startResult = await manager.start(serviceId);

  const data: ServiceActionResultData = {
    pid: startResult.pid,
  };

  return {
    success: startResult.success,
    serviceId,
    action: 'start',
    timestamp: new Date(),
    data,
    error: startResult.error,
  };
}

async function processStop(
  manager: ServiceManager,
  serviceId: string
): Promise<ServiceActionResult> {
  const stopResult = await manager.stop(serviceId);

  return {
    success: stopResult.success,
    serviceId,
    action: 'stop',
    timestamp: new Date(),
  };
}

async function processRestart(
  manager: ServiceManager,
  serviceId: string
): Promise<ServiceActionResult> {
  const restartResult = await manager.restart(serviceId);

  return {
    success: restartResult.success,
    serviceId,
    action: 'restart',
    timestamp: new Date(),
    error: restartResult.error,
  };
}
