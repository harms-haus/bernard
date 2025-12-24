import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Create the timer tool that starts a background timer task
 */
function createTimerTool(
  taskContext?: {
    conversationId: string;
    userId: string;
    createTask: (toolName: string, args: Record<string, unknown>, settings: any) => Promise<{ taskId: string; taskName: string }>;
  }
) {
  return tool(
    async ({ name, time, message }) => {
      // Validate inputs
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return "Error: name parameter is required and must be a non-empty string";
      }

      if (!time || typeof time !== 'number' || time <= 0) {
        return "Error: time parameter is required and must be a positive number (seconds)";
      }

      if (time > 3600) { // 1 hour max
        return "Error: timer duration cannot exceed 3600 seconds (1 hour)";
      }

      if (!message || typeof message !== 'string') {
        return "Error: message parameter is required and must be a string";
      }

      // Create a background task
      if (!taskContext) {
        return "Error: Task context not available - cannot create background timer tasks";
      }

      try {
        const args = { name: name.trim(), time, message };
        const settings = {}; // Timer doesn't need service configurations

        const { taskId, taskName } = await taskContext.createTask("timer", args, settings);
        return `Timer task started: "${name}" (ID: ${taskId}) - will wait ${time} seconds then record: "${message}"`;

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
 * The timer tool instance factory
 */
export function createTimerToolInstance(
  taskContext?: {
    conversationId: string;
    userId: string;
    createTask: (toolName: string, args: Record<string, unknown>, settings: any) => Promise<{ taskId: string; taskName: string }>;
  }
) {
  return createTimerTool(taskContext);
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
