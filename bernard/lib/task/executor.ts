import type { Job } from "bullmq";
import { getRedis } from "../infra/redis";
import { getSettings } from "../config/settingsCache";
import type { TaskPayload, TaskExecutionContext, TaskResult, TaskFunction } from "./types";
import { TaskRecordKeeper } from "./recordKeeper";
import { childLogger, logger } from "../logging";

// Register task functions
import { playMediaTvTask } from "./functions/play_media_tv";
registerTaskFunction("play_media_tv", playMediaTvTask);

const log = childLogger({ component: "task_executor" }, logger);

/**
 * Registry of task functions by tool name
 */
const taskFunctions = new Map<string, TaskFunction>();

/**
 * Register a task function
 */
export function registerTaskFunction(toolName: string, fn: TaskFunction): void {
  taskFunctions.set(toolName, fn);
  log.info({
    event: "task_function.registered",
    toolName
  });
}

/**
 * Get a task function by tool name
 */
export function getTaskFunction(toolName: string): TaskFunction | null {
  return taskFunctions.get(toolName) ?? null;
}

/**
 * Build the task executor function that processes jobs from the queue
 */
export function buildTaskExecutor() {
  const redis = getRedis();
  const recordKeeper = new TaskRecordKeeper(redis);

  return async function executor(job: Job<TaskPayload, unknown, string>): Promise<TaskResult> {
    const { taskId, toolName, arguments: args, settings: payloadSettings, userId, conversationId } = job.data;

    log.info({
      event: "task.execution.started",
      taskId,
      toolName,
      userId,
      jobId: job.id
    });

    // Record task started event
    await recordKeeper.recordEvent(taskId, {
      type: "task_started",
      timestamp: new Date().toISOString(),
      data: { userId, toolName }
    });

    try {
      // Load full settings from Redis/DB
      const fullSettings = await getSettings();

      // Merge settings: payload takes precedence over loaded settings
      const mergedSettings = {
        ...fullSettings,
        services: {
          ...fullSettings.services,
          ...payloadSettings.services // Payload services override loaded ones
        }
      };

      // Get the task function
      const taskFunction = getTaskFunction(toolName);
      if (!taskFunction) {
        const errorMessage = `Task function not found for tool: ${toolName}`;
        log.error({
          event: "task.execution.error",
          taskId,
          toolName,
          error: errorMessage
        });

        await recordKeeper.recordEvent(taskId, {
          type: "error",
          timestamp: new Date().toISOString(),
          data: { error: errorMessage, userId }
        });

        return { success: false, errorMessage };
      }

      // Create execution context
      const context: TaskExecutionContext = {
        taskId,
        userId,
        recordEvent: (event) => recordKeeper.recordEvent(taskId, event),
        settings: mergedSettings
      };

      // Execute the task function
      const result = await taskFunction(args, context);

      // Record completion event
      await recordKeeper.recordEvent(taskId, {
        type: "task_completed",
        timestamp: new Date().toISOString(),
        data: {
          success: result.success,
          errorMessage: result.errorMessage,
          userId,
          metadata: result.metadata
        }
      });

      log.info({
        event: "task.execution.completed",
        taskId,
        toolName,
        success: result.success,
        jobId: job.id
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      log.error({
        event: "task.execution.exception",
        taskId,
        toolName,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        jobId: job.id
      });

      // Record error event
      await recordKeeper.recordEvent(taskId, {
        type: "error",
        timestamp: new Date().toISOString(),
        data: { error: errorMessage, userId }
      });

      return { success: false, errorMessage };
    }
  };
}

/**
 * Create a job processor that validates payload and executes tasks
 */
export function createTaskProcessor() {
  const executor = buildTaskExecutor();

  return async function processor(job: Job<TaskPayload, unknown, string>): Promise<TaskResult> {
    const { taskId, toolName, userId } = job.data;

    // Basic payload validation
    if (!taskId || !toolName || !userId) {
      const errorMessage = "Invalid task payload: missing required fields";
      log.error({
        event: "task.processor.validation_error",
        jobId: job.id,
        taskId,
        toolName,
        userId,
        error: errorMessage
      });
      throw new Error(errorMessage);
    }

    // Check if task exists in record keeper
    const recordKeeper = new TaskRecordKeeper(getRedis());
    const task = await recordKeeper.getTask(taskId);
    if (!task) {
      const errorMessage = `Task not found: ${taskId}`;
      log.error({
        event: "task.processor.task_not_found",
        jobId: job.id,
        taskId,
        error: errorMessage
      });
      throw new Error(errorMessage);
    }

    return executor(job);
  };
}
