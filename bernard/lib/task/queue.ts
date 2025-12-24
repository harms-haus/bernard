import { Queue, QueueEvents, Worker, type JobsOptions, type QueueOptions, type WorkerOptions, type Job } from "bullmq";

import type { TaskPayload } from "./types";

// Default configuration - can be overridden by settings
const DEFAULT_CONFIG = {
  taskQueueName: process.env["TASK_QUEUE_NAME"] ?? "background-tasks",
  queuePrefix: process.env["QUEUE_PREFIX"] ?? "bernard:q",
  redisUrl: process.env["REDIS_URL"] ?? "redis://localhost:6379",
  workerConcurrency: parseInt(process.env["TASK_WORKER_CONCURRENCY"] ?? "3", 10) || 3,
  maxRuntimeMs: parseInt(process.env["TASK_MAX_RUNTIME_MS"] ?? "3600000", 10) || 3600000,
  attempts: parseInt(process.env["TASK_ATTEMPTS"] ?? "3", 10) || 3,
  backoffMs: parseInt(process.env["TASK_BACKOFF_MS"] ?? "1000", 10) || 1000,
  keepCompleted: parseInt(process.env["TASK_KEEP_COMPLETED"] ?? "50", 10) || 50,
  keepFailed: parseInt(process.env["TASK_KEEP_FAILED"] ?? "100", 10) || 100,
  archiveAfterDays: parseInt(process.env["TASK_ARCHIVE_AFTER_DAYS"] ?? "7", 10) || 7
};

export interface TaskWorkerConfig {
  taskQueueName: string;
  queuePrefix: string;
  redisUrl: string;
  workerConcurrency: number;
  maxRuntimeMs: number;
  attempts: number;
  backoffMs: number;
  keepCompleted: number;
  keepFailed: number;
  archiveAfterDays: number;
}

// Global config that can be set by the worker
let globalConfig: TaskWorkerConfig = { ...DEFAULT_CONFIG };

// Export the current queue name for backward compatibility
export const taskQueueName = globalConfig.taskQueueName;

export function setTaskWorkerConfig(config: Partial<TaskWorkerConfig>) {
  globalConfig = { ...globalConfig, ...config };
}

function baseQueueOptions(): QueueOptions {
  return {
    connection: { url: globalConfig.redisUrl },
    prefix: globalConfig.queuePrefix
  };
}

function getDefaultTaskJobOptions(): JobsOptions {
  return {
    attempts: globalConfig.attempts,
    backoff: {
      type: "exponential",
      delay: globalConfig.backoffMs
    },
    removeOnComplete: globalConfig.keepCompleted,
    removeOnFail: globalConfig.keepFailed
  };
}

export function createTaskQueue(options: Partial<QueueOptions> = {}): Queue<TaskPayload, unknown, string> {
  return new Queue<TaskPayload, unknown, string>(globalConfig.taskQueueName, {
    ...baseQueueOptions(),
    ...options,
    defaultJobOptions: {
      ...getDefaultTaskJobOptions(),
      ...(options.defaultJobOptions ?? {})
    }
  });
}

export function createTaskQueueEvents(options: Partial<QueueOptions> = {}): QueueEvents {
  return new QueueEvents(globalConfig.taskQueueName, { ...baseQueueOptions(), ...options });
}

export function createTaskWorker(
  processor: (job: Job<TaskPayload, unknown, string>) => Promise<unknown>,
  options: Partial<WorkerOptions> = {}
): Worker<TaskPayload, unknown, string> {
  return new Worker<TaskPayload, unknown, string>(globalConfig.taskQueueName, processor, {
    ...baseQueueOptions(),
    concurrency: globalConfig.workerConcurrency,
    ...options
  });
}

/**
 * Enqueue a task for background processing
 */
export async function enqueueTask(taskId: string, payload: TaskPayload): Promise<void> {
  const queue = createTaskQueue();

  const jobId = `task:${taskId}:${Date.now()}`;

  await queue.add(taskId, payload, { jobId });

  // Clean up queue reference
  await queue.close();
}
