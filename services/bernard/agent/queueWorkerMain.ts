import { childLogger, logger, startTimer, toErrorObject } from "@/lib/logging";
import { automationQueueName, createAutomationQueueEvents, createAutomationWorker } from "../lib/automation/queue";
import { createAutomationProcessor } from "../lib/automation/executor";

const baseLog = childLogger({ component: "automation_worker", queue: automationQueueName }, logger);

function wireEvents(worker: ReturnType<typeof createAutomationWorker>) {
  const events = createAutomationQueueEvents();
  const eventLog = childLogger({ component: "automation_events", queue: automationQueueName }, baseLog);

  worker.on("active", (job) => {
    const automationId = (job.data as { automationId?: string } | undefined)?.automationId;
    eventLog.info({
      event: "automation.job.start",
      jobId: job.id,
      automationId,
      attempts: job.attemptsMade
    });
  });

  worker.on("completed", (job, result) => {
    const automationId = (job.data as { automationId?: string } | undefined)?.automationId;
    eventLog.info({
      event: "automation.job.completed",
      jobId: job.id,
      automationId,
      attempts: job.attemptsMade,
      result
    });
  });

  worker.on("failed", (job, err) => {
    const automationId = (job?.data as { automationId?: string } | undefined)?.automationId;
    eventLog.error({
      event: "automation.job.failed",
      jobId: job?.id,
      automationId,
      attempts: job?.attemptsMade,
      err: toErrorObject(err)
    });
  });

  worker.on("error", (err) => {
    eventLog.error({ event: "automation.worker.error", err: toErrorObject(err) });
  });

  events.on("completed", ({ jobId, returnvalue }) => {
    eventLog.info({ event: "automation.events.completed", jobId, returnvalue });
  });
  events.on("failed", ({ jobId, failedReason }) => {
    eventLog.error({ event: "automation.events.failed", jobId, failedReason });
  });
  events.on("error", (err) => {
    eventLog.error({ event: "automation.events.error", err: toErrorObject(err) });
  });
  return events;
}

function main() {
  const log = baseLog;
  const processor = createAutomationProcessor();
  const worker = createAutomationWorker(processor);
  const events = wireEvents(worker);
  const started = startTimer();
  log.info({ event: "automation.worker.start", queue: automationQueueName });

  const shutdown = async (signal: string) => {
    log.info({ event: "automation.worker.shutdown", signal, uptimeMs: started() });
    const results = await Promise.allSettled([worker.close(), events.close()]);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length > 0) {
      failures.forEach((failure, index) => {
        log.error({
          event: "automation.worker.cleanup_failed",
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
  process.on("SIGHUP", () => void shutdown("SIGHUP"));
}

void main();
