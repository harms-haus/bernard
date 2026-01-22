# Worker Queue System Overhaul - Implementation Plan

**Generated:** 2026-01-22
**Status:** Planning Phase

---

## Current State Summary

Based on comprehensive codebase research, here's what exists today:

| Component | Current State | Key Files |
|-----------|---------------|------------|
| **Queues** | 2 separate queues (`utility`, `service-actions`) | `core/src/lib/infra/queue.ts`, `core/src/lib/infra/service-queue/` |
| **Job Types** | Utility: `thread-naming`<br>Service: `start`, `stop`, `restart`, `check` | `core/src/lib/infra/queue.ts`, `core/src/lib/infra/service-queue/types.ts` |
| **Logging** | Pino structured logging with child loggers, no `job.log()` usage | `core/src/lib/logging/logger.ts` |
| **Job History** | BullMQ only, auto-cleanup (100 completed, 500 failed) | Queue configuration |
| **Database** | Redis only (no SQL) | No Prisma schema |
| **API Endpoints** | `/api/services/jobs/*` for service queue only | `core/src/app/api/services/jobs/` routes |
| **UI** | Admin section exists (Status, Models, Services, Users) | `core/src/app/(dashboard)/bernard/admin/` pages |

---

## Proposed Architecture

### 1. Single Unified Queue: `workerQueue`

Consolidate both queues into one with job type differentiation:

```typescript
// Unified job types
export type WorkerJobType =
  | "thread-naming"      // from utility queue
  | "metadata-update"     // future utility
  | "embedding-cache"      // future utility
  | "service:start"       // from service queue
  | "service:stop"        // from service queue
  | "service:restart"     // from service queue
  | "service:check"       // from service queue
  | "custom";            // future extensibility

export interface WorkerJobData {
  type: WorkerJobType;
  data: unknown; // Union of all job data types
  metadata?: {
    userId?: string;
    initiatedBy?: string;
    requestId?: string;
    threadId?: string;
  };
}

export interface ThreadNamingJobData {
  threadId: string;
  messages: Array<{ type: string; content: unknown }>;
}

export interface ServiceActionJobData {
  serviceId: string;
  action: "start" | "stop" | "restart" | "check";
  initiatedBy?: string;
  requestId?: string;
}
```

### 2. Enhanced Status Tracking

Expanded status enum with all requested states:

```typescript
export type WorkerJobStatus =
  | "queued"        // Initial state
  | "starting"      // Worker picked up job
  | "running"       // Active processing
  | "cleaning-up"   // Post-processing
  | "finished"       // Success
  | "errored"       // Failed after retries
  | "cancelled"      // User/admin cancelled
  | "delayed";      // Scheduled for future
```

### 3. Job History Storage

Create a dedicated Redis-based history service:

```
Key Pattern: bernard:job-history:{jobId}
Fields (Hash):
- jobId: string
- type: string
- queueName: string (always "workerQueue")
- jobData: JSON
- status: string
- logs: JSON array (log entries)
- queuedAt: timestamp
- startedAt: timestamp?
- completedAt: timestamp?
- durationMs: number?
- result: JSON?
- error: string?
- attempts: number
- rerunOf?: string (original job ID if this is a rerun)

Index for time-based queries:
Key: bernard:job-history:completed-index (Sorted Set)
Key: bernard:job-history:failed-index (Sorted Set)
Score: timestamp, Member: {timestamp}:{jobId}
```

### 4. Built-in BullMQ Logging Integration

Use `job.log()` for per-job logs and `QueueEvents` for monitoring:

```typescript
// Inside job processor
await job.log("Starting thread naming operation...");
await job.log("Fetching conversation messages...");
await job.log("Calling LLM for title generation...");
await job.log("Title generated successfully: 'AI Conversation'");

// QueueEvents listener for external storage
queueEvents.on('log', ({ jobId, log }) => {
  jobHistoryService.appendLog(jobId, log);
});

// Forward to Pino for console output
queueEvents.on('log', ({ jobId, log }) => {
  logger.info({ jobId, log }, `[WorkerQueue] Job log: ${log}`);
});
```

---

## File Structure

### New Files

```
core/src/lib/infra/worker-queue/
├── index.ts           # Main exports (queue, worker, jobs)
├── types.ts          # Unified job types
├── processor.ts       # Job processor with all handlers
├── history.ts        # Job history service (Redis-based)
├── logger.ts         # BullMQ logging integration
└── config.ts         # Queue configuration

core/src/app/api/admin/jobs/
├── route.ts           # GET /api/admin/jobs (list with filters)
├── [jobId]/
│   ├── route.ts      # GET /api/admin/jobs/[jobId] (details + logs)
│   ├── rerun/route.ts # POST /api/admin/jobs/[jobId]/rerun
│   ├── cancel/route.ts # POST /api/admin/jobs/[jobId]/cancel
│   └── delete/route.ts # DELETE /api/admin/jobs/[jobId]/delete
├── stats/route.ts     # GET /api/admin/jobs/stats
└── stream/route.ts     # GET /api/admin/jobs/stream (SSE for real-time updates)

core/src/app/(dashboard)/bernard/admin/jobs/
├── page.tsx          # Main jobs admin page (table view)
└── [jobId]/
    └── page.tsx      # Individual job details page (no dialogs)

core/src/components/jobs/
├── JobTable.tsx       # Reusable table component
├── JobStatusBadge.tsx  # Status badge with animations
├── JobActionsMenu.tsx   # Actions dropdown per row
└── index.ts
```

### Deleted Files

```
core/src/lib/infra/queue.ts
core/src/lib/infra/service-queue/
core/src/lib/infra/service-queue/index.ts
core/src/lib/infra/service-queue/types.ts
core/src/lib/infra/service-queue/worker.ts
core/src/lib/infra/service-queue/init.ts
core/src/lib/infra/thread-naming-job.ts
core/scripts/service-worker.ts
core/src/app/api/services/jobs/
├── queue/route.ts
├── [jobId]/status/route.ts
└── stats/route.ts
```

---

## Implementation Plan

### Phase 1: Core Queue Refactoring

#### 1.1 Create New Unified Queue Module

**Directory**: `core/src/lib/infra/worker-queue/`

**File**: `types.ts`
```typescript
export type WorkerJobType =
  | "thread-naming"
  | "metadata-update"
  | "embedding-cache"
  | "service:start"
  | "service:stop"
  | "service:restart"
  | "service:check"
  | "custom";

export type WorkerJobStatus =
  | "queued"
  | "starting"
  | "running"
  | "cleaning-up"
  | "finished"
  | "errored"
  | "cancelled"
  | "delayed";

export interface WorkerJobData {
  type: WorkerJobType;
  data: unknown;
  metadata?: {
    userId?: string;
    initiatedBy?: string;
    requestId?: string;
    threadId?: string;
  };
}

export interface ThreadNamingJobData {
  threadId: string;
  messages: Array<{ type: string; content: unknown }>;
}

export interface ServiceActionJobData {
  serviceId: string;
  action: "start" | "stop" | "restart" | "check";
  initiatedBy?: string;
  requestId?: string;
}

export interface JobLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface JobHistory {
  jobId: string;
  type: WorkerJobType;
  status: WorkerJobStatus;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  waitTimeMs?: number;
  runTimeMs?: number;
  logs: JobLog[];
  data?: any;
  result?: any;
  error?: string;
  attempts: number;
  rerunOf?: string;
}

export interface ListJobsOptions {
  status?: WorkerJobStatus[];
  type?: WorkerJobType[];
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  limit?: number;
  offset?: number;
}

export interface QueueStats {
  queued: number;
  starting: number;
  running: number;
  cleaningUp: number;
  finished: number;
  errored: number;
  cancelled: number;
  delayed: number;
  total: number;
}
```

**File**: `config.ts`
```typescript
const QUEUE_NAME = "workerQueue";
const QUEUE_PREFIX = "bernard:queue:worker";

export const WORKER_QUEUE_CONFIG = {
  name: QUEUE_NAME,
  prefix: QUEUE_PREFIX,
  retention: {
    completedAge: parseInt(process.env["WORKER_QUEUE_RETENTION_COMPLETED_DAYS"] ?? "7") * 86400,
    completedCount: parseInt(process.env["WORKER_QUEUE_RETENTION_COMPLETED_COUNT"] ?? "1000"),
    failedAge: parseInt(process.env["WORKER_QUEUE_RETENTION_FAILED_DAYS"] ?? "30") * 86400,
    failedCount: parseInt(process.env["WORKER_QUEUE_RETENTION_FAILED_COUNT"] ?? "5000"),
  },
  retry: {
    attempts: parseInt(process.env["WORKER_QUEUE_RETRIES"] ?? "3"),
    backoff: {
      type: "exponential" as const,
      delay: parseInt(process.env["WORKER_QUEUE_BACKOFF_DELAY"] ?? "2000"),
    },
  },
  concurrency: parseInt(process.env["WORKER_QUEUE_CONCURRENCY"] ?? "10"),
  historyRetentionDays: parseInt(process.env["WORKER_QUEUE_HISTORY_RETENTION_DAYS"] ?? "90"),
} as const;
```

**File**: `history.ts`
```typescript
import { getBullMqRedis } from '../queue';
import Redis from 'ioredis';
import type { JobHistory, JobLog, WorkerJobStatus, ListJobsOptions } from './types';

class JobHistoryService {
  private redis: Redis;
  private prefix = "bernard:job-history";

  constructor() {
    this.redis = getBullMqRedis();
  }

  // Record job metadata
  async recordJob(jobId: string, type: string, data: any): Promise<void> {
    await this.redis.hset(`${this.prefix}:${jobId}`, {
      jobId,
      type,
      queueName: "workerQueue",
      jobData: JSON.stringify(data),
      status: "queued",
      queuedAt: new Date().toISOString(),
      logs: JSON.stringify([]),
      attempts: 0,
    });
  }

  // Update job status
  async updateStatus(jobId: string, status: WorkerJobStatus): Promise<void> {
    const timestamp = new Date().toISOString();
    await this.redis.hset(`${this.prefix}:${jobId}`, {
      status,
      ...(status === "starting" && { startedAt: timestamp }),
      ...(status === "finished" && { completedAt: timestamp }),
    });
  }

  // Append log entry
  async appendLog(jobId: string, log: string, level: 'info' | 'warn' | 'error' = 'info'): Promise<void> {
    const key = `${this.prefix}:${jobId}`;
    const logs = await this.redis.hget(key, 'logs');
    const logsArray = logs ? JSON.parse(logs) : [];

    logsArray.push({
      timestamp: new Date().toISOString(),
      level,
      message: log,
    });

    await this.redis.hset(key, 'logs', JSON.stringify(logsArray));
  }

  // Get all logs for a job
  async getLogs(jobId: string): Promise<JobLog[]> {
    const logs = await this.redis.hget(`${this.prefix}:${jobId}`, 'logs');
    return logs ? JSON.parse(logs) : [];
  }

  // Get job history
  async getJobHistory(jobId: string): Promise<JobHistory | null> {
    const job = await this.redis.hgetall(`${this.prefix}:${jobId}`);
    if (!job || Object.keys(job).length === 0) return null;

    return {
      ...job,
      logs: job.logs ? JSON.parse(job.logs) : [],
      jobData: job.jobData ? JSON.parse(job.jobData) : undefined,
      result: job.result ? JSON.parse(job.result) : undefined,
    } as JobHistory;
  }

  // List jobs with pagination and filters
  async listJobs(options: ListJobsOptions = {}): Promise<JobHistory[]> {
    // Implementation using Redis SCAN with filtering
    // Returns paginated results
  }

  // Delete job from history
  async deleteJob(jobId: string): Promise<void> {
    await this.redis.del(`${this.prefix}:${jobId}`);
  }

  // Record rerun relationship
  async recordRerun(originalJobId: string, newJobId: string): Promise<void> {
    await this.redis.hset(`${this.prefix}:${newJobId}`, 'rerunOf', originalJobId);
  }
}

export const jobHistoryService = new JobHistoryService();
```

**File**: `logger.ts`
```typescript
import { QueueEvents } from 'bullmq';
import { logger } from '../logging/logger';
import { jobHistoryService } from './history';

export function setupQueueLogging(queueEvents: QueueEvents): void {
  // Forward job logs to console
  queueEvents.on('log', ({ jobId, log }) => {
    logger.info({ jobId, log }, `[WorkerQueue] Job log: ${log}`);
  });

  // Store logs in history
  queueEvents.on('log', ({ jobId, log }) => {
    jobHistoryService.appendLog(jobId, log, 'info');
  });

  // Progress updates
  queueEvents.on('progress', ({ jobId, data }) => {
    logger.info({ jobId, progress: data }, `[WorkerQueue] Job progress: ${data}%`);
  });

  // Job lifecycle events
  queueEvents.on('completed', ({ jobId, returnvalue }) => {
    logger.info({ jobId, result: returnvalue }, `[WorkerQueue] Job completed`);
    jobHistoryService.updateStatus(jobId, 'finished');
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    logger.error({ jobId, error: failedReason }, `[WorkerQueue] Job failed`);
    jobHistoryService.updateStatus(jobId, 'errored');
  });

  queueEvents.on('waiting', ({ jobId }) => {
    jobHistoryService.updateStatus(jobId, 'queued');
  });

  queueEvents.on('active', ({ jobId }) => {
    jobHistoryService.updateStatus(jobId, 'running');
  });

  queueEvents.on('delayed', ({ jobId }) => {
    jobHistoryService.updateStatus(jobId, 'delayed');
  });

  queueEvents.on('removed', ({ jobId }) => {
    jobHistoryService.updateStatus(jobId, 'cancelled');
  });
}
```

**File**: `processor.ts`
```typescript
import { Job, Worker, Queue } from 'bullmq';
import { logger } from '../logging/logger';
import { childLogger, type LogContext } from '../logging/logger';
import { jobHistoryService } from './history';
import type { WorkerJobData, WorkerJobType, WorkerJobStatus } from './types';

// Thread naming processor (moved from queue.ts)
async function processThreadNamingJob(jobData: any, job: Job): Promise<any> {
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
    await job.log('Starting thread naming job');
    await jobHistoryService.updateStatus(jobId, 'running');

    const { processThreadNamingJob: executeNaming } = await import('../thread-naming-job');
    const result = await executeNaming({ threadId, messages });

    await job.log(`Thread naming completed: ${result.title}`);
    await jobHistoryService.updateStatus(jobId, 'finished');

    return {
      success: true,
      threadId,
      title: result.title,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await job.log(`Thread naming failed: ${errorMessage}`);
    await jobHistoryService.updateStatus(jobId, 'errored');

    return {
      success: false,
      threadId,
      error: errorMessage,
    };
  }
}

// Service action processor (moved from service-queue/worker.ts)
async function processServiceActionJob(jobData: any, job: Job): Promise<any> {
  const { serviceId, action } = jobData;
  const jobId = String(job.id);
  const context: LogContext = {
    jobId,
    serviceId,
    queue: 'workerQueue',
    stage: 'processServiceAction',
  };

  const log = childLogger(context);

  try {
    await job.log(`Processing ${action} for ${serviceId}`);
    await jobHistoryService.updateStatus(jobId, 'running');

    const serviceManager = (await import('../services/ServiceManager')).ServiceManager;

    let result;
    switch (action) {
      case 'start':
        result = await serviceManager.startService(serviceId);
        break;
      case 'stop':
        result = await serviceManager.stopService(serviceId);
        break;
      case 'restart':
        result = await serviceManager.restartService(serviceId);
        break;
      case 'check':
        result = await serviceManager.checkService(serviceId);
        break;
    }

    await job.log(`${action} completed for ${serviceId}`);
    await jobHistoryService.updateStatus(jobId, 'finished');

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await job.log(`${action} failed for ${serviceId}: ${errorMessage}`);
    await jobHistoryService.updateStatus(jobId, 'errored');

    return {
      success: false,
      serviceId,
      action,
      error: errorMessage,
    };
  }
}

// Main processor
export async function createWorker(queue: Queue): Promise<Worker> {
  const concurrency = parseInt(process.env["WORKER_QUEUE_CONCURRENCY"] ?? "10");

  const worker = new Worker(
    'workerQueue',
    async (job: Job) => {
      const { type, data } = job.data as WorkerJobData;

      await jobHistoryService.updateStatus(job.id, 'starting');

      switch (type) {
        case 'thread-naming':
          return processThreadNamingJob(data, job);
        case 'service:start':
        case 'service:stop':
        case 'service:restart':
        case 'service:check':
          return processServiceActionJob(data, job);
        default:
          throw new Error(`Unknown job type: ${type}`);
      }
    },
    {
      connection: getBullMqRedis() as any,
      prefix: 'bernard:queue:worker',
      concurrency,
    }
  );

  // Worker event handlers
  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, type: job.name }, '[WorkerQueue] Job completed');
  });

  worker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, type: job?.name, error: error?.message }, '[WorkerQueue] Job failed');
  });

  worker.on('error', (error) => {
    logger.error({ error: error?.message, stack: error?.stack }, '[WorkerQueue] Worker error');
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId }, '[WorkerQueue] Job stalled');
  });

  logger.info({ concurrency, queueName: 'workerQueue' }, '[WorkerQueue] Worker started');
  return worker;
}
```

**File**: `index.ts`
```typescript
import { Queue, QueueEvents, Job } from 'bullmq';
import { getBullMqRedis } from '../queue';
import { setupQueueLogging } from './logger';
import { createWorker } from './processor';
import { jobHistoryService } from './history';
import { WORKER_QUEUE_CONFIG } from './config';
import type {
  WorkerJobData,
  JobHistory,
  ListJobsOptions,
  QueueStats,
  WorkerJobStatus,
} from './types';

let workerQueue: Queue<WorkerJobData, any, string> | null = null;
let worker: any = null;
let queueEvents: QueueEvents | null = null;

// Get queue instance
export async function getWorkerQueue(): Promise<Queue<WorkerJobData, any, string>> {
  if (!workerQueue) {
    const connection = getBullMqRedis();

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
  }

  return workerQueue;
}

// Add job to queue
export async function addJob(
  type: string,
  data: any,
  options?: {
    jobId?: string;
    deduplicationId?: string;
    delay?: number;
  }
): Promise<string> {
  const queue = await getWorkerQueue();

  const job = await queue.add(type, { type, data }, {
    jobId: options?.jobId,
    deduplicationId: options?.deduplicationId,
    delay: options?.delay,
  });

  const jobData: WorkerJobData = { type, data };
  await jobHistoryService.recordJob(job.id!, type, jobData);

  return job.id!;
}

// Get job from queue
export async function getJob(jobId: string): Promise<Job | null> {
  const queue = await getWorkerQueue();
  return await queue.getJob(jobId);
}

// List jobs from history
export async function listJobs(options: ListJobsOptions = {}): Promise<JobHistory[]> {
  return await jobHistoryService.listJobs(options);
}

// Get job history
export async function getJobHistory(jobId: string): Promise<JobHistory | null> {
  return await jobHistoryService.getJobHistory(jobId);
}

// Get job logs
export async function getJobLogs(jobId: string): Promise<any[]> {
  return await jobHistoryService.getLogs(jobId);
}

// Get queue stats
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

// Rerun job (creates copy)
export async function rerunJob(jobId: string): Promise<string | null> {
  const job = await getJob(jobId);

  if (!job || !job.data) return null;

  const newJob = await queue!.add(job.name, job.data, {
    // Don't remove original job
    removeOnComplete: false,
  });

  // Record rerun relationship
  await jobHistoryService.recordRerun(jobId, newJob.id!);

  return newJob.id ?? null;
}

// Cancel job (running only)
export async function cancelJob(jobId: string): Promise<boolean> {
  const job = await getJob(jobId);

  if (!job) return false;

  const state = await job.getState();

  // Only cancel active/waiting jobs
  if (state !== 'active' && state !== 'waiting') {
    return false;
  }

  await job.remove();
  await jobHistoryService.updateStatus(jobId, 'cancelled');

  return true;
}

// Delete job (completed, queued, errored, cancelled only)
export async function deleteJob(jobId: string): Promise<boolean> {
  const job = await getJob(jobId);

  if (!job) return false;

  const state = await job.getState();

  // Only delete non-running jobs
  if (state === 'active' || state === 'starting') {
    return false;
  }

  await job.remove();
  await jobHistoryService.deleteJob(jobId);

  return true;
}

// Start worker
export async function startWorker(): Promise<void> {
  if (worker) {
    logger.warn('[WorkerQueue] Worker already running');
    return;
  }

  const queue = await getWorkerQueue();
  worker = await createWorker(queue);
}

// Stop worker
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

// Check health
export async function isWorkerQueueHealthy(): Promise<boolean> {
  try {
    const queue = await getWorkerQueue();
    await queue.getJobCounts();
    return true;
  } catch {
    return false;
  }
}
```

#### 1.2 Update Existing Job Processors

**Move** thread-naming logic from `core/src/lib/infra/thread-naming-job.ts` into `processor.ts`.

**Move** service action logic from `core/src/lib/infra/service-queue/worker.ts` into `processor.ts`.

**Add** `job.log()` calls at each processing step:
- Before starting: `await job.log('Starting {job type}...')`
- After completion: `await job.log('{job type} completed')`
- On error: `await job.log('Error: {message}')`

#### 1.3 Update Dev Server Startup

**File**: `core/scripts/dev.ts`

```typescript
// OLD:
await Promise.all([
  startUtilityWorker(),
  startServiceWorker(),
]);

// NEW:
await startWorker(); // Unified worker
```

#### 1.4 Update Production Worker Script

**File**: `core/scripts/worker.ts`

```typescript
import { startWorker } from '../src/lib/infra/worker-queue';

await startWorker();
```

---

### Phase 2: API Layer

#### 2.1 Create Job Management API Endpoints

**Directory**: `core/src/app/api/admin/jobs/`

**File**: `route.ts` (GET /api/admin/jobs)
```typescript
import { requireAdmin } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { listJobs, getQueueStats } from '@/lib/infra/worker-queue';
import type { ListJobsOptions } from '@/lib/infra/worker-queue/types';

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const options: ListJobsOptions = {
    status: searchParams.get('status')?.split(',') as any,
    type: searchParams.get('type')?.split(',') as any,
    limit: parseInt(searchParams.get('limit') || '50'),
    offset: parseInt(searchParams.get('offset') || '0'),
  };

  const jobs = await listJobs(options);
  const stats = await getQueueStats();

  return NextResponse.json({ jobs, stats });
}
```

**File**: `[jobId]/route.ts` (GET /api/admin/jobs/[jobId])
```typescript
import { requireAdmin } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getJobHistory, getJobLogs } from '@/lib/infra/worker-queue';

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const job = await getJobHistory(params.jobId);

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json(job);
}
```

**File**: `[jobId]/rerun/route.ts` (POST /api/admin/jobs/[jobId]/rerun)
```typescript
import { requireAdmin } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { rerunJob } from '@/lib/infra/worker-queue';

export async function POST(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const newJobId = await rerunJob(params.jobId);

  if (!newJobId) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ newJobId });
}
```

**File**: `[jobId]/cancel/route.ts` (POST /api/admin/jobs/[jobId]/cancel)
```typescript
import { requireAdmin } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { cancelJob } from '@/lib/infra/worker-queue';

export async function POST(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const success = await cancelJob(params.jobId);

  if (!success) {
    return NextResponse.json({ error: 'Cannot cancel job' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
```

**File**: `[jobId]/delete/route.ts` (DELETE /api/admin/jobs/[jobId]/delete)
```typescript
import { requireAdmin } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { deleteJob } from '@/lib/infra/worker-queue';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const success = await deleteJob(params.jobId);

  if (!success) {
    return NextResponse.json({ error: 'Cannot delete job' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
```

**File**: `stats/route.ts` (GET /api/admin/jobs/stats)
```typescript
import { requireAdmin } from '@/lib/auth/middleware';
import { NextResponse } from 'next/server';
import { getQueueStats } from '@/lib/infra/worker-queue';

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stats = await getQueueStats();

  return NextResponse.json(stats);
}
```

**File**: `stream/route.ts` (GET /api/admin/jobs/stream)
```typescript
import { requireAdmin } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { QueueEvents } from 'bullmq';
import { getBullMqRedis } from '@/lib/infra/queue';
import { WORKER_QUEUE_CONFIG } from '@/lib/infra/worker-queue/config';

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Set up SSE
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const queueEvents = new QueueEvents(WORKER_QUEUE_CONFIG.name, {
        connection: getBullMqRedis() as any,
        prefix: WORKER_QUEUE_CONFIG.prefix,
      });

      const sendEvent = (event: string, data: any) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Queue events
      queueEvents.on('waiting', ({ jobId }) => sendEvent('job:queued', { jobId }));
      queueEvents.on('active', ({ jobId }) => sendEvent('job:started', { jobId }));
      queueEvents.on('completed', ({ jobId, returnvalue }) => sendEvent('job:finished', { jobId, result: returnvalue }));
      queueEvents.on('failed', ({ jobId, failedReason }) => sendEvent('job:errored', { jobId, error: failedReason }));
      queueEvents.on('progress', ({ jobId, data }) => sendEvent('job:progress', { jobId, progress: data }));
      queueEvents.on('delayed', ({ jobId }) => sendEvent('job:delayed', { jobId }));
      queueEvents.on('removed', ({ jobId }) => sendEvent('job:cancelled', { jobId }));
      queueEvents.on('stalled', ({ jobId }) => sendEvent('job:stalled', { jobId }));

      // Send keepalive every 30 seconds
      const keepalive = setInterval(() => {
        controller.enqueue(encoder.encode(': keepalive\n\n'));
      }, 30000);

      // Cleanup on client disconnect
      req.signal.addEventListener('abort', async () => {
        clearInterval(keepalive);
        await queueEvents.close();
        controller.close();
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

#### 2.2 Remove Old APIs

**Delete** these files completely:
```
core/src/app/api/services/jobs/queue/route.ts
core/src/app/api/services/jobs/[jobId]/status/route.ts
core/src/app/api/services/jobs/stats/route.ts
```

**Update** these files to use new queue:
- `core/src/app/api/threads/[threadId]/auto-rename/route.ts` → use `addJob('thread-naming')`
- `core/src/app/api/services/[service]/route.ts` → use `addJob('service:start')` etc.

---

### Phase 3: UI Implementation

#### 3.1 Create Jobs Admin Page

**File**: `core/src/app/(dashboard)/bernard/admin/jobs/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { JobTable } from '@/components/jobs/JobTable';
import { QueueStatsCard } from '@/components/jobs/QueueStatsCard';
import type { JobHistory, QueueStats, ListJobsOptions } from '@/lib/infra/worker-queue/types';

export default function JobsAdminPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobHistory[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ListJobsOptions>({
    limit: 50,
    offset: 0,
  });

  const loadJobs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/jobs?' + new URLSearchParams(filters as any).toString());
      const data = await res.json();
      setJobs(data.jobs);
      setStats(data.stats);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, [filters]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Jobs</h1>
        <p className="text-muted-foreground">
          Monitor and manage background jobs
        </p>
      </div>

      {stats && <QueueStatsCard stats={stats} />}

      {/* Filters */}
      <div className="flex gap-4">
        <select
          value={filters.status?.join(',')}
          onChange={(e) => setFilters({ ...filters, status: e.target.value ? e.target.value.split(',') : undefined })}
          className="border rounded px-3 py-2"
        >
          <option value="">All Statuses</option>
          <option value="queued,running">Active</option>
          <option value="finished">Completed</option>
          <option value="errored">Failed</option>
        </select>

        <select
          value={filters.type?.join(',')}
          onChange={(e) => setFilters({ ...filters, type: e.target.value ? e.target.value.split(',') : undefined })}
          className="border rounded px-3 py-2"
        >
          <option value="">All Types</option>
          <option value="thread-naming">Thread Naming</option>
          <option value="service:start,service:stop,service:restart">Service Actions</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No jobs found
        </div>
      ) : (
        <JobTable
          jobs={jobs}
          onViewDetails={(jobId) => router.push(`/bernard/admin/jobs/${jobId}`)}
          onRerun={async (jobId) => {
            await fetch(`/api/admin/jobs/${jobId}/rerun`, { method: 'POST' });
            loadJobs();
          }}
          onCancel={async (jobId) => {
            await fetch(`/api/admin/jobs/${jobId}/cancel`, { method: 'POST' });
            loadJobs();
          }}
          onDelete={async (jobId) => {
            await fetch(`/api/admin/jobs/${jobId}/delete`, { method: 'DELETE' });
            loadJobs();
          }}
        />
      )}
    </div>
  );
}
```

**File**: `core/src/components/jobs/JobTable.tsx`

```typescript
'use client';

import { CheckCircle2, Clock, Loader2, Settings2, XCircle, X, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import type { JobHistory } from '@/lib/infra/worker-queue/types';

interface JobTableProps {
  jobs: JobHistory[];
  onViewDetails: (jobId: string) => void;
  onRerun: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onDelete: (jobId: string) => void;
}

const statusConfig = {
  queued: { color: 'bg-yellow-500/20 text-yellow-500', icon: Clock, pulse: true },
  starting: { color: 'bg-blue-500/20 text-blue-500', icon: Loader2, spin: true },
  running: { color: 'bg-blue-500/20 text-blue-500', icon: Loader2, spin: true },
  'cleaning-up': { color: 'bg-purple-500/20 text-purple-500', icon: Settings2, spin: true },
  finished: { color: 'bg-green-500/20 text-green-500', icon: CheckCircle2, static: true },
  errored: { color: 'bg-red-500/20 text-red-500', icon: XCircle, static: true },
  cancelled: { color: 'bg-gray-500/20 text-gray-500', icon: X, static: true },
  delayed: { color: 'bg-orange-500/20 text-orange-500', icon: Clock, static: true },
};

export function JobTable({ jobs, onViewDetails, onRerun, onCancel, onDelete }: JobTableProps) {
  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium">Job ID</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Queued At</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Wait Time</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Run Time</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Attempts</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const config = statusConfig[job.status];
            return (
              <tr key={job.jobId} className="border-t hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 text-sm font-mono">
                  {job.jobId.slice(0, 8)}...
                </td>
                <td className="px-4 py-3 text-sm">
                  <Badge variant="outline">{job.type}</Badge>
                </td>
                <td className="px-4 py-3 text-sm">
                  <Badge className={config.color}>
                    <config.icon className={`h-3 w-3 mr-1 inline ${config.spin ? 'animate-spin' : ''}`} />
                    {job.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {new Date(job.queuedAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm">
                  {formatDuration(job.waitTimeMs)}
                </td>
                <td className="px-4 py-3 text-sm">
                  {formatDuration(job.runTimeMs)}
                </td>
                <td className="px-4 py-3 text-sm">
                  <Badge variant="secondary">{job.attempts}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onViewDetails(job.jobId)}>
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onRerun(job.jobId)}
                        disabled={job.status === 'queued'}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Rerun
                      </DropdownMenuItem>
                      {job.status === 'running' && (
                        <DropdownMenuItem
                          onClick={() => onCancel(job.jobId)}
                          className="text-destructive"
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Cancel
                        </DropdownMenuItem>
                      )}
                      {['finished', 'queued', 'errored', 'cancelled'].includes(job.status) && (
                        <DropdownMenuItem
                          onClick={() => onDelete(job.jobId)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

**File**: `core/src/components/jobs/QueueStatsCard.tsx`

```typescript
'use client';

import { Activity, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { QueueStats } from '@/lib/infra/worker-queue/types';

interface QueueStatsCardProps {
  stats: QueueStats;
}

export function QueueStatsCard({ stats }: QueueStatsCardProps) {
  const statItems = [
    { label: 'Queued', value: stats.queued, icon: Clock, color: 'text-yellow-500' },
    { label: 'Running', value: stats.running, icon: Activity, color: 'text-blue-500' },
    { label: 'Completed', value: stats.finished, icon: CheckCircle2, color: 'text-green-500' },
    { label: 'Errored', value: stats.errored, icon: XCircle, color: 'text-red-500' },
    { label: 'Delayed', value: stats.delayed, icon: AlertCircle, color: 'text-orange-500' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Queue Statistics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 gap-4">
          {statItems.map((item) => (
            <div key={item.label} className="text-center">
              <item.icon className={`h-6 w-6 mx-auto ${item.color}`} />
              <div className="text-2xl font-bold mt-2">{item.value}</div>
              <div className="text-sm text-muted-foreground">{item.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t text-center text-sm text-muted-foreground">
          Total Jobs: {stats.total}
        </div>
      </CardContent>
    </Card>
  );
}
```

#### 3.2 Create Individual Job Page

**File**: `core/src/app/(dashboard)/bernard/admin/jobs/[jobId]/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { JobHistory } from '@/lib/infra/worker-queue/types';

export default function JobDetailsPage({
  params,
}: {
  params: { jobId: string };
}) {
  const router = useRouter();
  const [job, setJob] = useState<JobHistory | null>(null);
  const [loading, setLoading] = useState(true);

  const loadJob = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/jobs/${params.jobId}`);
      const data = await res.json();
      setJob(data);
    } catch (error) {
      console.error('Failed to load job:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRerun = async () => {
    await fetch(`/api/admin/jobs/${params.jobId}/rerun`, { method: 'POST' });
    router.push('/bernard/admin/jobs');
  };

  const handleCancel = async () => {
    await fetch(`/api/admin/jobs/${params.jobId}/cancel`, { method: 'POST' });
    loadJob();
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this job?')) return;
    await fetch(`/api/admin/jobs/${params.jobId}/delete`, { method: 'DELETE' });
    router.push('/bernard/admin/jobs');
  };

  useEffect(() => {
    loadJob();
  }, [params.jobId]);

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (!job) {
    return <div className="text-center py-8">Job not found</div>;
  }

  const statusConfig = {
    queued: { color: 'bg-yellow-500/20 text-yellow-500', label: 'Queued' },
    starting: { color: 'bg-blue-500/20 text-blue-500', label: 'Starting' },
    running: { color: 'bg-blue-500/20 text-blue-500', label: 'Running' },
    'cleaning-up': { color: 'bg-purple-500/20 text-purple-500', label: 'Cleaning Up' },
    finished: { color: 'bg-green-500/20 text-green-500', label: 'Finished' },
    errored: { color: 'bg-red-500/20 text-red-500', label: 'Errored' },
    cancelled: { color: 'bg-gray-500/20 text-gray-500', label: 'Cancelled' },
    delayed: { color: 'bg-orange-500/20 text-orange-500', label: 'Delayed' },
  };

  const config = statusConfig[job.status];
  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">
          ← Back to Jobs
        </Button>
        <h1 className="text-2xl font-bold">Job Details</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Job Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Job ID</label>
              <div className="font-mono text-sm">{job.jobId}</div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Type</label>
              <Badge>{job.type}</Badge>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Status</label>
              <Badge className={config.color}>{config.label}</Badge>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Attempts</label>
              <Badge variant="secondary">{job.attempts}</Badge>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Queued At</label>
              <div className="text-sm">{new Date(job.queuedAt).toLocaleString()}</div>
            </div>
            {job.startedAt && (
              <div>
                <label className="text-sm text-muted-foreground">Started At</label>
                <div className="text-sm">{new Date(job.startedAt).toLocaleString()}</div>
              </div>
            )}
            {job.completedAt && (
              <div>
                <label className="text-sm text-muted-foreground">Completed At</label>
                <div className="text-sm">{new Date(job.completedAt).toLocaleString()}</div>
              </div>
            )}
            <div>
              <label className="text-sm text-muted-foreground">Wait Time</label>
              <div className="text-sm">{formatDuration(job.waitTimeMs)}</div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Run Time</label>
              <div className="text-sm">{formatDuration(job.runTimeMs)}</div>
            </div>
            {job.durationMs && (
              <div>
                <label className="text-sm text-muted-foreground">Total Duration</label>
                <div className="text-sm">{formatDuration(job.durationMs)}</div>
              </div>
            )}
          </div>
          {job.rerunOf && (
            <Alert className="mt-4">
              <AlertDescription>
                This is a rerun of job <span className="font-mono">{job.rerunOf}</span>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {job.error && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-destructive/10 p-4 rounded text-destructive overflow-x-auto">
              {job.error}
            </pre>
          </CardContent>
        </Card>
      )}

      {job.data && (
        <Card>
          <CardHeader>
            <CardTitle>Job Data</CardTitle>
            <CardDescription>
              Input data for the job. May contain PII.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription>
                ⚠️ This data may contain personally identifiable information. View responsibly.
              </AlertDescription>
            </Alert>
            <pre className="bg-muted p-4 rounded overflow-x-auto text-sm mt-4">
              {JSON.stringify(job.data, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {job.result && (
        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded overflow-x-auto text-sm">
              {JSON.stringify(job.result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button
            onClick={handleRerun}
            disabled={job.status === 'queued'}
          >
            Rerun Job
          </Button>
          {job.status === 'running' && (
            <Button variant="destructive" onClick={handleCancel}>
              Cancel Job
            </Button>
          )}
          {['finished', 'queued', 'errored', 'cancelled'].includes(job.status) && (
            <Button variant="destructive" onClick={handleDelete}>
              Delete Job
            </Button>
          )}
        </CardContent>
      </Card>

      {job.logs && job.logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Job Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {job.logs.map((log, index) => (
                <div key={index} className="text-sm font-mono border-b py-2">
                  <span className="text-muted-foreground mr-2">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <Badge variant={log.level === 'error' ? 'destructive' : 'outline'} className="mr-2">
                    {log.level}
                  </Badge>
                  <span className={log.level === 'error' ? 'text-destructive' : ''}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

#### 3.3 Update Admin Sidebar

**File**: `core/src/components/dynamic-sidebar/configs/AdminSidebarConfig.tsx`

```typescript
// Add Jobs route to admin section
{
  title: "Dashboard",
  items: [
    { label: "Status", icon: Activity, href: "/bernard/admin" },
    { label: "Services", icon: Server, href: "/bernard/admin/services" },
    { label: "Jobs", icon: Briefcase, href: "/bernard/admin/jobs" }, // NEW
    { label: "Models", icon: Cpu, href: "/bernard/admin/models" },
    { label: "Users", icon: Users, href: "/bernard/admin/users" },
  ],
}
```

#### 3.4 Create Jobs Components Index

**File**: `core/src/components/jobs/index.ts`

```typescript
export { JobTable } from './JobTable';
export { QueueStatsCard } from './QueueStatsCard';
```

---

## Implementation Details

### Job Rerun Logic

```typescript
export async function rerunJob(jobId: string): Promise<string | null> {
  const job = await getJob(jobId);

  if (!job || !job.data) return null;

  // Create new job with same data
  const newJob = await queue!.add(job.name, job.data, {
    // Preserve original options
    attempts: job.opts.attempts,
    backoff: job.opts.backoff,
    // Don't remove original job
    removeOnComplete: false,
  });

  // Record rerun relationship in history
  await jobHistoryService.recordRerun(jobId, newJob.id!);

  return newJob.id ?? null;
}
```

### Job Cancel Logic

```typescript
export async function cancelJob(jobId: string): Promise<boolean> {
  const job = await getJob(jobId);

  if (!job) return false;

  const state = await job.getState();

  // Only cancel active/waiting jobs
  if (state !== 'active' && state !== 'waiting') {
    return false;
  }

  // Attempt graceful cancellation
  await job.remove();
  await jobHistoryService.updateStatus(jobId, 'cancelled');

  return true;
}
```

### Job Delete Logic

```typescript
export async function deleteJob(jobId: string): Promise<boolean> {
  const job = await getJob(jobId);

  if (!job) return false;

  const state = await job.getState();

  // Only delete non-running jobs
  if (state === 'active' || state === 'starting') {
    return false;
  }

  await job.remove();
  await jobHistoryService.deleteJob(jobId);

  return true;
}
```

### SSE Real-Time Updates

```typescript
// Client-side SSE listener in jobs page
useEffect(() => {
  const eventSource = new EventSource('/api/admin/jobs/stream');

  eventSource.addEventListener('job:queued', (e: MessageEvent) => {
    const { jobId } = JSON.parse(e.data);
    // Update local state or reload
    loadJobs();
  });

  eventSource.addEventListener('job:started', (e: MessageEvent) => {
    loadJobs();
  });

  eventSource.addEventListener('job:finished', (e: MessageEvent) => {
    loadJobs();
  });

  eventSource.addEventListener('job:errored', (e: MessageEvent) => {
    loadJobs();
  });

  eventSource.addEventListener('job:cancelled', (e: MessageEvent) => {
    loadJobs();
  });

  eventSource.addEventListener('job:progress', (e: MessageEvent) => {
    const { jobId, progress } = JSON.parse(e.data);
    // Update progress in UI
  });

  return () => {
    eventSource.close();
  };
}, []);
```

---

## Environment Variables

Add these to `.env.example` and `.env`:

```env
# Worker Queue Configuration
WORKER_QUEUE_CONCURRENCY=10
WORKER_QUEUE_RETRIES=3
WORKER_QUEUE_BACKOFF_DELAY=2000

# Job Retention (BullMQ)
WORKER_QUEUE_RETENTION_COMPLETED_DAYS=7
WORKER_QUEUE_RETENTION_COMPLETED_COUNT=1000
WORKER_QUEUE_RETENTION_FAILED_DAYS=30
WORKER_QUEUE_RETENTION_FAILED_COUNT=5000

# Job History Retention (Redis)
WORKER_QUEUE_HISTORY_RETENTION_DAYS=90
```

---

## Migration Strategy

### Step-by-Step Plan

**Week 1: Core Infrastructure**
1. Create new `worker-queue/` module with types and config
2. Implement job history service in Redis
3. Set up BullMQ logging integration
4. Write unit tests for history service

**Week 2: Queue Migration**
1. Implement unified job processor with all job types
2. Migrate thread-naming processor to new queue
3. Migrate service action processor to new queue
4. Update dev server to use unified worker
5. Test all job types end-to-end

**Week 3: API Layer**
1. Create `/api/admin/jobs/` endpoints
2. Implement job actions (rerun, cancel, delete)
3. Add SSE stream endpoint
4. Write API tests
5. Update existing APIs to use new queue

**Week 4: UI Implementation**
1. Create jobs admin page with table
2. Create individual job details page
3. Implement job actions menu with conditional rendering
4. Update admin sidebar navigation
5. Add SSE for real-time updates
6. Style status badges with animations

**Week 5: Cleanup & Documentation**
1. Remove deprecated queue files
2. Update AGENTS.md and README
3. Update environment variable documentation
4. Add job management section to admin docs
5. Performance testing and optimization

---

## Testing Strategy

### Unit Tests

```typescript
// worker-queue/history.test.ts
describe('JobHistoryService', () => {
  test('recordJob', async () => { ... });
  test('appendLog', async () => { ... });
  test('listJobs with filters', async () => { ... });
  test('getJobHistory', async () => { ... });
});

// worker-queue/processor.test.ts
describe('JobProcessor', () => {
  test('processThreadNamingJob', async () => { ... });
  test('processServiceActionJob', async () => { ... });
  test('unknown job type throws error', async () => { ... });
});
```

### Integration Tests

```typescript
// api/admin/jobs/route.test.ts
describe('Jobs API', () => {
  test('GET /api/admin/jobs lists jobs', async () => { ... });
  test('GET /api/admin/jobs with filters', async () => { ... });
  test('POST /api/admin/jobs/[jobId]/rerun creates copy', async () => { ... });
  test('DELETE /api/admin/jobs/[jobId]/delete', async () => { ... });
  test('SSE stream sends job updates', async () => { ... });
});
```

### Manual Testing Checklist

- [ ] Thread-naming jobs complete successfully
- [ ] Service start/stop/restart jobs work
- [ ] Logs appear in console during `npm run dev`
- [ ] Jobs appear in admin UI table
- [ ] SSE updates work in real-time
- [ ] Individual job page loads correctly
- [ ] Rerun creates new job, keeps original
- [ ] Cancel stops running jobs only
- [ ] Delete removes completed/errored jobs only
- [ ] Status badges display correctly with animations
- [ ] Filters work (status, type)
- [ ] Pagination works
- [ ] PII warning shows on job data view
- [ ] All job logs are visible
- [ ] Job data and result are displayed

---

## Open Questions / Trade-offs

### 1. Database Choice

**Decision**: Redis-only (current architecture)

**Rationale**:
- ✅ No new dependencies
- ✅ Consistent with existing patterns
- ✅ Simpler migration
- ✅ Redis is already used for everything

**Trade-offs**:
- ❌ Limited query capabilities
- ❌ No advanced filtering
- ❌ Manual pagination

**Future Consideration**: If filtering/querying becomes a bottleneck, add PostgreSQL with Prisma for historical job data only.

### 2. Job Data Retention

**Configuration**:
- **Completed jobs**: 7 days in BullMQ (configurable)
- **Failed jobs**: 30 days in BullMQ (configurable)
- **Redis history**: 90 days (configurable)

**Rationale**:
- Keep BullMQ jobs shorter to reduce memory usage
- Keep Redis history longer for audit trail
- Balance between performance and traceability

### 3. PII in Job Data

**Policy**: Admin-only access with PII warning in UI

**Rationale**:
- Jobs may contain PII (thread content, service configuration)
- Admin section already requires elevated permissions
- Warning in UI makes users aware before viewing
- No redaction needed for audit purposes

---

## Success Criteria

✅ Single queue (`workerQueue`) handles all job types
✅ `job.log()` calls output to console during dev/start
✅ Job history queryable via API (`/api/admin/jobs/*`)
✅ All required fields exposed (jobId, type, logs, status, wait time, run time)
✅ Rerun creates copy, original unchanged
✅ Cancel works on running jobs only
✅ Delete works on completed, queued, errored, cancelled jobs
✅ Admin UI lists jobs in table with actions menu
✅ Individual job page shows full details and logs
✅ Real-time updates via SSE (no polling)
✅ No job creation UI in jobs pages
✅ All deprecated files removed
✅ No backward compatibility maintained
