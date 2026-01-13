/**
 * BullMQ mock factory for Vitest tests.
 *
 * Provides comprehensive BullMQ Queue, Worker, and QueueEvents mocks
 * with job tracking and event handling.
 */

import { vi } from 'vitest'

/**
 * Mock job interface (subset of BullMQ Job).
 */
export interface MockJob {
  id: string
  name: string
  data: any
  opts?: any
  state?: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
}

/**
 * Mock Queue interface (subset of BullMQ Queue).
 */
export interface MockQueue {
  /** Add job to queue */
  add(name: string, data: any, opts?: any): Promise<MockJob>
  /** Get job by ID */
  getJob(id: string): Promise<MockJob | null>
  /** Get jobs by state */
  getJobs(state: string, start?: number, end?: number): Promise<MockJob[]>
  /** Get job counts */
  getJobCounts(): Promise<{ waiting: number; active: number; completed: number; failed: number; delayed: number }>
  /** Close queue */
  close(): Promise<void>
  /** Duplicate check */
  getDuplicateJobId(id: string, jobId: string): Promise<string | null>
}

/**
 * Mock Worker interface (subset of BullMQ Worker).
 */
export interface MockWorker {
  /** Start worker */
  run(): Promise<void>
  /** Stop worker */
  close(): Promise<void>
  /** Worker is running */
  isRunning(): boolean
}

/**
 * Mock QueueEvents interface (subset of BullMQ QueueEvents).
 */
export interface MockQueueEvents {
  /** Subscribe to event */
  on(event: string, handler: (...args: any[]) => void): void
  /** Close events */
  close(): Promise<void>
  /** Internal handlers map (for testing) */
  _handlers: Map<string, Function[]>
}

/**
 * Create a mock BullMQ Queue.
 *
 * @returns MockQueue with job tracking
 */
export function createMockQueue(): MockQueue {
  const jobs: Map<string, MockJob> = new Map()
  const deduplicationIndex: Map<string, string> = new Map() // deduplicationId -> jobId
  let jobIdCounter = 0

  const add = vi.fn().mockImplementation(async (name: string, data: any, opts?: any) => {
    // Deduplication check - if job with this deduplication ID exists, return it
    if (opts?.deduplication?.id) {
      const existingJobId = deduplicationIndex.get(opts.deduplication.id)
      if (existingJobId) {
        const existingJob = jobs.get(existingJobId)
        if (existingJob) {
          return existingJob
        }
      }
    }

    jobIdCounter++
    const jobId = `job-${jobIdCounter}`

    const job: MockJob = {
      id: jobId,
      name,
      data,
      opts,
      state: 'waiting',
    }

    jobs.set(jobId, job)

    // Store deduplication mapping
    if (opts?.deduplication?.id) {
      deduplicationIndex.set(opts.deduplication.id, jobId)
    }

    return job
  })

  const getJob = vi.fn().mockImplementation(async (id: string) => {
    // First try direct lookup
    const job = jobs.get(id)
    if (job) return job

    // If not found, check if it's a deduplication ID and resolve to canonical jobId
    const canonicalJobId = deduplicationIndex.get(id)
    if (canonicalJobId) {
      return jobs.get(canonicalJobId) || null
    }

    return null
  })

  const getJobs = vi.fn().mockImplementation(async (state: string, start = 0, end = -1) => {
    const all = Array.from(jobs.values()).filter(j => j.state === state)
    return all.slice(start, end === -1 ? undefined : end + 1)
  })

  const getJobCounts = vi.fn().mockImplementation(async () => {
    const all = Array.from(jobs.values())
    return {
      waiting: all.filter(j => j.state === 'waiting').length,
      active: all.filter(j => j.state === 'active').length,
      completed: all.filter(j => j.state === 'completed').length,
      failed: all.filter(j => j.state === 'failed').length,
      delayed: all.filter(j => j.state === 'delayed').length,
    }
  })

  const close = vi.fn().mockImplementation(async () => {
    jobs.clear()
    deduplicationIndex.clear()
  })

  const getDuplicateJobId = vi.fn().mockImplementation(async (id: string, jobId: string) => {
    // Check if the deduplication ID maps to the given jobId
    const canonicalJobId = deduplicationIndex.get(id)
    if (canonicalJobId === jobId) {
      return jobId
    }
    return null
  })

  return {
    add,
    getJob,
    getJobs,
    getJobCounts,
    close,
    getDuplicateJobId,
  }
}

/**
 * Create a mock BullMQ Worker.
 *
 * @param processor - Job processor function
 * @returns MockWorker with lifecycle control
 */
export function createMockWorker(processor: (job: MockJob) => Promise<any>): MockWorker {
  let running = false
  let queue: MockQueue | null = null

  const run = vi.fn().mockImplementation(async () => {
    if (running) return
    running = true

    // Simulate processing (in real implementation, this would poll the queue)
    // For tests, we just mark that it's running
  })

  const close = vi.fn().mockImplementation(async () => {
    running = false
    queue = null
  })

  const isRunning = vi.fn().mockImplementation(() => {
    return running
  })

  return {
    run,
    close,
    isRunning,
  }
}

/**
 * Create mock QueueEvents.
 *
 * @returns MockQueueEvents with event tracking
 */
export function createMockQueueEvents(): MockQueueEvents {
  const handlers: Map<string, Function[]> = new Map()

  const on = vi.fn().mockImplementation((event: string, handler: (...args: any[]) => void) => {
    if (!handlers.has(event)) {
      handlers.set(event, [])
    }
    handlers.get(event)!.push(handler)
  })

  const close = vi.fn().mockImplementation(async () => {
    handlers.clear()
  })

  return {
    on,
    close,
    _handlers: handlers,
  }
}

/**
 * Reset all mock functions on a Queue.
 */
export function resetMockQueue(queue: MockQueue): void {
  queue.add.mockClear()
  queue.getJob.mockClear()
  queue.getJobs.mockClear()
  queue.getJobCounts.mockClear()
  queue.close.mockClear()
  queue.getDuplicateJobId.mockClear()
}

/**
 * Reset all mock functions on a Worker.
 */
export function resetMockWorker(worker: MockWorker): void {
  worker.run.mockClear()
  worker.close.mockClear()
  worker.isRunning.mockClear()
}

/**
 * Reset all mock functions on QueueEvents.
 */
export function resetMockQueueEvents(events: MockQueueEvents): void {
  events.on.mockClear()
  events.close.mockClear()
}

/**
 * Trigger an event on MockQueueEvents (helper for tests).
 */
export function triggerQueueEvent(events: MockQueueEvents, event: string, ...args: any[]): void {
  const handlers = events._handlers.get(event) || []
  for (const handler of handlers) {
    handler(...args)
  }
}
