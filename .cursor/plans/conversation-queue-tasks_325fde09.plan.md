---
name: conversation-queue-tasks
overview: Add a Redis/BullMQ-backed queue to run post-conversation tasks (indexing, summarization, flagging) triggered from the existing conversation-close hook.
todos:
  - id: queue-infra
    content: Add BullMQ queue client and job types
    status: completed
  - id: conv-processors
    content: Implement indexing/summary/flag processors
    status: completed
  - id: hook-enqueue
    content: Wire closeConversation to enqueue jobs
    status: completed
  - id: worker-entry
    content: Add worker runner and npm script
    status: completed
  - id: tests-obs
    content: Test queue flow and add job metrics/logging
    status: completed
---

# Queue-Based Conversation Tasks

1) Queue infrastructure (BullMQ)

- Add a queue helper (e.g., `bernard/lib/queue/client.ts`) that builds BullMQ `Queue`, `QueueEvents`, and `Worker` instances using `REDIS_URL` and a `QUEUE_PREFIX`, reusing existing Redis config where possible.
- Define shared job schemas/types for conversation jobs (IDs, payload validation) in `bernard/lib/queue/types.ts` to keep workers and producers aligned and idempotent (jobId per conversation+task).

2) Conversation job processors

- Implement processors in `bernard/lib/queue/conversationTasks.ts` that load conversation records/messages via `RecordKeeper`/`MessageLog` and run:
• indexing: chunk conversation text and upsert to the existing Redis vector store (reuse `MemoryStore`/embedding config with a dedicated index name);
• summary: call `ConversationSummaryService` and persist summary/tags/flags/keywords/places back to the conversation hash;
• flagging: apply safety checks (reusing summary flags and/or moderation helper) and write flags to the conversation record.
- Ensure processors handle missing data gracefully, cap runtime, and log concise results for monitoring.

3) Hook enqueue on conversation close

- Update `bernard/lib/conversation/recordKeeper.ts` `closeConversation` to enqueue the three jobs (unique job IDs) instead of doing inline summarization; keep direct field updates only for status/closedAt.
- Preserve existing behavior for callers (status closure) and add optional short-circuit fallback if the queue is disabled.

4) Worker entrypoint & scripts

- Add a worker runner (e.g., `bernard/agent/queueWorker.ts`) that registers the conversation processors and starts BullMQ workers with configurable concurrency/backoff.
- Wire npm script(s) (e.g., `npm run queues:worker`) and minimal docs in `docs/plans/` or README section covering how to run the worker alongside the app.

5) Tests & observability

- Add unit/integration tests for enqueuing and processing using the fake Redis test helpers (e.g., in `bernard/tests/conversationQueue.test.ts`), covering dedupe, success paths, and failure flagging.
- Add lightweight logging/metrics hooks (compatible with existing metrics namespace) to surface job success/failure counts.