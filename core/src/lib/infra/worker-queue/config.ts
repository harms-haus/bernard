/**
 * Configuration for the unified worker queue system.
 */

/**
 * Queue name and prefix configuration.
 */
export const QUEUE_NAME = "workerQueue";
export const QUEUE_PREFIX = "bernard:queue:worker";

/**
 * Parse an environment variable as an integer with a default fallback.
 * Returns the default if parsing yields NaN.
 */
function parseIntEnv(envValue: string | undefined, defaultValue: number): number {
  const parsed = parseInt(envValue ?? String(defaultValue), 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Job retention configuration for BullMQ.
 */
interface RetentionConfig {
  completedAge: number;   // seconds
  completedCount: number;
  failedAge: number;      // seconds
  failedCount: number;
}

/**
 * Retry configuration for failed jobs.
 */
interface RetryConfig {
  attempts: number;
  backoff: {
    type: "exponential";
    delay: number;  // milliseconds
  };
}

/**
 * Complete worker queue configuration.
 */
export const WORKER_QUEUE_CONFIG = {
  name: QUEUE_NAME,
  prefix: QUEUE_PREFIX,
  retention: {
    completedAge: parseIntEnv(process.env["WORKER_QUEUE_RETENTION_COMPLETED_DAYS"], 7) * 86400,
    completedCount: parseIntEnv(process.env["WORKER_QUEUE_RETENTION_COMPLETED_COUNT"], 1000),
    failedAge: parseIntEnv(process.env["WORKER_QUEUE_RETENTION_FAILED_DAYS"], 30) * 86400,
    failedCount: parseIntEnv(process.env["WORKER_QUEUE_RETENTION_FAILED_COUNT"], 5000),
  } satisfies RetentionConfig,
  retry: {
    attempts: parseIntEnv(process.env["WORKER_QUEUE_RETRIES"], 3),
    backoff: {
      type: "exponential" as const,
      delay: parseIntEnv(process.env["WORKER_QUEUE_BACKOFF_DELAY"], 2000),
    },
  } satisfies RetryConfig,
  concurrency: parseIntEnv(process.env["WORKER_QUEUE_CONCURRENCY"], 10),
  historyRetentionDays: parseIntEnv(process.env["WORKER_QUEUE_HISTORY_RETENTION_DAYS"], 90),
} as const;
