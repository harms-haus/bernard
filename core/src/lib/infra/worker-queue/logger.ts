/**
 * BullMQ Logging Integration for the unified worker queue.
 *
 * Forwards BullMQ events to Pino logger and job history service.
 */
import { QueueEvents } from 'bullmq';
import { logger } from '@/lib/logging/logger';
import { jobHistoryService } from './history';

/**
 * Set up queue event logging.
 *
 * This function:
 * 1. Tracks job status changes through lifecycle events
 * 2. Logs job lifecycle events to console via Pino
 * 3. Updates job history with status changes
 *
 * Note: job.log() calls are handled in the processor, not here.
 * BullMQ doesn't emit 'log' events from QueueEvents - logs are stored
 * in the job object and retrieved separately.
 */
export function setupQueueLogging(queueEvents: QueueEvents): void {
  // Progress updates
  queueEvents.on('progress', ({ jobId, data }) => {
    let progressMessage: string;
    if (typeof data === 'number') {
      progressMessage = `${data}%`;
    } else {
      progressMessage = JSON.stringify(data);
    }
    logger.info({ jobId, progress: data }, `[WorkerQueue] Job progress: ${progressMessage}`);
  });

  // Job lifecycle events - update status in history
  queueEvents.on('waiting', ({ jobId }) => {
    logger.debug({ jobId }, '[WorkerQueue] Job waiting');
    jobHistoryService.updateStatus(jobId, 'queued').catch((error) => {
      logger.error({ jobId, error }, '[WorkerQueue] Failed to update status to queued');
    });
  });

  queueEvents.on('active', ({ jobId }) => {
    logger.debug({ jobId }, '[WorkerQueue] Job active');
    jobHistoryService.updateStatus(jobId, 'running').catch((error) => {
      logger.error({ jobId, error }, '[WorkerQueue] Failed to update status to running');
    });
  });

  queueEvents.on('completed', ({ jobId, returnvalue }) => {
    // Create safe summary of result for logging (avoid leaking sensitive data)
    let safeSummary: string;
    if (returnvalue === null || returnvalue === undefined) {
      safeSummary = 'null';
    } else if (typeof returnvalue === 'string') {
      safeSummary = returnvalue.length > 100 ? `${returnvalue.substring(0, 100)}...` : returnvalue;
    } else if (typeof returnvalue === 'object') {
      const keys = Object.keys(returnvalue);
      safeSummary = `object with ${keys.length} keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`;
    } else {
      safeSummary = String(returnvalue);
    }

    logger.info({ jobId, resultSummary: safeSummary }, '[WorkerQueue] Job completed');

    // Store result and update status (full result stored, not logged)
    Promise.all([
      jobHistoryService.setResult(jobId, returnvalue),
      jobHistoryService.updateStatus(jobId, 'finished'),
    ]).catch((error) => {
      logger.error({ jobId, error }, '[WorkerQueue] Failed to store result or update status');
    });
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    logger.error({ jobId, error: failedReason }, '[WorkerQueue] Job failed');

    // Store error and update status
    Promise.all([
      jobHistoryService.setError(jobId, failedReason),
      jobHistoryService.updateStatus(jobId, 'errored'),
    ]).catch((error) => {
      logger.error({ jobId, error }, '[WorkerQueue] Failed to store error or update status');
    });
  });

  queueEvents.on('delayed', ({ jobId }) => {
    logger.debug({ jobId }, '[WorkerQueue] Job delayed');
    jobHistoryService.updateStatus(jobId, 'delayed').catch((error) => {
      logger.error({ jobId, error }, '[WorkerQueue] Failed to update status to delayed');
    });
  });

  queueEvents.on('removed', ({ jobId }) => {
    logger.info({ jobId }, '[WorkerQueue] Job removed');
    jobHistoryService.updateStatus(jobId, 'cancelled').catch((error) => {
      logger.error({ jobId, error }, '[WorkerQueue] Failed to update status to cancelled');
    });
  });
}
