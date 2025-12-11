import { createConversationQueueEvents, createConversationWorker } from "../lib/queue/client";
import { buildConversationTaskProcessor } from "../lib/queue/conversationTasks";

function wireEvents() {
  const events = createConversationQueueEvents();
  events.on("completed", ({ jobId, returnvalue }) => {
    console.log(`[queue] job completed`, { jobId, returnvalue });
  });
  events.on("failed", ({ jobId, failedReason }) => {
    console.error(`[queue] job failed`, { jobId, failedReason });
  });
  events.on("error", (err) => {
    console.error(`[queue] events error`, err);
  });
  return events;
}

async function main() {
  const processor = buildConversationTaskProcessor({
    logger: (message, meta) => console.log(`[conversation-tasks] ${message}`, meta)
  });
  const worker = createConversationWorker(processor);
  const events = wireEvents();

  const shutdown = async (signal: string) => {
    console.log(`[queue] shutting down on ${signal}`);
    await Promise.allSettled([worker.close(), events.close()]);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
