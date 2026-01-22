/**
 * Job History Service for the unified worker queue.
 *
 * Stores job metadata, logs, and results in Redis for querying and auditing.
 */
import Redis from 'ioredis';
import type { JobHistory, JobLog, WorkerJobStatus, ListJobsOptions, WorkerJobData } from './types';
import { getBullMqRedis } from '../queue';
import { WORKER_QUEUE_CONFIG } from './config';

class JobHistoryService {
  private redis: Redis;
  private prefix = "bernard:job-history";

  constructor() {
    this.redis = getBullMqRedis();
  }

  /**
   * Record job metadata when a job is created.
   */
  async recordJob(jobId: string, type: string, data: WorkerJobData): Promise<void> {
    const queuedAt = new Date().toISOString();
    const queuedAtTimestamp = new Date(queuedAt).getTime();
    const jobKey = `${this.prefix}:${jobId}`;
    
    // Store job metadata in hash
    await this.redis.hset(jobKey, {
      jobId,
      type,
      queueName: "workerQueue",
      jobData: JSON.stringify(data),
      status: "queued",
      queuedAt,
      attempts: 0,
    });

    // Add to sorted set for efficient pagination (score = queuedAt timestamp)
    await this.redis.zadd(`${this.prefix}:byQueuedAt`, queuedAtTimestamp, jobId);

    // Add to status index
    await this.redis.sadd(`${this.prefix}:status:queued`, jobId);

    // Add to type index
    await this.redis.sadd(`${this.prefix}:type:${type}`, jobId);
  }

  /**
   * Update job status.
   */
  async updateStatus(jobId: string, status: WorkerJobStatus): Promise<void> {
    const timestamp = new Date().toISOString();
    const updates: Record<string, string> = { status };
    const jobKey = `${this.prefix}:${jobId}`;

    // Get current status to update indices
    const existing = await this.redis.hgetall(jobKey);
    const oldStatus = existing.status as WorkerJobStatus | undefined;

    if (status === "starting") {
      updates.startedAt = timestamp;
    } else if (status === "finished" || status === "errored" || status === "cancelled") {
      updates.completedAt = timestamp;

      // Calculate duration and times if we have startedAt
      if (existing.startedAt) {
        const startedAt = new Date(existing.startedAt).getTime();
        const completedAt = new Date(timestamp).getTime();

        if (existing.queuedAt) {
          const queuedAt = new Date(existing.queuedAt).getTime();
          updates.waitTimeMs = String(startedAt - queuedAt);
        }

        updates.runTimeMs = String(completedAt - startedAt);
        updates.durationMs = String(completedAt - (existing.queuedAt ? new Date(existing.queuedAt).getTime() : startedAt));
      }
    }

    await this.redis.hset(jobKey, updates);

    // Update status index
    if (oldStatus && oldStatus !== status) {
      await this.redis.srem(`${this.prefix}:status:${oldStatus}`, jobId);
    }
    await this.redis.sadd(`${this.prefix}:status:${status}`, jobId);
  }

  /**
   * Append a log entry to the job's log history.
   * Uses Redis LIST for atomic append operations.
   */
  async appendLog(jobId: string, log: string, level: 'info' | 'warn' | 'error' = 'info'): Promise<void> {
    const logEntry: JobLog = {
      timestamp: new Date().toISOString(),
      level,
      message: log,
    };
    const logKey = `${this.prefix}:${jobId}:logs`;
    
    // Atomically append to list
    await this.redis.rpush(logKey, JSON.stringify(logEntry));
  }

  /**
   * Set the result for a completed job.
   */
  async setResult(jobId: string, result: unknown): Promise<void> {
    await this.redis.hset(`${this.prefix}:${jobId}`, 'result', JSON.stringify(result));
  }

  /**
   * Set the error for a failed job.
   */
  async setError(jobId: string, error: string): Promise<void> {
    await this.redis.hset(`${this.prefix}:${jobId}`, 'error', error);
  }

  /**
   * Increment the attempt count for a job.
   */
  async incrementAttempts(jobId: string): Promise<number> {
    return await this.redis.hincrby(`${this.prefix}:${jobId}`, 'attempts', 1);
  }

  /**
   * Get all logs for a job.
   * Reads from Redis LIST.
   */
  async getLogs(jobId: string): Promise<JobLog[]> {
    const logKey = `${this.prefix}:${jobId}:logs`;
    const logEntries = await this.redis.lrange(logKey, 0, -1);
    return logEntries.map(entry => JSON.parse(entry) as JobLog);
  }

  /**
   * Get complete job history.
   */
  async getJobHistory(jobId: string): Promise<JobHistory | null> {
    const job = await this.redis.hgetall(`${this.prefix}:${jobId}`);
    if (!job || Object.keys(job).length === 0) return null;

    // Get logs from LIST
    const logs = await this.getLogs(jobId);

    return {
      jobId: job.jobId || '',
      type: job.type as any,
      status: job.status as WorkerJobStatus,
      queuedAt: job.queuedAt || '',
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      durationMs: job.durationMs ? parseInt(job.durationMs) : undefined,
      waitTimeMs: job.waitTimeMs ? parseInt(job.waitTimeMs) : undefined,
      runTimeMs: job.runTimeMs ? parseInt(job.runTimeMs) : undefined,
      logs,
      data: job.jobData ? JSON.parse(job.jobData) : undefined,
      result: job.result ? JSON.parse(job.result) : undefined,
      error: job.error,
      attempts: job.attempts ? parseInt(job.attempts) : 0,
      rerunOf: job.rerunOf,
    } as JobHistory;
  }

  /**
   * List jobs with pagination and filters.
   * Uses Redis sorted sets for efficient pagination and filtering.
   */
  async listJobs(options: ListJobsOptions = {}): Promise<JobHistory[]> {
    const {
      status,
      type,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = options;

    const sortedSetKey = `${this.prefix}:byQueuedAt`;
    let candidateJobIds: string[] = [];

    // Build candidate set based on date range
    if (startDate || endDate) {
      const startScore = startDate ? startDate.getTime() : '-inf';
      const endScore = endDate ? endDate.getTime() : '+inf';
      candidateJobIds = await this.redis.zrangebyscore(
        sortedSetKey,
        startScore,
        endScore
      );
    } else {
      // Get all jobs in reverse order (newest first) with pagination
      const end = offset + limit - 1;
      candidateJobIds = await this.redis.zrevrange(sortedSetKey, offset, end);
    }

    // Apply status filter using set intersection
    if (status && status.length > 0) {
      const statusSets = status.map(s => `${this.prefix}:status:${s}`);
      if (candidateJobIds.length > 0) {
        // Create temporary set with candidates
        const tempKey = `${this.prefix}:temp:${Date.now()}`;
        if (candidateJobIds.length > 0) {
          await this.redis.sadd(tempKey, ...candidateJobIds);
        }
        
        // Intersect with status sets
        const intersectKey = `${this.prefix}:temp:intersect:${Date.now()}`;
        await this.redis.sinterstore(intersectKey, tempKey, ...statusSets);
        candidateJobIds = await this.redis.smembers(intersectKey);
        
        // Cleanup temp keys
        await this.redis.del(tempKey, intersectKey);
      } else {
        // No date range, intersect all status sets
        if (statusSets.length === 1) {
          candidateJobIds = await this.redis.smembers(statusSets[0]);
        } else {
          const intersectKey = `${this.prefix}:temp:intersect:${Date.now()}`;
          await this.redis.sinterstore(intersectKey, ...statusSets);
          candidateJobIds = await this.redis.smembers(intersectKey);
          await this.redis.del(intersectKey);
        }
      }
    }

    // Apply type filter using set intersection
    if (type && type.length > 0) {
      const typeSets = type.map(t => `${this.prefix}:type:${t}`);
      if (candidateJobIds.length > 0) {
        const tempKey = `${this.prefix}:temp:${Date.now()}`;
        await this.redis.sadd(tempKey, ...candidateJobIds);
        
        const intersectKey = `${this.prefix}:temp:intersect:${Date.now()}`;
        await this.redis.sinterstore(intersectKey, tempKey, ...typeSets);
        candidateJobIds = await this.redis.smembers(intersectKey);
        
        await this.redis.del(tempKey, intersectKey);
      } else {
        if (typeSets.length === 1) {
          candidateJobIds = await this.redis.smembers(typeSets[0]);
        } else {
          const intersectKey = `${this.prefix}:temp:intersect:${Date.now()}`;
          await this.redis.sinterstore(intersectKey, ...typeSets);
          candidateJobIds = await this.redis.smembers(intersectKey);
          await this.redis.del(intersectKey);
        }
      }
    }

    // If no filters, get from sorted set with pagination
    if (!status && !type && !startDate && !endDate) {
      const end = offset + limit - 1;
      candidateJobIds = await this.redis.zrevrange(sortedSetKey, offset, end);
    } else {
      // Sort candidate IDs by queuedAt (from sorted set scores) and apply pagination
      if (candidateJobIds.length > 0) {
        const scores = await Promise.all(
          candidateJobIds.map(id => this.redis.zscore(sortedSetKey, id))
        );
        const jobsWithScores = candidateJobIds
          .map((id, i) => ({ id, score: scores[i] ?? 0 }))
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          .slice(offset, offset + limit)
          .map(j => j.id);
        candidateJobIds = jobsWithScores;
      }
    }

    if (candidateJobIds.length === 0) {
      return [];
    }

    // Fetch job data in pipeline
    const pipeline = this.redis.pipeline();
    for (const jobId of candidateJobIds) {
      pipeline.hgetall(`${this.prefix}:${jobId}`);
    }
    const results = await pipeline.exec();

    const jobs: JobHistory[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (!result || !result[1] || Object.keys(result[1]).length === 0) continue;

      const job = result[1] as Record<string, string>;
      const jobId = candidateJobIds[i];
      
      // Get logs from LIST
      const logs = await this.getLogs(jobId);

      const parsedJob: JobHistory = {
        jobId: job.jobId || jobId,
        type: job.type as any,
        status: job.status as WorkerJobStatus,
        queuedAt: job.queuedAt || '',
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        durationMs: job.durationMs ? parseInt(job.durationMs) : undefined,
        waitTimeMs: job.waitTimeMs ? parseInt(job.waitTimeMs) : undefined,
        runTimeMs: job.runTimeMs ? parseInt(job.runTimeMs) : undefined,
        logs,
        data: job.jobData ? JSON.parse(job.jobData) : undefined,
        result: job.result ? JSON.parse(job.result) : undefined,
        error: job.error,
        attempts: job.attempts ? parseInt(job.attempts) : 0,
        rerunOf: job.rerunOf,
      } as JobHistory;

      jobs.push(parsedJob);
    }

    return jobs;
  }

  /**
   * Delete job from history.
   * Removes job hash, logs list, and all indices.
   */
  async deleteJob(jobId: string): Promise<void> {
    const jobKey = `${this.prefix}:${jobId}`;
    const logKey = `${this.prefix}:${jobId}:logs`;
    
    // Get job metadata to clean up indices
    const job = await this.redis.hgetall(jobKey);
    const status = job.status as WorkerJobStatus | undefined;
    const type = job.type as string | undefined;

    // Delete job hash and logs list
    await this.redis.del(jobKey, logKey);

    // Remove from sorted set
    await this.redis.zrem(`${this.prefix}:byQueuedAt`, jobId);

    // Remove from status index
    if (status) {
      await this.redis.srem(`${this.prefix}:status:${status}`, jobId);
    }

    // Remove from type index
    if (type) {
      await this.redis.srem(`${this.prefix}:type:${type}`, jobId);
    }
  }

  /**
   * Record rerun relationship between jobs.
   */
  async recordRerun(originalJobId: string, newJobId: string): Promise<void> {
    await this.redis.hset(`${this.prefix}:${newJobId}`, 'rerunOf', originalJobId);
  }

  /**
   * Clean up old job history entries based on retention policy.
   */
  async cleanupOldEntries(): Promise<number> {
    const retentionDays = WORKER_QUEUE_CONFIG.historyRetentionDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let deletedCount = 0;
    let cursor = '0';
    const pattern = `${this.prefix}:*`;

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      cursor = nextCursor;

      if (keys.length === 0) continue;

      // Check each job's queuedAt date
      for (const key of keys) {
        const queuedAt = await this.redis.hget(key, 'queuedAt');
        if (queuedAt && new Date(queuedAt) < cutoffDate) {
          await this.redis.del(key);
          deletedCount++;
        }
      }
    } while (cursor !== '0');

    return deletedCount;
  }
}

export const jobHistoryService = new JobHistoryService();
