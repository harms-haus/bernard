import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Result of validating timer parameters.
 */
export type TimerValidationResult =
  | { ok: true; name: string; time: number; message: string }
  | { ok: false; reason: string };

/**
 * Dependencies for the timer tool.
 */
export interface TimerDependencies {
  createTask: (
    toolName: string,
    args: Record<string, unknown>,
    settings: Record<string, unknown>
  ) => Promise<{ taskId: string; taskName: string }>;
}

/**
 * Validate timer parameters.
 * This is a pure function for easy testing.
 */
export function validateTimerParams(params: {
  name: unknown;
  time: unknown;
  message: unknown;
}): TimerValidationResult {
  // Validate name
  if (!params.name || typeof params.name !== 'string' || params.name.trim().length === 0) {
    return { ok: false, reason: "name parameter is required and must be a non-empty string" };
  }

  // Validate time
  if (!params.time || typeof params.time !== 'number' || params.time <= 0) {
    return { ok: false, reason: "time parameter is required and must be a positive number (seconds)" };
  }

  if (params.time > 3600) { // 1 hour max
    return { ok: false, reason: "timer duration cannot exceed 3600 seconds (1 hour)" };
  }

  // Validate message
  if (!params.message || typeof params.message !== 'string') {
    return { ok: false, reason: "message parameter is required and must be a string" };
  }

  return {
    ok: true,
    name: params.name.trim(),
    time: params.time,
    message: params.message,
  };
}

/**
 * Create the timer tool with injected dependencies.
 */
export function createTimerTool(deps?: TimerDependencies) {
  return tool(
    async ({ name, time, message }) => {
      const validation = validateTimerParams({ name, time, message });
      
      if (!validation.ok) {
        return `Error: ${validation.reason}`;
      }

      // Check if dependencies are available
      if (!deps) {
        return "Error: Task context not available - cannot create background timer tasks";
      }

      try {
        const args = { name: validation.name, time: validation.time, message: validation.message };
        const settings = {};

        const { taskId } = await deps.createTask("timer", args, settings);
        return `Timer task started: "${validation.name}" (ID: ${taskId}) - will wait ${validation.time} seconds then record: "${validation.message}"`;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Error creating timer task: ${errorMessage}`;
      }
    },
    {
      name: "set_timer",
      description: "Create a timer that waits for the specified duration and then records a message.",
      schema: z.object({
        name: z.string().describe("Timer name/identifier"),
        time: z.number().positive().max(3600).describe("Duration in seconds (max 3600/1 hour)"),
        message: z.string().describe("Message to record when timer expires")
      })
    }
  );
}

/**
 * The timer tool instance factory with optional dependency overrides.
 */
export function createTimerToolFactory(
  overrides?: Partial<TimerDependencies>
): () => ReturnType<typeof createTimerTool> {
  const defaultDependencies: TimerDependencies = {
    createTask: async () => {
      throw new Error("createTask not configured");
    },
  };

  const deps = { ...defaultDependencies, ...overrides };

  return () => createTimerTool(deps);
}

/**
 * Backward compatible factory - task context must be provided at runtime.
 */
export function createTimerToolInstance(
  taskContext?: {
    conversationId: string;
    userId: string;
    createTask: (toolName: string, args: Record<string, unknown>, settings: Record<string, unknown>) => Promise<{ taskId: string; taskName: string }>;
  }
) {
  const deps: TimerDependencies = {
    createTask: taskContext?.createTask ?? (async () => {
      throw new Error("createTask not configured");
    }),
  };
  
  return createTimerTool(deps);
}

// Legacy export for backward compatibility (synchronous version)
export const timerTool = tool(
  async ({ seconds, note }) => {
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    return note ? `Timer finished: ${note}` : `Timer finished after ${seconds} seconds.`;
  },
  {
    name: "set_timer_sync",
    description: "DEPRECATED: Set a short synchronous timer (<= 60s) to wait before responding. Use set_timer for background tasks.",
    schema: {
      type: "object",
      properties: {
        seconds: {
          type: "number",
          description: "Number of seconds to wait (1-60)"
        },
        note: {
          type: "string",
          description: "Optional note to display when timer finishes"
        }
      },
      required: ["seconds"]
    }
  }
);
