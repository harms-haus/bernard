import type { BernardSettings } from "../config/settingsStore";

/**
 * Task status enumeration
 */
export type TaskStatus = "queued" | "running" | "completed" | "errored" | "uncompleted" | "cancelled";

/**
 * Task metadata stored in Redis
 */
export type Task = {
  id: string;
  name: string;
  status: TaskStatus;
  toolName: string;
  userId: string;
  conversationId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  runtimeMs?: number;
  errorMessage?: string;
  messageCount: number;
  toolCallCount: number;
  tokensIn: number;
  tokensOut: number;
  archived: boolean;
  archivedAt?: string;
  sections?: Record<string, string>; // Section metadata for recall_task tool
};

/**
 * Task payload sent to the background queue
 */
export type TaskPayload = {
  taskId: string;
  toolName: string;
  arguments: Record<string, unknown>; // JSON-serializable tool arguments
  settings: Partial<BernardSettings>; // Service configs needed by the tool
  userId: string;
  conversationId?: string;
  maxTokens?: number;
  sections?: Record<string, string>; // Section metadata for recall_task tool
};

/**
 * Task execution context passed to task functions
 */
export type TaskExecutionContext = {
  taskId: string;
  userId: string;
  recordEvent: (event: TaskEvent) => Promise<void>;
  settings: BernardSettings; // Merged settings (payload + loaded from Redis)
};

/**
 * Task event types for recording execution progress
 */
export type TaskEventType =
  | "task_started"
  | "llm_call_start"
  | "llm_call_complete"
  | "tool_call_start"
  | "tool_call_complete"
  | "message_recorded"
  | "error"
  | "task_completed";

/**
 * Task event for recording execution progress
 */
export type TaskEvent = {
  type: TaskEventType;
  timestamp: string;
  data: Record<string, unknown>;
};

/**
 * Task result returned by task execution
 */
export type TaskResult = {
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Task function signature
 */
export type TaskFunction = (
  args: Record<string, unknown>,
  context: TaskExecutionContext
) => Promise<TaskResult>;

/**
 * Task section for recall_task tool
 */
export type TaskSection = {
  name: string;
  description?: string;
  content: string;
};

/**
 * Task recall result
 */
export type TaskRecallResult = {
  task: Task;
  sections?: Record<string, TaskSection>;
  messages?: Array<{
    id: string;
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    createdAt: string;
    name?: string;
    tool_call_id?: string;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: {
        name: string;
        arguments: string;
      };
    }>;
  }>;
};

/**
 * Task list query options
 */
export type TaskListQuery = {
  userId: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
};

/**
 * Task list response
 */
export type TaskListResponse = {
  tasks: Task[];
  total: number;
  hasMore: boolean;
};
