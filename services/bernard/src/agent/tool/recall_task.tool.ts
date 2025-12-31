import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { getRedis } from "@/lib/infra/redis";
import { TaskRecordKeeper } from "@/agent/recordKeeper/task.keeper";
import { withTimeout } from "@/lib/infra/timeouts";

const RECALL_TIMEOUT_MS = Number(process.env["TASK_RECALL_TIMEOUT_MS"]) || 5_000;

export type RecallTaskDependencies = {
  redis: typeof getRedis;
  withTimeoutImpl: typeof withTimeout;
  logger: Pick<typeof console, "warn" | "error">;
};

const defaultDeps: RecallTaskDependencies = {
  redis: getRedis,
  withTimeoutImpl: withTimeout,
  logger: console
};

/**
 * Format unknown errors into human-readable strings.
 */
export function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Create the recall_task tool handler with injectable dependencies for testing.
 */
export function createRecallTaskHandler(deps: RecallTaskDependencies) {
  return async (
    {
      id,
      offset,
      count,
      section
    }: {
      id: string;
      offset?: number;
      count?: number;
      section?: string;
    },
    _runOpts?: unknown
  ) => {
    try {
      // Validate task ID
      if (!id || id.trim().length === 0) {
        return {
          error: "Task ID is required and cannot be empty",
          task: null,
          sections: {},
          messages: []
        };
      }

      // Initialize dependencies
      const redis = deps.redis();
      const recordKeeper = new TaskRecordKeeper(redis);

      // Recall task with timeout protection
      const options: { offset?: number; count?: number; section?: string } = {};
      if (offset !== undefined) options.offset = offset;
      if (count !== undefined) options.count = count;
      if (section !== undefined) options.section = section;

      const result = await deps.withTimeoutImpl(
        recordKeeper.recallTask(id, Object.keys(options).length > 0 ? options : undefined),
        RECALL_TIMEOUT_MS,
        "task recall"
      );

      if (!result) {
        return {
          error: `Task not found: ${id}`,
          task: null,
          sections: {},
          messages: []
        };
      }

      return {
        task: {
          id: result.task.id,
          name: result.task.name,
          status: result.task.status,
          toolName: result.task.toolName,
          createdAt: result.task.createdAt,
          startedAt: result.task.startedAt,
          completedAt: result.task.completedAt,
          runtimeMs: result.task.runtimeMs,
          errorMessage: result.task.errorMessage,
          messageCount: result.task.messageCount,
          toolCallCount: result.task.toolCallCount,
          tokensIn: result.task.tokensIn,
          tokensOut: result.task.tokensOut,
          archived: result.task.archived
        },
        sections: result.sections || {},
        messages: result.messages || []
      };
    } catch (err: unknown) {
      const errorMessage = formatError(err);
      deps.logger.error(`[recall_task] recall failed: ${errorMessage}`);
      return {
        error: errorMessage,
        task: null,
        sections: {},
        messages: []
      };
    }
  };
}

/**
 * Build the recall_task LangChain tool with optional dependency overrides.
 */
export function createRecallTaskTool(overrides: Partial<RecallTaskDependencies> = {}) {
  const deps: RecallTaskDependencies = { ...defaultDeps, ...overrides };
  const handler = createRecallTaskHandler(deps);

  return tool(
    handler,
    {
      name: "recall_task",
      description: `Retrieve information about a background task by its ID. Use this to check task status, get execution details, or access specific sections of task data. Tasks are background operations that run asynchronously and may contain structured data in named sections.`,
      schema: z.object({
        id: z.string().min(1, "id is required").describe("Task ID to recall"),
        offset: z.number().min(0).optional().describe("Token offset for message content (default: 0)"),
        count: z.number().min(1).optional().describe("Maximum token count to return (default: all)"),
        section: z.string().optional().describe("Specific section to retrieve (e.g., 'summary', 'execution_log'). If not specified, returns all sections.")
      })
    }
  );
}

export const recallTaskTool = createRecallTaskTool();
