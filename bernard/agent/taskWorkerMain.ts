import { childLogger, logger, startTimer, toErrorObject } from "@/lib/logging";
import { getSettings } from "@/lib/config/settingsCache";
import { createTaskQueueEvents, createTaskWorker, setTaskWorkerConfig, taskQueueName } from "../lib/task/queue";
import { createTaskProcessor } from "../lib/task/executor";

const baseLog = childLogger({ component: "task_worker" }, logger);

function wireEvents(worker: ReturnType<typeof createTaskWorker>) {
  const events = createTaskQueueEvents();
  const eventLog = childLogger({ component: "task_events" }, baseLog);

  worker.on("active", async (job) => {
    const taskId = (job.data as { taskId?: string } | undefined)?.taskId;
    const toolName = (job.data as { toolName?: string } | undefined)?.toolName;
    eventLog.info({
      event: "task.job.start",
      jobId: job.id,
      taskId,
      toolName,
      attempts: job.attemptsMade
    });
  });

  worker.on("completed", async (job, result) => {
    const taskId = (job.data as { taskId?: string } | undefined)?.taskId;
    const toolName = (job.data as { toolName?: string } | undefined)?.toolName;
    eventLog.info({
      event: "task.job.completed",
      jobId: job.id,
      taskId,
      toolName,
      attempts: job.attemptsMade,
      success: (result as { success?: boolean } | undefined)?.success
    });
  });

  worker.on("failed", async (job, err) => {
    const taskId = (job?.data as { taskId?: string } | undefined)?.taskId;
    const toolName = (job?.data as { toolName?: string } | undefined)?.toolName;
    eventLog.error({
      event: "task.job.failed",
      jobId: job?.id,
      taskId,
      toolName,
      attempts: job?.attemptsMade,
      err: toErrorObject(err)
    });
  });

  worker.on("error", (err) => {
    eventLog.error({ event: "task.worker.error", err: toErrorObject(err) });
  });

  events.on("completed", ({ jobId, returnvalue }) => {
    eventLog.info({ event: "task.events.completed", jobId, returnvalue });
  });
  events.on("failed", ({ jobId, failedReason }) => {
    eventLog.error({ event: "task.events.failed", jobId, failedReason });
  });
  events.on("error", (err) => {
    eventLog.error({ event: "task.events.error", err: toErrorObject(err) });
  });
  return events;
}

async function main() {
  const log = baseLog;

  // Load settings from Redis to configure the task worker
  // Priority: defaults < env variables < redis settings
  try {
    const settings = await getSettings();
    const infraSettings = (settings.services as any).infrastructure || {};

    // Apply Redis settings with priority over env vars
    const config = {
      redisUrl: infraSettings.redisUrl || process.env["REDIS_URL"] || "redis://localhost:6379",
      queuePrefix: infraSettings.queuePrefix || process.env["QUEUE_PREFIX"] || "bernard:q",
      taskQueueName: infraSettings.taskQueueName || process.env["TASK_QUEUE_NAME"] || "background-tasks",
      workerConcurrency: infraSettings.taskWorkerConcurrency || parseInt(process.env["TASK_WORKER_CONCURRENCY"] || "3", 10) || 3,
      maxRuntimeMs: infraSettings.taskMaxRuntimeMs || parseInt(process.env["TASK_MAX_RUNTIME_MS"] || "3600000", 10) || 3600000,
      attempts: infraSettings.taskAttempts || parseInt(process.env["TASK_ATTEMPTS"] || "3", 10) || 3,
      backoffMs: infraSettings.taskBackoffMs || parseInt(process.env["TASK_BACKOFF_MS"] || "1000", 10) || 1000,
      keepCompleted: infraSettings.taskKeepCompleted || parseInt(process.env["TASK_KEEP_COMPLETED"] || "50", 10) || 50,
      keepFailed: infraSettings.taskKeepFailed || parseInt(process.env["TASK_KEEP_FAILED"] || "100", 10) || 100,
      archiveAfterDays: infraSettings.taskArchiveAfterDays || parseInt(process.env["TASK_ARCHIVE_AFTER_DAYS"] || "7", 10) || 7
    };

    // Set the configuration for the task worker
    setTaskWorkerConfig(config);

    log.info({
      event: "task.worker.config_loaded",
      config: {
        ...config,
        // Don't log sensitive info
        redisUrl: config.redisUrl ? "[configured]" : "[default]"
      }
    });
  } catch (error) {
    log.warn({
      event: "task.worker.config_load_failed",
      error: error instanceof Error ? error.message : String(error)
    });
    // Continue with default configuration
  }

  const processor = createTaskProcessor();
  const worker = createTaskWorker(processor);
  const events = wireEvents(worker);
  const started = startTimer();
  log.info({ event: "task.worker.start", queue: taskQueueName });

  const shutdown = async (signal: string) => {
    log.info({ event: "task.worker.shutdown", signal, uptimeMs: started() });
    const results = await Promise.allSettled([worker.close(), events.close()]);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length > 0) {
      failures.forEach((failure, index) => {
        log.error({
          event: "task.worker.cleanup_failed",
          signal,
          cleanupStep: index === 0 ? "worker.close" : "events.close"
        });
      });
      process.exit(1);
    } else {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
