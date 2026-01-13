/**
 * Test for BullMQ mock deduplication fix.
 */

import { describe, it, expect } from 'vitest'
import { createMockQueue } from './bullmq'

describe('BullMQ Mock Deduplication', () => {
  it('should deduplicate jobs with the same deduplication ID', async () => {
    const queue = createMockQueue()

    // Add first job with deduplication ID
    const job1 = await queue.add('test-job', { data: 'job1' }, { deduplication: { id: 'dedupe-1' } })

    // Add second job with same deduplication ID - should return the first job
    const job2 = await queue.add('test-job', { data: 'job2' }, { deduplication: { id: 'dedupe-1' } })

    // Should return the same job object
    expect(job1).toBe(job2)
    expect(job1.id).toBe(job2.id)

    // Get job counts - should only count one job
    const counts = await queue.getJobCounts()
    expect(counts.waiting).toBe(1)

    // Get all waiting jobs - should return only one job
    const jobs = await queue.getJobs('waiting')
    expect(jobs).toHaveLength(1)
    expect(jobs[0].id).toBe(job1.id)
  })

  it('should resolve deduplication ID to canonical job', async () => {
    const queue = createMockQueue()

    // Add a job with deduplication
    const job = await queue.add('test-job', { data: 'test' }, { deduplication: { id: 'dedupe-1' } })

    // Should be able to get job by its own ID
    const retrievedByJobId = await queue.getJob(job.id)
    expect(retrievedByJobId).toBe(job)

    // Should also be able to get job by deduplication ID
    const retrievedByDedupeId = await queue.getJob('dedupe-1')
    expect(retrievedByDedupeId).toBe(job)
  })

  it('should handle getDuplicateJobId correctly', async () => {
    const queue = createMockQueue()

    // Add a job with deduplication
    const job = await queue.add('test-job', { data: 'test' }, { deduplication: { id: 'dedupe-1' } })

    // Check if deduplication ID maps to the job (BullMQ getDuplicateJobId takes deduplicationId and returns jobId)
    const duplicateId = await queue.getDuplicateJobId('dedupe-1', job.id)
    expect(duplicateId).toBe(job.id)

    // Check non-existent deduplication ID
    const noDuplicateId = await queue.getDuplicateJobId('non-existent', job.id)
    expect(noDuplicateId).toBe(null)
  })

  it('should clear deduplication index on close', async () => {
    const queue = createMockQueue()

    // Add a job with deduplication
    await queue.add('test-job', { data: 'test' }, { deduplication: { id: 'dedupe-1' } })

    // Close the queue
    await queue.close()

    // Should not be able to retrieve by deduplication ID anymore
    const job = await queue.getJob('dedupe-1')
    expect(job).toBe(null)
  })
})