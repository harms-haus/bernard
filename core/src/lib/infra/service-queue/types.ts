/**
 * Type definitions for service action queue operations.
 */

/**
 * Available service actions that can be queued.
 */
export type ServiceAction = "start" | "stop" | "restart" | "check";

/**
 * Job data for service action operations.
 */
export interface ServiceActionJobData {
  serviceId: string;
  action: ServiceAction;
  initiatedBy?: string; // Optional: user or system
  requestId?: string; // For tracking/troubleshooting
}

/**
 * Result data for successful service actions.
 */
export interface ServiceActionResultData {
  pid?: number; // For start actions
  uptime?: number; // For status queries
  health?: string; // Health check result
}

/**
 * Result type for service action jobs.
 */
export interface ServiceActionResult {
  success: boolean;
  serviceId: string;
  action: ServiceAction;
  timestamp: Date;
  data?: ServiceActionResultData;
  error?: string;
  errorDetails?: {
    code?: string;
    message: string;
  };
}

/**
 * Job status values from BullMQ.
 */
export type ServiceJobStatus = "waiting" | "active" | "completed" | "failed";

/**
 * Information about a service job in the queue.
 */
export interface ServiceJobInfo {
  jobId: string;
  serviceId: string;
  action: ServiceAction;
  status: ServiceJobStatus;
  queuedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: ServiceActionResult;
  error?: string;
  attemptsMade: number;
  attemptsMax: number;
}

/**
 * Queue statistics.
 */
export interface ServiceQueueStats {
  waiting: number;
  active: number;
  completed: number;
  delayed: number;
  failed: number;
}
