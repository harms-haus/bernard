/**
 * Unified Worker Queue System
 *
 * Consolidates utility and service action queues into a single unified queue.
 * Exports queue management functions and job operations.
 */
import { Queue, QueueEvents, Job } from 'bullmq';
import { getRedis } from '../redis';
import { logger } from '@/lib/logging/logger';
import { setupQueueLogging } from './logger';
import { createWorker } from './processor';
import { jobHistoryService } from './history';
import { WORKER_QUEUE_CONFIG } from './config';
import type {
  WorkerJobData,
  JobHistory,
  ListJobsOptions,
  QueueStats,
} from './types';

let workerQueue: Queue<WorkerJobData, any, string> | null = null;
let worker: any = null;
let queueEvents: QueueEvents | null = null;
let workerQueueInitPromise: Promise<Queue<WorkerJobData, any, string>> | null = null;

// ============================================================================
// Queue Management
// ============================================================================

/**
 * Get the worker queue instance (singleton pattern).
 */
export async function getWorkerQueue(): Promise<Queue<WorkerJobData, any, string>> {
  if (workerQueue) {
    return workerQueue;
  }

  if (workerQueueInitPromise) {
    return await workerQueueInitPromise;
  }

  workerQueueInitPromise = (async () => {
    try {
      const connection = getRedis();

      workerQueue = new Queue<WorkerJobData, any, string>(
        WORKER_QUEUE_CONFIG.name,
        {
          connection: connection as any,
          prefix: WORKER_QUEUE_CONFIG.prefix,
          defaultJobOptions: {
            removeOnComplete: {
              age: WORKER_QUEUE_CONFIG.retention.completedAge,
              count: WORKER_QUEUE_CONFIG.retention.completedCount,
            },
            removeOnFail: {
              age: WORKER_QUEUE_CONFIG.retention.failedAge,
              count: WORKER_QUEUE_CONFIG.retention.failedCount,
            },
            attempts: WORKER_QUEUE_CONFIG.retry.attempts,
            backoff: WORKER_QUEUE_CONFIG.retry.backoff,
          },
        }
      );

      // Setup queue events for logging
      queueEvents = new QueueEvents(WORKER_QUEUE_CONFIG.name, {
        connection: connection as any,
        prefix: WORKER_QUEUE_CONFIG.prefix,
      });

      setupQueueLogging(queueEvents);

      logger.info('[WorkerQueue] Queue initialized');

      return workerQueue;
    } catch (error) {
      workerQueueInitPromise = null;
      throw error;
    }
  })();

  return await workerQueueInitPromise;
}

// ============================================================================
// Job Operations
// ============================================================================

/**
 * Add a job to the worker queue.
 *
 * @param type - The job type (e.g., 'thread-naming', 'service:start')
 * @param data - The job data (will be wrapped in WorkerJobData)
 * @param options - Optional job configuration
 * @returns The job ID
 */
export async function addJob(
  type: string,
  data: unknown,
  options?: {
    jobId?: string;
    deduplicationId?: string;
    delay?: number;
  }
): Promise<string> {
  const queue = await getWorkerQueue();

  const jobData: WorkerJobData = { type: type as any, data };
  const job = await queue.add(type, jobData, {
    jobId: options?.jobId,
    deduplication: options?.deduplicationId ? { id: options.deduplicationId } : undefined,
    delay: options?.delay,
  });

  // Record in history service with error handling
  try {
    await jobHistoryService.recordJob(job.id!, type, jobData);
  } catch (error) {
    logger.error(
      { jobId: job.id, type, error: error instanceof Error ? error.message : String(error) },
      '[WorkerQueue] Failed to record job in history, removing from queue'
    );
    
    // Compensating action: remove the enqueued job
    try {
      await job.remove();
    } catch (removeError) {
      logger.error(
        { jobId: job.id, error: removeError instanceof Error ? removeError.message : String(removeError) },
        '[WorkerQueue] Failed to remove job after history record failure'
      );
    }
    
    throw new Error(`Failed to record job in history: ${error instanceof Error ? error.message : String(error)}`);
  }

  logger.info({ jobId: job.id, type }, '[WorkerQueue] Job added');

  return job.id!;
}

/**
 * Get a job from the queue.
 */
export async function getJob(jobId: string): Promise<Job | null> {
  const queue = await getWorkerQueue();
  const job = await queue.getJob(jobId);
  return job ?? null;
}

/**
 * List jobs from history with optional filters.
 */
export async function listJobs(options: ListJobsOptions = {}): Promise<JobHistory[]> {
  return await jobHistoryService.listJobs(options);
}

/**
 * Get complete job history including logs.
 */
export async function getJobHistory(jobId: string): Promise<JobHistory | null> {
  return await jobHistoryService.getJobHistory(jobId);
}

/**
 * Get logs for a specific job.
 */
export async function getJobLogs(jobId: string): Promise<any[]> {
  return await jobHistoryService.getLogs(jobId);
}

/**
 * Get queue statistics.
 */
export async function getQueueStats(): Promise<QueueStats> {
  const queue = await getWorkerQueue();
  const counts = await queue.getJobCounts(
    'waiting',
    'active',
    'completed',
    'delayed',
    'failed'
  );

  return {
    queued: counts.waiting || 0,
    starting: 0,
    running: counts.active || 0,
    cleaningUp: 0,
    finished: counts.completed || 0,
    errored: counts.failed || 0,
    cancelled: 0,
    delayed: counts.delayed || 0,
    total: Object.values(counts).reduce((a, b) => (a || 0) + (b || 0), 0),
  };
}

/**
 * Rerun a job (creates a new copy, preserves original).
 */
export async function rerunJob(jobId: string): Promise<string | null> {
  const job = await getJob(jobId);

  if (!job || !job.data) return null;

  const queue = await getWorkerQueue();
  const newJob = await queue.add(job.name, job.data, {});

  // Record rerun relationship
  await jobHistoryService.recordRerun(jobId, newJob.id!);

  logger.info({ originalJobId: jobId, newJobId: newJob.id }, '[WorkerQueue] Job rerun');

  return newJob.id ?? null;
}

/**
 * Cancel a running or queued job.
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  const job = await getJob(jobId);

  if (!job) return false;

  const state = await job.getState();

  // Only cancel active/waiting jobs
  if (state !== 'active' && state !== 'waiting') {
    logger.warn({ jobId, state }, '[WorkerQueue] Cannot cancel job in current state');
    return false;
  }

  // For active jobs, mark as failed with cancellation error so processor can handle it
  if (state === 'active') {
    try {
      if (job.token) {
        await job.moveToFailed(new Error('Job cancelled by user'), job.token);
      } else {
        await job.remove();
      }
    } catch (error) {
      // If moveToFailed fails, try remove as fallback
      logger.warn({ jobId, error: error instanceof Error ? error.message : String(error) }, '[WorkerQueue] Failed to move active job to failed, removing instead');
      await job.remove();
    }
  } else {
    // For waiting jobs, just remove
    await job.remove();
  }

  await jobHistoryService.updateStatus(jobId, 'cancelled');

  logger.info({ jobId }, '[WorkerQueue] Job cancelled');

  return true;
}

/**
 * Delete a job from queue and history.
 * Only works on completed, queued, errored, or cancelled jobs.
 */
export async function deleteJob(jobId: string): Promise<boolean> {
  const job = await getJob(jobId);

  if (!job) return false;

  const state = await job.getState();

  // Only delete non-running jobs
  if (state === 'active') {
    logger.warn({ jobId, state }, '[WorkerQueue] Cannot delete running job');
    return false;
  }

  await job.remove();
  await jobHistoryService.deleteJob(jobId);

  logger.info({ jobId }, '[WorkerQueue] Job deleted');

  return true;
}

// ============================================================================
// Worker Lifecycle
// ============================================================================

/**
 * Start the unified worker.
 */
export async function startWorker(): Promise<void> {
  if (worker) {
    logger.warn('[WorkerQueue] Worker already running');
    return;
  }

  await getWorkerQueue(); // Ensure queue is initialized
  worker = await createWorker();

  logger.info('[WorkerQueue] Unified worker started');
}

/**
 * Stop the unified worker gracefully.
 */
export async function stopWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('[WorkerQueue] Worker stopped');
  }

  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }

  if (workerQueue) {
    await workerQueue.close();
    workerQueue = null;
    logger.info('[WorkerQueue] Queue closed');
  }
}

/**
 * Check if the worker queue is healthy.
 */
export async function isWorkerQueueHealthy(): Promise<boolean> {
  try {
    const queue = await getWorkerQueue();
    await queue.getJobCounts();
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Type Exports
// ============================================================================

export type {
  WorkerJobType,
  WorkerJobStatus,
  WorkerJobData,
  JobMetadata,
  ThreadNamingJobData,
  MetadataUpdateJobData,
  EmbeddingCacheJobData,
  ServiceActionJobData,
  JobLog,
  JobHistory,
  ListJobsOptions,
  QueueStats,
} from './types';
