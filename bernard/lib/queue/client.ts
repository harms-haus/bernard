import { Queue, QueueEvents, Worker, type JobsOptions, type QueueOptions, type WorkerOptions, type Job } from "bullmq";

import type { ConversationTaskName, ConversationTaskPayload } from "./types";

export const conversationQueueName = process.env["CONVERSATION_QUEUE_NAME"] ?? "conversation-tasks";
const queuePrefix = process.env["QUEUE_PREFIX"] ?? "bernard:q";
const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";

function baseQueueOptions(): QueueOptions {
  return {
    connection: { url: redisUrl },
    prefix: queuePrefix
  };
}

export const defaultConversationJobOptions: JobsOptions = {
  attempts: parseInt(process.env["CONVERSATION_TASK_ATTEMPTS"] ?? "3", 10) || 3,
  backoff: {
    type: "exponential",
    delay: parseInt(process.env["CONVERSATION_TASK_BACKOFF_MS"] ?? "1000", 10) || 1000
  },
  removeOnComplete: parseInt(process.env["CONVERSATION_TASK_KEEP_COMPLETED"] ?? "100", 10) || 100,
  removeOnFail: parseInt(process.env["CONVERSATION_TASK_KEEP_FAILED"] ?? "1000", 10) || 1000
};

export function createConversationQueue(options: Partial<QueueOptions> = {}): Queue<ConversationTaskPayload, unknown, ConversationTaskName> {
  return new Queue<ConversationTaskPayload, unknown, ConversationTaskName>(conversationQueueName, {
    ...baseQueueOptions(),
    ...options,
    defaultJobOptions: {
      ...defaultConversationJobOptions,
      ...(options.defaultJobOptions ?? {})
    }
  });
}

export function createConversationQueueEvents(options: Partial<QueueOptions> = {}): QueueEvents {
  return new QueueEvents(conversationQueueName, { ...baseQueueOptions(), ...options });
}

export function createConversationWorker(
  processor: (job: Job<ConversationTaskPayload, unknown, ConversationTaskName>) => Promise<unknown>,
  options: Partial<WorkerOptions> = {}
): Worker<ConversationTaskPayload, unknown, ConversationTaskName> {
  const concurrency = parseInt(process.env["CONVERSATION_TASK_CONCURRENCY"] ?? "3", 10) || 3;
  return new Worker<ConversationTaskPayload, unknown, ConversationTaskName>(conversationQueueName, processor, {
    ...baseQueueOptions(),
    concurrency,
    ...options
  });
}

