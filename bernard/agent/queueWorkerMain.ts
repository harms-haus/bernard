import { childLogger, logger, startTimer, toErrorObject } from "@/lib/logging";
import { conversationQueueName, createConversationQueueEvents, createConversationWorker } from "../lib/queue/client";
import { buildConversationTaskProcessor } from "../lib/queue/conversationTasks";

const baseLog = childLogger({ component: "queue_worker", queue: conversationQueueName }, logger);

function wireEvents(worker: ReturnType<typeof createConversationWorker>) {
  const events = createConversationQueueEvents();
  const eventLog = childLogger({ component: "queue_events", queue: conversationQueueName }, baseLog);

  worker.on("active", (job) => {
    eventLog.info({
      event: "queue.job.start",
      jobId: job.id,
      name: job.name,
      conversationId: (job.data as { conversationId?: string } | undefined)?.conversationId,
      attempts: job.attemptsMade
    });
  });

  worker.on("completed", (job, result) => {
    eventLog.info({
      event: "queue.job.completed",
      jobId: job.id,
      name: job.name,
      conversationId: (job.data as { conversationId?: string } | undefined)?.conversationId,
      attempts: job.attemptsMade,
      result
    });
  });

  worker.on("failed", (job, err) => {
    eventLog.error({
      event: "queue.job.failed",
      jobId: job?.id,
      name: job?.name,
      conversationId: (job?.data as { conversationId?: string } | undefined)?.conversationId,
      attempts: job?.attemptsMade,
      err: toErrorObject(err)
    });
  });

  worker.on("error", (err) => {
    eventLog.error({ event: "queue.worker.error", err: toErrorObject(err) });
  });

  events.on("completed", ({ jobId, returnvalue }) => {
    eventLog.info({ event: "queue.events.completed", jobId, returnvalue });
  });
  events.on("failed", ({ jobId, failedReason }) => {
    eventLog.error({ event: "queue.events.failed", jobId, failedReason });
  });
  events.on("error", (err) => {
    eventLog.error({ event: "queue.events.error", err: toErrorObject(err) });
  });
  return events;
}

async function main() {
  const log = baseLog;
  const processor = buildConversationTaskProcessor({
    logger: (message, meta) => log.info({ event: `conversation_task.${message}`, ...meta })
  });
  const worker = createConversationWorker(processor);
  const events = wireEvents(worker);
  const started = startTimer();
  log.info({ event: "queue.worker.start", queue: conversationQueueName });

  const shutdown = async (signal: string) => {
    log.info({ event: "queue.worker.shutdown", signal, uptimeMs: started() });
    const results = await Promise.allSettled([worker.close(), events.close()]);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length > 0) {
      failures.forEach((failure, index) => {
        log.error({
          event: "queue.worker.cleanup_failed",
          signal,
          cleanupStep: index === 0 ? "worker.close" : "events.close",
void main().catch((err) => {
  baseLog.error({ event: "queue.worker.fatal", err: toErrorObject(err) });
  process.exit(1);
});
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
