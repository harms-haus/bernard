/**
 * Job Processors for the unified worker queue.
 *
 * Handles all job types: thread-naming and service actions.
 */
import { Job, Worker } from 'bullmq';
import { logger } from '../../logging/logger';
import { childLogger, type LogContext } from '../../logging/logger';
import { jobHistoryService } from './history';
import { getBullMQRedis } from '../redis';
import { WORKER_QUEUE_CONFIG } from './config';
import type {
  WorkerJobData,
  ThreadNamingJobData,
  ServiceActionJobData,
} from './types';

// ============================================================================
// Thread Naming Processor
// ============================================================================

async function processThreadNamingJob(
  jobData: ThreadNamingJobData,
  job: Job
): Promise<any> {
  const { threadId, messages } = jobData;
  const jobId = String(job.id);
  const context: LogContext = {
    jobId,
    threadId,
    queue: 'workerQueue',
    stage: 'processThreadNamingJob',
  };

  const log = childLogger(context);

  try {
    await job.log('Starting thread naming operation...');

    log.info('[WorkerQueue] Processing thread naming job');

    // Import the utility model resolver and execute naming inline
    const { resolveUtilityModel } = await import('../../config/models');
    const { initChatModel } = await import('langchain/chat_models/universal');

    const modelConfig = await resolveUtilityModel();
    const model = await initChatModel(modelConfig.id, modelConfig.options);

    // Extract message content for naming
    const messageContent = messages
      .map(m => {
        if (m.type === 'human') {
          const content = m.content;
          if (typeof content === 'string') return content;
          if (Array.isArray(content)) {
            return content
              .filter(c => c.type === 'text')
              .map(c => (c as any).text)
              .join('\n');
          }
        }
        return '';
      })
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 2000); // Limit to 2000 characters

    // Guard against empty messageContent
    if (!messageContent || messageContent.trim().length === 0) {
      const defaultTitle = 'Untitled Conversation';
      await job.log(`Thread naming skipped: no message content, using default title`);
      await jobHistoryService.updateStatus(jobId, 'finished');

      log.info({ threadId, title: defaultTitle }, '[WorkerQueue] Thread naming completed with default title');

      return {
        success: true,
        threadId,
        title: defaultTitle,
      };
    }

    // Generate title using LLM
    const prompt = `Generate a concise, descriptive title (max 6 words) for this conversation:\n\n${messageContent}\n\nTitle:`;

    // Wrap model.invoke with timeout (30 seconds)
    const timeoutMs = 30000;
    const invokePromise = model.invoke([
      { role: 'user', content: prompt }
    ]);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`LLM invocation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    const response = await Promise.race([invokePromise, timeoutPromise]);

    // Validate response structure
    if (!response) {
      throw new Error('LLM returned null or undefined response');
    }

    if (response.content === null || response.content === undefined) {
      throw new Error('LLM response.content is null or undefined');
    }

    // Validate content type and extract title
    let title: string;
    if (typeof response.content === 'string') {
      title = response.content.trim().replace(/^["']|["']$/g, '');
    } else if (typeof response.content === 'object' && 'toString' in response.content) {
      title = response.content.toString().trim().replace(/^["']|["']$/g, '');
    } else {
      throw new Error(`Unexpected response.content type: ${typeof response.content}`);
    }

    // Ensure title is not empty after processing
    if (!title || title.trim().length === 0) {
      title = 'Untitled Conversation';
      log.warn({ threadId }, '[WorkerQueue] LLM returned empty title, using default');
    }

    await job.log(`Thread naming completed: ${title}`);
    await jobHistoryService.updateStatus(jobId, 'finished');

    log.info({ threadId, title }, '[WorkerQueue] Thread naming completed');

    return {
      success: true,
      threadId,
      title,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await job.log(`Thread naming failed: ${errorMessage}`);
    await jobHistoryService.updateStatus(jobId, 'errored');

    log.error({ threadId, error: errorMessage }, '[WorkerQueue] Thread naming failed');

    // Re-throw to allow BullMQ retry logic
    throw error;
  }
}

// ============================================================================
// Service Action Processor
// ============================================================================

async function processServiceActionJob(
  jobData: ServiceActionJobData,
  job: Job
): Promise<any> {
  const { serviceId, action, requestId } = jobData;
  const jobId = String(job.id);
  const context: LogContext = {
    jobId,
    queue: 'workerQueue',
    requestId,
    component: serviceId,
    stage: 'processServiceAction',
  };

  const log = childLogger(context);

  try {
    await job.log(`Starting ${action} for ${serviceId}...`);

    log.info({ serviceId, action }, '[WorkerQueue] Processing service action');

    // Import ServiceManager
    const { ServiceManager } = await import('../../services/ServiceManager');
    const manager = new ServiceManager();

    let result: any;

    switch (action) {
      case 'start': {
        const startResult = await manager.start(serviceId);
        result = {
          success: startResult.success,
          serviceId,
          action,
          timestamp: new Date().toISOString(),
          data: { pid: startResult.pid },
          error: startResult.error,
        };
        break;
      }
      case 'stop': {
        const stopResult = await manager.stop(serviceId);
        result = {
          success: stopResult.success,
          serviceId,
          action,
          timestamp: new Date().toISOString(),
        };
        break;
      }
      case 'restart': {
        const restartResult = await manager.restart(serviceId);
        result = {
          success: restartResult.success,
          serviceId,
          action,
          timestamp: new Date().toISOString(),
          error: restartResult.error,
        };
        break;
      }
      case 'check': {
        // Use healthCheck method from ServiceManager
        const healthResult = await manager.healthCheck(serviceId);
        const healthStatus = healthResult?.status === 'up' ? 'healthy' : 'unhealthy';
        result = {
          success: healthResult?.status === 'up',
          serviceId,
          action,
          timestamp: new Date().toISOString(),
          data: { health: healthStatus },
        };
        break;
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    await job.log(`${action} completed for ${serviceId}`);
    await jobHistoryService.updateStatus(jobId, 'finished');

    log.info({ serviceId, action, success: result.success }, '[WorkerQueue] Service action completed');

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await job.log(`${action} failed for ${serviceId}: ${errorMessage}`);
    await jobHistoryService.updateStatus(jobId, 'errored');

    log.error({ serviceId, action, error: errorMessage }, '[WorkerQueue] Service action failed');

    // Re-throw to allow BullMQ retry logic
    throw error;
  }
}

// ============================================================================
// Main Processor
// ============================================================================

/**
 * Create the worker with all job processors.
 */
export async function createWorker(): Promise<Worker> {
  const concurrency = WORKER_QUEUE_CONFIG.concurrency;

  const worker = new Worker(
    WORKER_QUEUE_CONFIG.name,
    async (job: Job) => {
      const { type, data } = job.data as WorkerJobData;
      const jobId = String(job.id);

      await jobHistoryService.updateStatus(jobId, 'starting');
      await jobHistoryService.incrementAttempts(jobId);

      switch (type) {
        case 'thread-naming':
          return processThreadNamingJob(data as ThreadNamingJobData, job);
        case 'service:start':
        case 'service:stop':
        case 'service:restart':
        case 'service:check':
          return processServiceActionJob(data as ServiceActionJobData, job);
        default:
          const unknownType = type as string;
          throw new Error(`Unknown job type: ${unknownType}`);
      }
    },
    {
      connection: getBullMQRedis() as any,
      prefix: WORKER_QUEUE_CONFIG.prefix,
      concurrency,
    }
  );

  // Worker event handlers
  worker.on('completed', (job) => {
    const context: LogContext = {
      jobId: String(job?.id ?? 'unknown'),
      queue: WORKER_QUEUE_CONFIG.name,
      stage: 'jobCompleted',
    };
    const log = childLogger(context);

    const durationMs = job?.processedOn && job?.finishedOn
      ? job.finishedOn - job.processedOn
      : undefined;

    log.info(
      { jobId: job?.id, type: job?.name, durationMs },
      '[WorkerQueue] Job completed'
    );
  });

  worker.on('failed', (job, error) => {
    const context: LogContext = {
      jobId: String(job?.id ?? 'unknown'),
      queue: WORKER_QUEUE_CONFIG.name,
      stage: 'jobFailed',
    };
    const log = childLogger(context);

    const attempts = job?.attemptsMade ?? 0;
    const maxRetries = job?.opts.attempts ?? WORKER_QUEUE_CONFIG.retry.attempts;

    log.error(
      {
        jobId: job?.id,
        type: job?.name,
        error: error?.message,
        attempts,
        maxRetries,
      },
      '[WorkerQueue] Job failed'
    );

    // Only log retry information if BullMQ will actually retry
    // BullMQ retries when attempts < maxRetries and the error was thrown (not returned)
    // Since we re-throw errors now, BullMQ will handle retries automatically
    // This log is informational about the failure, not about a scheduled retry
  });

  worker.on('error', (error) => {
    logger.error(
      { error: error?.message, stack: error?.stack },
      '[WorkerQueue] Worker error'
    );
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId }, '[WorkerQueue] Job stalled');
  });

  logger.info(
    { concurrency, queueName: WORKER_QUEUE_CONFIG.name },
    '[WorkerQueue] Worker started'
  );

  return worker;
}
