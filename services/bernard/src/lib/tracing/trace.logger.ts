import fs from "node:fs/promises";
import path from "node:path";

/**
 * Trace event types for categorization
 */
export type TraceEventType =
  | "request_received"
  | "llm_call_start"
  | "llm_call_complete"
  | "tool_call_start"
  | "tool_call_complete"
  | "router_llm"
  | "response_llm"
  | "response_complete"
  | "graph_iteration";

/**
 * Individual trace event
 */
export interface TraceEvent {
  timestamp: string;
  type: TraceEventType;
  iteration?: number;
  node?: string;
  duration?: number;
  data: Record<string, unknown>;
}

/**
 * Tool definition trace data
 */
export interface ToolDefinitionTrace {
  name: string;
  description?: string;
  schema?: unknown;
}

/**
 * Request trace data - captures the exact request sent to the LLM
 */
export interface LLMRequestTrace {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: {
    model: string;
    messages: Array<{
      role: string;
      content: string;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    }>;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    stop?: string | string[];
    stream?: boolean;
    tools?: unknown[];
    tool_choice?: unknown;
  };
}

/**
 * LLM call trace data
 */
export interface LLMCallTrace {
  model: string;
  messages: Array<{
    type: string;
    content: string;
    tool_calls?: Array<{
      name: string;
      arguments: string;
    }>;
  }>;
  provided_tools?: ToolDefinitionTrace[];
  request?: LLMRequestTrace;
  response?: {
    content: string;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    finish_reason?: string;
  };
}

/**
 * Tool call trace data
 */
export interface ToolCallTrace {
  tool_name: string;
  tool_call_id: string;
  arguments: string;
  result?: string;
  error?: string;
  duration_ms?: number;
}

/**
 * Complete trace for a single request
 */
export interface RequestTrace {
  request_id: string;
  thread_id: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  initial_request: {
    messages: Array<{
      role: string;
      content: string;
    }>;
    stream: boolean;
  };
  events: TraceEvent[];
  llm_calls: LLMCallTrace[];
  tool_calls: ToolCallTrace[];
  final_response?: {
    content: string;
  };
}

/**
 * Singleton trace logger that writes to a single file (overwritten on each request)
 */
class TraceLogger {
  private trace: RequestTrace | null = null;
  private tracePath: string;
  private currentEventIndex = 0;

  constructor() {
    // Default trace path, can be overridden via environment
    this.tracePath = process.env["TRACE_LOG_PATH"] || path.join(process.cwd(), "trace.json");
  }

  /**
   * Start a new trace for a request
   */
  startTrace(requestId: string, threadId: string, initialMessages: Array<{ role: string; content: string }>, stream: boolean): void {
    this.trace = {
      request_id: requestId,
      thread_id: threadId,
      started_at: new Date().toISOString(),
      initial_request: {
        messages: initialMessages,
        stream,
      },
      events: [],
      llm_calls: [],
      tool_calls: [],
    };
    this.currentEventIndex = 0;
  }

  /**
   * Add an event to the trace
   */
  addEvent(type: TraceEventType, data: Record<string, unknown>, options?: { iteration?: number; node?: string; duration?: number }): void {
    if (!this.trace) return;

    const event: TraceEvent = {
      timestamp: new Date().toISOString(),
      type,
      data,
    };

    if (options?.iteration !== undefined) event.iteration = options.iteration;
    if (options?.node !== undefined) event.node = options.node;
    if (options?.duration !== undefined) event.duration = options.duration;

    this.trace.events.push(event);
  }

  /**
   * Record an LLM call
   */
  recordLLMCall(
    purpose: "router" | "response",
    model: string,
    messages: Array<{ type: string; content: string; tool_calls?: Array<{ name: string; arguments: string }> }>,
    providedTools?: ToolDefinitionTrace[],
    iteration?: number,
    request?: LLMRequestTrace
  ): void {
    if (!this.trace) return;

    const llmCall: LLMCallTrace = {
      model,
      messages,
    };

    if (providedTools && providedTools.length > 0) {
      llmCall.provided_tools = providedTools;
    }

    if (request) {
      llmCall.request = request;
    }

    this.trace.llm_calls.push(llmCall);
    this.addEvent(
      purpose === "router" ? "router_llm" : "response_llm",
      { model, message_count: messages.length, provided_tools_count: providedTools?.length ?? 0 },
      iteration !== undefined ? { iteration } : undefined
    );
  }

  /**
   * Record LLM response
   */
  recordLLMResponse(
    purpose: "router" | "response",
    response: { content: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }; finish_reason?: string }
  ): void {
    if (!this.trace) return;

    const lastCall = this.trace.llm_calls[this.trace.llm_calls.length - 1];
    if (lastCall) {
      lastCall.response = response;
    }

    this.addEvent("llm_call_complete", {
      purpose,
      content_length: response.content.length,
      usage: response.usage,
      finish_reason: response.finish_reason,
    });
  }

  /**
   * Record tool call start
   */
  recordToolCallStart(toolName: string, toolCallId: string, arguments_: Record<string, unknown>, iteration?: number): void {
    if (!this.trace) return;

    this.trace.tool_calls.push({
      tool_name: toolName,
      tool_call_id: toolCallId,
      arguments: JSON.stringify(arguments_),
    });

    this.addEvent(
      "tool_call_start",
      { tool_name: toolName, tool_call_id: toolCallId, arguments: arguments_ },
      iteration !== undefined ? { iteration } : undefined
    );
  }

  /**
   * Record tool call complete
   */
  recordToolCallComplete(toolName: string, toolCallId: string, result: string, durationMs?: number): void {
    if (!this.trace) return;

    const lastTool = this.trace.tool_calls[this.trace.tool_calls.length - 1];
    if (lastTool && lastTool.tool_call_id === toolCallId) {
      lastTool.result = result.length > 10000 ? result.substring(0, 10000) + "... [truncated]" : result;
      if (durationMs !== undefined) lastTool.duration_ms = durationMs;
    }

    this.addEvent(
      "tool_call_complete",
      { tool_name: toolName, tool_call_id: toolCallId, result_length: result.length, duration_ms: durationMs }
    );
  }

  /**
   * Record tool call error
   */
  recordToolCallError(toolName: string, toolCallId: string, error: string, durationMs?: number): void {
    if (!this.trace) return;

    const lastTool = this.trace.tool_calls[this.trace.tool_calls.length - 1];
    if (lastTool && lastTool.tool_call_id === toolCallId) {
      lastTool.error = error;
      if (durationMs !== undefined) lastTool.duration_ms = durationMs;
    }

    this.addEvent("tool_call_complete", {
      tool_name: toolName,
      tool_call_id: toolCallId,
      error,
      duration_ms: durationMs,
    });
  }

  /**
   * Record final response
   */
  recordFinalResponse(content: string): void {
    if (!this.trace) return;

    this.trace.final_response = {
      content: content.length > 100000 ? content.substring(0, 100000) + "... [truncated]" : content,
    };

    this.addEvent("response_complete", { content_length: content.length });
  }

  /**
   * Complete the trace
   */
  completeTrace(): void {
    if (!this.trace) return;

    this.trace.completed_at = new Date().toISOString();
    if (this.trace.started_at) {
      const start = new Date(this.trace.started_at).getTime();
      const end = new Date(this.trace.completed_at).getTime();
      this.trace.duration_ms = end - start;
    }
  }

  /**
   * Write trace to file (overwrites existing file)
   */
  async writeTrace(): Promise<void> {
    if (!this.trace) return;

    try {
      const content = JSON.stringify(this.trace, null, 2);
      await fs.writeFile(this.tracePath, content, "utf-8");
    } catch (error) {
      console.error("Failed to write trace file:", error);
    }
  }

  /**
   * Get current trace (for debugging)
   */
  getTrace(): RequestTrace | null {
    return this.trace;
  }

  /**
   * Check if tracing is active
   */
  isActive(): boolean {
    return this.trace !== null;
  }

  /**
   * Get the trace file path
   */
  getTracePath(): string {
    return this.tracePath;
  }
}

// Export singleton instance
export const traceLogger = new TraceLogger();

// Export class for testing
export { TraceLogger };
