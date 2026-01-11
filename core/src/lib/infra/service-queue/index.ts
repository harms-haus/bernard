import { Queue, Job } from 'bullmq';
import type {
  ServiceAction,
  ServiceActionJobData,
  ServiceActionResult,
  ServiceJobInfo,
  ServiceQueueStats,
} from './types';

const QUEUE_NAME = "service-actions";
const QUEUE_PREFIX = "bernard:queue:service-actions";

let serviceQueue: Queue<ServiceActionJobData, ServiceActionResult, string> | null = null;

export async function getServiceQueue(): Promise<
  Queue<ServiceActionJobData, ServiceActionResult, string>
> {
  if (!serviceQueue) {
    const { getBullMqRedis } = await import('../queue');
    const connection = getBullMqRedis();

    serviceQueue = new Queue<ServiceActionJobData, ServiceActionResult, string>(
      QUEUE_NAME,
      {
        connection: connection as any,
        prefix: QUEUE_PREFIX,
        defaultJobOptions: {
          removeOnComplete: {
            age: 3600,
            count: 100,
          },
          removeOnFail: {
            age: 86400,
            count: 50,
          },
          attempts: 1,
        },
      }
    );
  }
  return serviceQueue;
}

export async function addServiceJob(
  serviceId: string,
  action: ServiceAction,
  options?: {
    initiatedBy?: string;
    requestId?: string;
  }
): Promise<string> {
  const queue = await getServiceQueue();

  const jobData: ServiceActionJobData = {
    serviceId,
    action,
    initiatedBy: options?.initiatedBy,
    requestId: options?.requestId || generateRequestId(),
  };

  const job = await queue.add(`${serviceId}:${action}`, jobData, {
    jobId: `${serviceId}:${action}:${Date.now()}`,
  });

  return job.id!;
}

export async function getServiceJobStatus(
  jobId: string
): Promise<ServiceJobInfo | null> {
  const queue = await getServiceQueue();
  const job = await queue.getJob(jobId);

  if (!job) return null;

  const state = await job.getState();

  return {
    jobId: job.id!,
    serviceId: job.data.serviceId,
    action: job.data.action,
    status: state as ServiceJobInfo["status"],
    queuedAt: new Date(job.timestamp),
    startedAt: job.processedOn ? new Date(job.processedOn) : undefined,
    completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
    result: job.returnvalue,
    error: job.failedReason,
    attemptsMade: job.attemptsMade,
    attemptsMax: job.opts.attempts || 1,
  };
}

export async function getServiceJobs(
  serviceId?: string
): Promise<ServiceJobInfo[]> {
  const queue = await getServiceQueue();
  const jobs = await queue.getJobs(
    ['waiting', 'active', 'completed', 'failed'],
    0,
    50
  );

  const filtered = serviceId
    ? jobs.filter((job) => job.data.serviceId === serviceId)
    : jobs;

  return Promise.all(
    filtered.map(async (job) => {
      const state = await job.getState();
      return {
        jobId: job.id!,
        serviceId: job.data.serviceId,
        action: job.data.action,
        status: state as ServiceJobInfo["status"],
        queuedAt: new Date(job.timestamp),
        startedAt: job.processedOn ? new Date(job.processedOn) : undefined,
        completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
        result: job.returnvalue,
        error: job.failedReason,
        attemptsMade: job.attemptsMade,
        attemptsMax: job.opts.attempts || 1,
      };
    })
  );
}

export async function getAllServiceJobs(): Promise<ServiceJobInfo[]> {
  return getServiceJobs();
}

export async function getQueueStats(): Promise<ServiceQueueStats> {
  const queue = await getServiceQueue();
  const counts = await queue.getJobCounts(
    'waiting',
    'active',
    'completed',
    'delayed',
    'failed'
  );

  return {
    waiting: counts.waiting || 0,
    active: counts.active || 0,
    completed: counts.completed || 0,
    delayed: counts.delayed || 0,
    failed: counts.failed || 0,
  };
}

export async function retryJob(jobId: string): Promise<string | null> {
  const queue = await getServiceQueue();
  const job = await queue.getJob(jobId);

  if (!job || !job.data) return null;

  const newJob = await queue.add(
    `${job.data.serviceId}:${job.data.action}`,
    job.data
  );
  return newJob.id ?? null;
}

export async function cancelJob(jobId: string): Promise<boolean> {
  const queue = await getServiceQueue();
  const job = await queue.getJob(jobId);

  if (!job) return false;

  const state = await job.getState();
  if (state !== 'waiting') return false;

  await job.remove();
  return true;
}

export async function closeServiceQueue(): Promise<void> {
  if (serviceQueue) {
    await serviceQueue.close();
    serviceQueue = null;
  }
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
