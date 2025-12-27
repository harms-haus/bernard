import { Queue, QueueEvents, Worker, type JobsOptions, type QueueOptions, type WorkerOptions, type Job } from "bullmq";

import type { AutomationEvent, AutomationJobPayload } from "./types";

export const automationQueueName = process.env["AUTOMATION_QUEUE_NAME"] ?? "automations";
const queuePrefix = process.env["QUEUE_PREFIX"] ?? "bernard:q";
const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";

function baseQueueOptions(): QueueOptions {
  return {
    connection: { url: redisUrl },
    prefix: queuePrefix
  };
}

export const defaultAutomationJobOptions: JobsOptions = {
  attempts: parseInt(process.env["AUTOMATION_TASK_ATTEMPTS"] ?? "3", 10) || 3,
  backoff: {
    type: "exponential",
    delay: parseInt(process.env["AUTOMATION_TASK_BACKOFF_MS"] ?? "1000", 10) || 1000
  },
  removeOnComplete: parseInt(process.env["AUTOMATION_TASK_KEEP_COMPLETED"] ?? "100", 10) || 100,
  removeOnFail: parseInt(process.env["AUTOMATION_TASK_KEEP_FAILED"] ?? "1000", 10) || 1000
};

export function createAutomationQueue(options: Partial<QueueOptions> = {}): Queue<AutomationJobPayload, unknown, string> {
  return new Queue<AutomationJobPayload, unknown, string>(automationQueueName, {
    ...baseQueueOptions(),
    ...options,
    defaultJobOptions: {
      ...defaultAutomationJobOptions,
      ...(options.defaultJobOptions ?? {})
    }
  });
}

export function createAutomationQueueEvents(options: Partial<QueueOptions> = {}): QueueEvents {
  return new QueueEvents(automationQueueName, { ...baseQueueOptions(), ...options });
}

export function createAutomationWorker(
  processor: (job: Job<AutomationJobPayload, unknown, string>) => Promise<unknown>,
  options: Partial<WorkerOptions> = {}
): Worker<AutomationJobPayload, unknown, string> {
  const concurrency = parseInt(process.env["AUTOMATION_TASK_CONCURRENCY"] ?? "3", 10) || 3;
  return new Worker<AutomationJobPayload, unknown, string>(automationQueueName, processor, {
    ...baseQueueOptions(),
    concurrency,
    ...options
  });
}

/**
 * Enqueue an automation job for processing
 */
export async function enqueueAutomationJob(automationId: string, event: AutomationEvent): Promise<void> {
  const queue = createAutomationQueue();

  const payload: AutomationJobPayload = {
    automationId,
    event
  };

  const jobId = `${automationId}:${event.name}:${event.timestamp}`;

  await queue.add(automationId, payload, { jobId });

  // Clean up queue reference
  await queue.close();
}
