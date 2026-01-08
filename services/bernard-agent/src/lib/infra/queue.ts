/**
 * Utility Queue Infrastructure using BullMQ
 * 
 * Provides a background job queue for utility operations like automatic thread naming.
 */
import { Queue, Worker, QueueEvents } from "bullmq";
import Redis from "ioredis";

import { childLogger, logger, startTimer, type LogContext } from "@/lib/logging/logger";

// ============================================================================
// Type Definitions for Utility Jobs
// ============================================================================

/**
 * Job data for thread naming operations
 */
export interface ThreadNamingJobData {
  threadId: string;
  message: string;
}

/**
 * Job data for metadata update operations (future use)
 */
export interface MetadataUpdateJobData {
  threadId: string;
  field: "title" | "tags" | "metadata";
  value: Record<string, unknown>;
}

/**
 * Job data for embedding cache operations (future use)
 */
export interface EmbeddingCacheJobData {
  threadId: string;
  content: string;
  embeddingKey: string;
}

/**
 * Union type for all utility job data types
 */
export type UtilityJobData = ThreadNamingJobData | MetadataUpdateJobData | EmbeddingCacheJobData;

/**
 * Result type for thread naming operations
 */
export interface ThreadNamingResult {
  success: boolean;
  threadId: string;
  title?: string;
  error?: string;
}

/**
 * Result type for metadata update operations (future use)
 */
export interface MetadataUpdateResult {
  success: boolean;
  threadId: string;
  field: string;
  error?: string;
}

/**
 * Result type for embedding cache operations (future use)
 */
export interface EmbeddingCacheResult {
  success: boolean;
  threadId: string;
  embeddingKey: string;
  cached?: boolean;
  error?: string;
}

/**
 * Union type for all utility job results
 */
export type UtilityJobResult = ThreadNamingResult | MetadataUpdateResult | EmbeddingCacheResult;

/**
 * Error response type for failed jobs
 */
export interface UtilityJobError {
  success: false;
  error: string;
  code?: string;
  retryable: boolean;
  threadId?: string;
  jobType?: string;
}

// Queue configuration
const QUEUE_NAME = "utility";
const UTILITY_QUEUE_PREFIX = "bernard:queue:utility";

let utilityQueue: Queue<UtilityJobData, ThreadNamingJobData, string> | null = null;
let utilityWorker: Worker<UtilityJobData, UtilityJobResult, string> | null = null;
let queueEvents: QueueEvents | null = null;
let bullMqRedis: Redis | null = null;

/**
 * Create a BullMQ-compatible Redis connection
 * BullMQ requires maxRetriesPerRequest to be null
 */
function getBullMqRedis(): Redis {
  if (!bullMqRedis) {
    const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
    bullMqRedis = new Redis(url, {
      maxRetriesPerRequest: null, // Required by BullMQ
      // BullMQ handles retries internally, so don't configure retryStrategy
      enableReadyCheck: false, // BullMQ handles readiness
      lazyConnect: true,
    });

    bullMqRedis.on("error", (err) => {
      logger.error({ error: err.message }, "[UtilityQueue] Redis connection error");
    });

    bullMqRedis.on("connect", () => {
      logger.info("[UtilityQueue] Redis connected for BullMQ");
    });
  }
  return bullMqRedis;
}

/**
 * Get the utility queue instance (singleton pattern)
 */
export function getUtilityQueue(): Queue<UtilityJobData, ThreadNamingJobData, string> {
  if (!utilityQueue) {
    const connection = getBullMqRedis();
    
    utilityQueue = new Queue<UtilityJobData, ThreadNamingJobData, string>(QUEUE_NAME, {
      connection: connection,
      prefix: UTILITY_QUEUE_PREFIX,
      defaultJobOptions: {
        removeOnComplete: {
          age: parseInt(process.env["UTILITY_QUEUE_REMOVE_COMPLETED"] ?? "100"),
          count: parseInt(process.env["UTILITY_QUEUE_REMOVE_COMPLETED"] ?? "100"),
        },
        removeOnFail: {
          age: parseInt(process.env["UTILITY_QUEUE_REMOVE_FAILED"] ?? "500"),
          count: parseInt(process.env["UTILITY_QUEUE_REMOVE_FAILED"] ?? "500"),
        },
        attempts: parseInt(process.env["UTILITY_QUEUE_RETRIES"] ?? "3"),
        backoff: {
          type: "exponential",
          delay: parseInt(process.env["UTILITY_QUEUE_BACKOFF"] ?? "2000"),
        },
      },
    });
    
    logger.info("[UtilityQueue] Queue initialized");
  }
  
  return utilityQueue;
}

/**
 * Process a thread naming job with comprehensive error handling and timing
 */
async function processThreadNamingJob(
  jobData: ThreadNamingJobData,
  job: { id?: string | number | undefined }
): Promise<UtilityJobResult> {
  const { threadId, message } = jobData;
  const jobId = String(job.id ?? "unknown");
  const context: LogContext = {
    jobId,
    threadId,
    queue: QUEUE_NAME,
    stage: "processThreadNamingJob",
  };

  const log = childLogger(context);
  const endTimer = startTimer();

  try {
    log.info("[UtilityQueue] Processing thread naming job");

    // Import from worker file (no circular dependency)
    const { processThreadNamingJob: executeNaming } = await import("./thread-naming-job");
    const result = await executeNaming({ threadId, message });

    const durationMs = endTimer();

    log.info(
      { threadId, title: result.title, durationMs },
      "[UtilityQueue] Thread naming completed"
    );

    // Log slow jobs (>1s) at WARN level
    if (durationMs > 1000) {
      log.warn(
        { threadId, title: result.title, durationMs },
        "[UtilityQueue] Slow thread naming job"
      );
    }

    return {
      success: true,
      threadId,
      title: result.title,
    };
  } catch (error) {
    const durationMs = endTimer();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = error instanceof Error ? error.name : "UnknownError";

    log.error(
      { threadId, error: errorMessage, code: errorCode, durationMs, attempts: 1 },
      "[UtilityQueue] Thread naming failed"
    );

    // Return structured error response for retry handling
    return {
      success: false,
      threadId,
      error: errorMessage,
    };
  }
}


/**
 * Start the utility worker
 */
export async function startUtilityWorker(): Promise<void> {
  if (utilityWorker) {
    logger.warn("[UtilityQueue] Worker already running");
    return;
  }
  
  const connection = getBullMqRedis();
  const concurrency = parseInt(process.env["UTILITY_QUEUE_CONCURRENCY"] ?? "5");
  
  utilityWorker = new Worker<UtilityJobData, UtilityJobResult, string>(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case "thread-naming":
          return processThreadNamingJob(job.data as ThreadNamingJobData, job);
        default:
          throw new Error(`Unknown job type: ${job.name}`);
      }
    },
    {
      connection: connection,
      prefix: UTILITY_QUEUE_PREFIX,
      concurrency,
    }
  );
  
  // Set up event handlers with comprehensive logging
  utilityWorker.on("completed", (job) => {
    const context: LogContext = {
      jobId: String(job?.id ?? "unknown"),
      queue: QUEUE_NAME,
      stage: "jobCompleted",
    };
    const log = childLogger(context);

    // Parse duration from job processedOn timestamp if available
    const durationMs = job?.processedOn && job?.finishedOn
      ? job.finishedOn - job.processedOn
      : undefined;

    log.info(
      { jobId: job?.id, type: job?.name, durationMs },
      "[UtilityQueue] Job completed"
    );
  });

  utilityWorker.on("failed", (job, error) => {
    const context: LogContext = {
      jobId: String(job?.id ?? "unknown"),
      queue: QUEUE_NAME,
      stage: "jobFailed",
    };
    const log = childLogger(context);

    const attempts = job?.attemptsMade ?? 0;
    const maxRetries = parseInt(process.env["UTILITY_QUEUE_RETRIES"] ?? "3");

    log.error(
      {
        jobId: job?.id,
        type: job?.name,
        error: error?.message,
        attempts,
        maxRetries,
        threadId: job?.data?.threadId,
      },
      "[UtilityQueue] Job failed"
    );

    // Log retry attempt information
    if (attempts < maxRetries) {
      log.warn(
        { jobId: job?.id, attempt: attempts + 1, maxRetries },
        "[UtilityQueue] Retry scheduled"
      );
    }
  });

  utilityWorker.on("error", (error) => {
    logger.error({ error: error?.message, stack: error?.stack }, "[UtilityQueue] Worker error");
  });

  utilityWorker.on("stalled", (jobId) => {
    logger.warn({ jobId }, "[UtilityQueue] Job stalled");
  });

  // Also set up global queue events for monitoring
  queueEvents = new QueueEvents(QUEUE_NAME, {
    connection: getBullMqRedis(),
    prefix: UTILITY_QUEUE_PREFIX,
  });

  queueEvents.on("completed", ({ jobId, returnvalue }) => {
    logger.debug({ jobId, returnvalue }, "[UtilityQueue] Queue event: completed");
  });

  queueEvents.on("failed", ({ jobId, failedReason }) => {
    logger.warn({ jobId, failedReason }, "[UtilityQueue] Queue event: failed");
  });

  queueEvents.on("error", (error) => {
    logger.error({ error: error?.message }, "[UtilityQueue] Queue event: error");
  });

  logger.info(
    { concurrency, queueName: QUEUE_NAME },
    "[UtilityQueue] Worker started"
  );
}

/**
 * Add a utility job to the queue
 */
export async function addUtilityJob(
  jobName: string,
  data: UtilityJobData,
  options?: { jobId?: string; deduplicationId?: string }
): Promise<string | undefined> {
  const queue = getUtilityQueue();
  
  const job = await queue.add(jobName, data, {
    jobId: options?.jobId,
    deduplicationId: options?.deduplicationId,
  } as Record<string, unknown>);
  
  const context: LogContext = {
    jobId: String(job.id ?? "unknown"),
    queue: QUEUE_NAME,
    stage: "addUtilityJob",
  };
  const log = childLogger(context);
  log.info({ type: jobName, threadId: data.threadId }, "[UtilityQueue] Job queued");
  
  return job.id;
}

/**
 * Stop the utility worker gracefully
 */
export async function stopUtilityWorker(): Promise<void> {
  if (utilityWorker) {
    await utilityWorker.close();
    utilityWorker = null;
    logger.info("[UtilityQueue] Worker stopped");
  }
  
  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }
  
  if (utilityQueue) {
    await utilityQueue.close();
    utilityQueue = null;
    logger.info("[UtilityQueue] Queue closed");
  }
}

/**
 * Check if the utility queue is healthy
 */
export async function isUtilityQueueHealthy(): Promise<boolean> {
  try {
    const queue = getUtilityQueue();
    await queue.getJobCounts();
    return true;
  } catch {
    return false;
  }
}
