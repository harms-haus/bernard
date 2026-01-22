/**
 * Type definitions for the unified worker queue system.
 *
 * Consolidates utility and service queue jobs into a single unified queue.
 */

// ============================================================================
// Unified Job Types
// ============================================================================

/**
 * All supported job types in the worker queue.
 * Combines both utility and service action jobs.
 */
export type WorkerJobType =
  // Utility jobs
  | "thread-naming"
  | "metadata-update"
  | "embedding-cache"
  // Service action jobs
  | "service:start"
  | "service:stop"
  | "service:restart"
  | "service:check"
  // Future extensibility
  | "custom";

/**
 * All possible job statuses.
 * Extended from BullMQ's built-in states.
 */
export type WorkerJobStatus =
  | "queued"        // Initial state (waiting in queue)
  | "starting"      // Worker picked up job, processing starting
  | "running"       // Active processing
  | "cleaning-up"   // Post-processing/cleanup
  | "finished"      // Success
  | "errored"       // Failed after retries
  | "cancelled"     // User/admin cancelled
  | "delayed";      // Scheduled for future

// ============================================================================
// Job Data Types
// ============================================================================

/**
 * Base metadata for jobs.
 */
export interface JobMetadata {
  userId?: string;
  initiatedBy?: string;
  requestId?: string;
  threadId?: string;
}

/**
 * Wrapper for all job data types.
 */
export interface WorkerJobData {
  type: WorkerJobType;
  data: unknown;
  metadata?: JobMetadata;
}

/**
 * Job data for thread naming operations.
 */
export interface ThreadNamingJobData {
  threadId: string;
  messages: Array<{ type: string; content: unknown }>;
}

/**
 * Job data for metadata update operations (future use).
 */
export interface MetadataUpdateJobData {
  threadId: string;
  field: "title" | "tags" | "metadata";
  value: Record<string, unknown>;
}

/**
 * Job data for embedding cache operations (future use).
 */
export interface EmbeddingCacheJobData {
  threadId: string;
  content: string;
  embeddingKey: string;
}

/**
 * Job data for service action operations.
 */
export interface ServiceActionJobData {
  serviceId: string;
  action: "start" | "stop" | "restart" | "check";
  initiatedBy?: string;
  requestId?: string;
}

// ============================================================================
// Log Types
// ============================================================================

/**
 * A single log entry from job processing.
 */
export interface JobLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

// ============================================================================
// Job History Types
// ============================================================================

/**
 * Complete job history record.
 * Used for querying and displaying job information.
 */
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
  data?: unknown;
  result?: unknown;
  error?: string;
  attempts: number;
  rerunOf?: string;
}

/**
 * Options for listing jobs from history.
 */
export interface ListJobsOptions {
  status?: WorkerJobStatus[];
  type?: WorkerJobType[];
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Queue Statistics
// ============================================================================

/**
 * Queue statistics by status.
 */
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
