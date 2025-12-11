import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { MemoryStore } from "@/lib/memory/store";
import { memorizeValue, type MemorizeInput } from "@/lib/memory/service";
import { withTimeout } from "@/lib/infra/timeouts";

const BACKGROUND_TIMEOUT_MS = Number(process.env["MEMORIZE_BACKGROUND_TIMEOUT_MS"]) || 30_000;

export type MemorizeScheduler = (
  fn: () => void | Promise<void>,
  delayMs: number
) => ReturnType<typeof setTimeout>;

export type MemorizeDependencies = {
  memorizeValueImpl: typeof memorizeValue;
  withTimeoutImpl: typeof withTimeout;
  scheduler: MemorizeScheduler;
  logger: Pick<typeof console, "warn">;
  verifyConfigurationImpl: typeof MemoryStore.verifyConfiguration;
};

const defaultDeps: MemorizeDependencies = {
  memorizeValueImpl: memorizeValue,
  withTimeoutImpl: withTimeout,
  scheduler: setTimeout,
  logger: console,
  verifyConfigurationImpl: MemoryStore.verifyConfiguration
};

/**
 * Format unknown errors into human-readable strings.
 */
export function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Resolve the conversation identifier from optional run options.
 */
export function resolveConversationId(runOpts?: { conversationId?: string }): string {
  return (runOpts as { conversationId?: string } | undefined)?.conversationId ?? "unknown";
}

/**
 * Build the user-facing queued response returned immediately from the tool.
 */
export function buildQueuedResponse(payload: MemorizeInput) {
  return {
    status: "queued" as const,
    label: payload.label,
    conversationId: payload.conversationId,
    note: "Memorization started in background; results will be available later."
  };
}

/**
 * Schedule memorization work to run in the background with timeout protection.
 */
export function scheduleMemorization(payload: MemorizeInput, deps: MemorizeDependencies): void {
  const run = async () => {
    await deps
      .withTimeoutImpl(
        deps.memorizeValueImpl(payload),
        BACKGROUND_TIMEOUT_MS,
        "memorize background"
      )
      .catch((err) => {
        deps.logger.warn(`[memorize] background run failed: ${formatError(err)}`);
      });
  };

  deps.scheduler(run, 0);
}

/**
 * Create the memorize tool handler with injectable dependencies for testing.
 */
export function createMemorizeHandler(deps: MemorizeDependencies) {
  return async ({ label, content }: { label: string; content: string }, runOpts?: { conversationId?: string }) => {
    const conversationId = resolveConversationId(runOpts);
    const payload: MemorizeInput = { label, content, conversationId };
    scheduleMemorization(payload, deps);
    return buildQueuedResponse(payload);
  };
}

/**
 * Build the memorize LangChain tool with optional dependency overrides.
 */
export function createMemorizeTool(overrides: Partial<MemorizeDependencies> = {}) {
  const deps: MemorizeDependencies = { ...defaultDeps, ...overrides };
  const handler = createMemorizeHandler(deps);

  return Object.assign(
    tool(
      handler,
      {
        name: "memorize",
        description: `Remember a fact or information that is relevant to the user with a label and content, 
deduping against existing memories.`,
        schema: z.object({
          label: z.string().min(1, "label is required"),
          content: z.string().min(1, "content is required")
        })
      }
    ),
    {
      verifyConfiguration: () => deps.verifyConfigurationImpl()
    }
  );
}

export const memorizeTool = createMemorizeTool();



