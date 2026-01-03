import fs from "node:fs/promises";
import path from "node:path";

import type {
  requestStartData,
  requestErrorData,
  recollectionsData,
  userMessageData,
  llmCallStartData,
  llmCallCompleteData,
  llmCallErrorData,
  toolCallStartData,
  toolCallCompleteData,
  toolCallErrorData,
  assistantMessageData,
  requestCompleteData,
  onEventData,
  Tracer,
} from "./tracer";

interface QueuedEvent {
  event: onEventData;
  timestamp: number;
  index: number;
}

interface RequestTrace {
  request_id: string;
  thread_id: string;
  model: string;
  agent: string;
  started_at: string;
  completed_at?: string | undefined;
  duration_ms?: number | undefined;
  events: Array<{
    timestamp: string;
    type: string;
    data: onEventData;
  }>;
}

interface BernardTracerConfig {
  traceFilePath?: string | undefined;
  enableTracing?: boolean;
  batchSize?: number;
  maxAgeSeconds?: number;
}

export class BernardTracer implements Tracer {
  private eventQueue: QueuedEvent[] = [];
  private isWriting: boolean = false;
  private eventIndex: number = 0;
  private currentTrace: RequestTrace | null = null;
  private traceFilePath: string = "";
  private eventCallbacks: Array<(data: onEventData) => void> = [];
  private config: Required<BernardTracerConfig>;
  private readonly TRACES_DIR: string;

  constructor(config: BernardTracerConfig = {}) {
    this.TRACES_DIR = path.join(process.cwd(), "traces");

    this.config = {
      traceFilePath: config.traceFilePath,
      enableTracing: config.enableTracing ?? process.env["ENABLE_TRACING"] !== "false",
      batchSize: config.batchSize ?? parseInt(process.env["TRACE_BATCH_SIZE"] ?? "10", 10),
      maxAgeSeconds: config.maxAgeSeconds ?? parseInt(process.env["TRACE_MAX_AGE_SECS"] ?? "0", 10),
    };

    this.traceFilePath = config.traceFilePath ?? this.generateTraceFilePath();

    void this.ensureTracesDirectory();
  }

  requestStart(data: Omit<requestStartData, "type">): void {
    if (!this.config.enableTracing) return;

    this.currentTrace = {
      request_id: data.id,
      thread_id: data.threadId,
      model: data.model,
      agent: data.agent,
      started_at: new Date().toISOString(),
      events: [] as never[],
    };

    this.eventQueue = [];
    this.eventIndex = 0;

    if (!this.config.traceFilePath) {
      this.traceFilePath = this.generateTraceFilePath(data.id);
    }

    this.captureEvent("request_start", data);
  }

  recollections(data: Omit<recollectionsData, "type">): void {
    if (!this.config.enableTracing) return;
    this.captureEvent("recollection", data);
  }

  userMessage(data: Omit<userMessageData, "type">): void {
    if (!this.config.enableTracing) return;
    this.captureEvent("user_message", data);
  }

  llmCallStart(data: Omit<llmCallStartData, "type">): void {
    if (!this.config.enableTracing) return;
    this.captureEvent("llm_call_start", data);
  }

  llmCallComplete(data: Omit<llmCallCompleteData, "type">): void {
    if (!this.config.enableTracing) return;
    this.captureEvent("llm_call_complete", data);
  }

  llmCallError(data: Omit<llmCallErrorData, "type">): void {
    if (!this.config.enableTracing) return;
    this.captureEvent("llm_call_error", data);
  }

  toolCallStart(data: Omit<toolCallStartData, "type">): void {
    if (!this.config.enableTracing) return;
    this.captureEvent("tool_call_start", data);
  }

  toolCallComplete(data: Omit<toolCallCompleteData, "type">): void {
    if (!this.config.enableTracing) return;
    this.captureEvent("tool_call_complete", data);
  }

  toolCallError(data: Omit<toolCallErrorData, "type">): void {
    if (!this.config.enableTracing) return;
    this.captureEvent("tool_call_error", data);
  }

  assistantMessage(data: Omit<assistantMessageData, "type">): void {
    if (!this.config.enableTracing) return;
    this.captureEvent("assistant_message", data);
  }

  requestComplete(data: Omit<requestCompleteData, "type">): void {
    if (!this.config.enableTracing) return;

    if (this.currentTrace) {
      this.currentTrace.completed_at = new Date().toISOString();
      const startTime = new Date(this.currentTrace.started_at).getTime();
      const endTime = Date.now();
      this.currentTrace.duration_ms = endTime - startTime;
    }

    this.captureEvent("request_stop", data);
    this.scheduleWrite();
  }

  requestError(data: Omit<requestErrorData, "type">): void {
    if (!this.config.enableTracing) return;

    if (this.currentTrace) {
      this.currentTrace.completed_at = new Date().toISOString();
      const startTime = new Date(this.currentTrace.started_at).getTime();
      const endTime = Date.now();
      this.currentTrace.duration_ms = endTime - startTime;
    }

    this.captureEvent("request_error", data);
    this.scheduleWrite();
  }

  onEvent(callback: (data: onEventData) => void): void {
    this.eventCallbacks.push(callback);
  }

  async flush(): Promise<void> {
    while (this.isWriting) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    if (this.eventQueue.length > 0) {
      await this.writeEvents();
    }
  }

  getCurrentTrace(): RequestTrace | null {
    return this.currentTrace;
  }

  getTraceFilePath(): string {
    return this.traceFilePath;
  }

  isActive(): boolean {
    return this.config.enableTracing && this.currentTrace !== null;
  }

  private captureEvent(type: string, data: Omit<onEventData, "type">): void {
    const event = {
      type,
      ...data,
    } as onEventData;

    this.eventQueue.push({
      event,
      timestamp: Date.now(),
      index: this.eventIndex++,
    });

    this.scheduleWrite();

    this.eventCallbacks.forEach(cb => {
      try {
        cb(event);
      } catch (error) {
        console.error("Error in event callback:", error);
      }
    });
  }

  private scheduleWrite(): void {
    if (this.isWriting || this.eventQueue.length === 0) {
      return;
    }

    setImmediate(() => {
      void this.writeEvents();
    });
  }

  private async writeEvents(): Promise<void> {
    if (this.eventQueue.length === 0) {
      return;
    }

    this.isWriting = true;

    try {
      while (this.eventQueue.length > 0) {
        const queuedEvents = [...this.eventQueue];
        this.eventQueue = [];

        queuedEvents.sort((a, b) => a.index - b.index);

        const trace = this.buildTrace(queuedEvents);

        const dir = path.dirname(this.traceFilePath);
        await fs.mkdir(dir, { recursive: true });

        await fs.writeFile(this.traceFilePath, JSON.stringify(trace, null, 2), "utf-8");
      }
    } catch (error) {
      console.error("Failed to write trace file:", error);
    } finally {
      this.isWriting = false;

      if (this.eventQueue.length > 0) {
        this.scheduleWrite();
      }
    }
  }

  private buildTrace(queuedEvents: QueuedEvent[]): RequestTrace {
    if (!this.currentTrace) {
      throw new Error("Cannot build trace: no active trace");
    }

    return {
      ...this.currentTrace,
      events: queuedEvents.map(qe => ({
        timestamp: new Date(qe.timestamp).toISOString(),
        type: qe.event.type,
        data: qe.event,
      })),
    };
  }

  private generateTraceFilePath(requestId?: string): string {
    const timestamp = Date.now();
    const id = requestId || "unknown";
    return path.join(this.TRACES_DIR, `trace-${id}-${timestamp}.json`);
  }

  private async ensureTracesDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.TRACES_DIR, { recursive: true });
    } catch (error) {
      console.error("Failed to create traces directory:", error);
    }
  }
}
