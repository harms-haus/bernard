import type { LangGraphRunnableConfig } from "@langchain/langgraph";

/**
 * Progress event types for tool execution
 */
export type ProgressEventType = "progress" | "step" | "complete" | "error";

/**
 * Progress event structure emitted by ProgressReporter
 */
export interface ProgressEvent {
  type: ProgressEventType;
  tool: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

/**
 * ProgressReporter enables tools to emit progress events during execution.
 * These events are streamed to clients in real-time via the "custom" stream mode.
 * 
 * Usage:
 * ```typescript
 * const progress = new ProgressReporter(config, "web_search");
 * progress.start("Searching for query");
 * progress.progress(1, 3, "Executing search");
 * progress.complete("Found 5 results");
 * ```
 */
export class ProgressReporter {
  private config: LangGraphRunnableConfig;
  private toolName: string;

  /**
   * Create a new ProgressReporter for a tool
   * 
   * @param config - The LangGraph runnable config (contains writer for emitting events)
   * @param toolName - Name of the tool (used for event identification)
   */
  constructor(config: LangGraphRunnableConfig, toolName: string) {
    this.config = config;
    this.toolName = toolName;
  }

  /**
   * Emit a progress event with the specified type, message, and optional data
   * 
   * @param phase - The type of progress event
   * @param message - Human-readable message describing the progress
   * @param data - Optional additional data to include in the event
   */
  emit(phase: ProgressEventType, message: string, data?: Record<string, unknown>): void {
    if (!this.config.writer) return;
    
    this.config.writer({
      _type: "tool_progress",
      tool: this.toolName,
      phase,
      message,
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit a "step" event indicating a new step has started
   * 
   * @param message - Description of the step being started
   */
  start(message: string): void {
    this.emit("step", `Starting: ${message}`);
  }

  /**
   * Emit a "progress" event indicating ongoing work with progress percentage
   * 
   * @param current - Current progress value
   * @param total - Total expected value
   * @param message - Optional message describing the current progress
   */
  progress(current: number, total: number, message?: string): void {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    this.emit("progress", message || `${current}/${total}`, {
      current,
      total,
      percent,
    });
  }

  /**
   * Emit a "complete" event indicating a task has finished successfully
   * 
   * @param message - Description of what was completed
   * @param data - Optional results data to include
   */
  complete(message: string, data?: Record<string, unknown>): void {
    this.emit("complete", message, data);
  }

  /**
   * Emit an "error" event indicating a failure occurred
   * 
   * @param error - The error that occurred
   */
  error(error: Error): void {
    this.emit("error", error.message, {
      stack: error.stack,
      name: error.name,
    });
  }
}

/**
 * Factory function to create a ProgressReporter
 * 
 * @param config - The LangGraph runnable config
 * @param toolName - Name of the tool
 * @returns A new ProgressReporter instance
 */
export function createProgressReporter(
  config: LangGraphRunnableConfig,
  toolName: string,
): ProgressReporter {
  return new ProgressReporter(config, toolName);
}
