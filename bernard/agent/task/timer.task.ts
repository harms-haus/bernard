import type { TaskExecutionContext, TaskResult } from "../../lib/task/types";

/**
 * Task function for timer that waits for the specified duration and records a message
 */
export async function timerTask(
  args: Record<string, unknown>,
  context: TaskExecutionContext
): Promise<TaskResult> {
  const { name, time, message } = args as {
    name: string;
    time: number;
    message: string;
  };

  try {
    // Record the start of the timer
    await context.recordEvent({
      type: "message_recorded",
      timestamp: new Date().toISOString(),
      data: {
        role: "system",
        content: `Timer "${name}" started for ${time} seconds`,
        userId: context.userId
      }
    });

    // Wait for the specified duration
    await new Promise(resolve => setTimeout(resolve, time * 1000));
    console.warn(`Timer "${name}" expired: ${message}`);

    // Record the timer completion with the message
    await context.recordEvent({
      type: "message_recorded",
      timestamp: new Date().toISOString(),
      data: {
        role: "system",
        content: `Timer "${name}" expired: ${message}`,
        userId: context.userId
      }
    });

    return {
      success: true,
      metadata: {
        timerName: name,
        duration: time,
        message
      }
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Record error
    try {
      await context.recordEvent({
        type: "message_recorded",
        timestamp: new Date().toISOString(),
        data: {
          role: "system",
          content: `Timer "${name}" error: ${errorMessage}`,
          userId: context.userId
        }
      });
    } catch {
      // Ignore event recording failures during error handling
    }

    return {
      success: false,
      errorMessage
    };
  }
}
