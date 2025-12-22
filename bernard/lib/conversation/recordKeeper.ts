import crypto from "node:crypto";
import type { BaseMessage } from "@langchain/core/messages";
import type Redis from "ioredis";

import type { Queue } from "bullmq";

import type { ConversationSummaryService, SummaryResult, SummaryFlags } from "./summary";
import { MessageLog, snapshotMessageForTrace } from "./messageLog";

// Helper function from messageLog.ts
function isMessageRecord(msg: BaseMessage | MessageRecord): msg is MessageRecord {
  return "role" in msg && "createdAt" in msg;
}
import { messageRecordToOpenAI } from "./messages";
import type { OpenAIMessage } from "./messages";
import type { Context } from "./context";
import type {
  Archivist,
  Conversation,
  ConversationIndexingStatus,
  ConversationStatus,
  ConversationStats,
  ConversationWithStats,
  MessageRecord,
  OpenRouterResult,
  RecallConversation,
  RecallQuery,
  Recorder,
  RecordKeeperStatus,
  Request,
  ToolCallEntry,
  ToolResult,
  Turn,
  TurnStatus
} from "./types";
import { conversationQueueName, createConversationQueue } from "../queue/client";
import { CONVERSATION_TASKS, buildConversationJobId } from "../queue/types";
import type { ConversationTaskName, ConversationTaskPayload } from "../queue/types";
import { childLogger, logger, toErrorObject } from "../logging";
export type {
  Conversation,
  ConversationIndexingStatus,
  ConversationStatus,
  ConversationStats,
  ConversationWithStats,
  MessageRecord,
  OpenRouterResult,
  RecallConversation,
  RecallQuery,
  RecordKeeperStatus,
  Request,
  ToolCallEntry,
  ToolResult,
  Turn,
  TurnStatus
} from "./types";

type RecordKeeperOptions = {
  namespace?: string;
  metricsNamespace?: string;
  idleMs?: number;
  summarizer?: ConversationSummaryService;
  queue?: Queue<ConversationTaskPayload, unknown, ConversationTaskName>;
  queueDisabled?: boolean;
};

const DEFAULT_NAMESPACE = "bernard:rk";
const DEFAULT_METRICS_NAMESPACE = "bernard:rk:metrics";
const DEFAULT_IDLE_MS = 10 * 60 * 1000; // 10 minutes
const TASKS_DISABLED = process.env["CONVERSATION_TASKS_DISABLED"] === "true";

function nowIso() {
  return new Date().toISOString();
}

function uniqueId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function parseJsonArray(val?: string): string[] | undefined {
  if (!val) return undefined;
  try {
    const parsed: unknown = JSON.parse(val);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : undefined;
  } catch {
    return val.split(",").map((v) => v.trim()).filter(Boolean);
  }
}

function toNumber(value?: string): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Facade for logging conversation state, requests, turns, and messages in Redis.
 */
export class RecordKeeper implements Archivist, Recorder {
  private readonly namespace: string;
  private readonly metricsNamespace: string;
  private readonly idleMs: number;
  private readonly summarizer: ConversationSummaryService | undefined;
  private readonly tasksDisabled: boolean;
  private readonly messageLog: MessageLog;
  private readonly log = childLogger({ component: "record_keeper" }, logger);

  constructor(
    private readonly redis: Redis,
    opts: RecordKeeperOptions = {}
  ) {
    this.namespace = opts.namespace ?? DEFAULT_NAMESPACE;
    this.metricsNamespace = opts.metricsNamespace ?? DEFAULT_METRICS_NAMESPACE;
    this.idleMs = opts.idleMs ?? DEFAULT_IDLE_MS;
    this.summarizer = opts.summarizer;
    this.tasksDisabled = opts.queueDisabled ?? TASKS_DISABLED;
    this.messageLog = new MessageLog(redis, (suffix: string) => this.key(suffix));
    this.conversationQueue = opts.queue ?? null;
  }

  private conversationQueue: Queue<ConversationTaskPayload, unknown, ConversationTaskName> | null = null;
  private registeredContexts = new Map<string, Context>();

  // Factory methods to get interface views
  asArchivist(): Archivist {
    return this;
  }

  asRecorder(): Recorder {
    return this;
  }

  /**
   * Register a context for a conversation
   * Contexts will be notified when new messages are appended
   */
  registerContext(conversationId: string, context: Context): void {
    this.registeredContexts.set(conversationId, context);
  }

  /**
   * Unregister a context for a conversation
   */
  unregisterContext(conversationId: string): void {
    this.registeredContexts.delete(conversationId);
  }

  /**
   * Start or reopen a conversation and record a new request.
   */
  async startRequest(
    token: string,
    model: string,
    opts: { place?: string; clientMeta?: Record<string, unknown>; conversationId?: string; userId?: string; ghost?: boolean } = {}
  ): Promise<{ requestId: string; conversationId: string; isNewConversation: boolean }> {
    const now = Date.now();
    const nowISO = nowIso();

    const providedConversationId = opts.conversationId;
    const existingConversation = providedConversationId ? await this.getConversation(providedConversationId) : null;
    const activeConversationId =
      !providedConversationId && !existingConversation ? await this.findActiveConversationForToken(token, now) : null;

    const finalConversationId =
      existingConversation?.id ?? providedConversationId ?? activeConversationId ?? uniqueId("conv");
    const shouldCreateConversation = !existingConversation && !activeConversationId;
    const isReopeningClosedConversation = existingConversation?.status === "closed";
    const requestId = uniqueId("req");

    const convKey = this.key(`conv:${finalConversationId}`);
    const reqKey = this.key(`req:${requestId}`);

    const multi = this.redis.multi();

    if (shouldCreateConversation) {
      multi.hset(convKey, {
        status: "open",
        startedAt: nowISO,
        lastTouchedAt: nowISO,
        modelSet: JSON.stringify([model]),
        tokenSet: JSON.stringify([token]),
        placeTags: opts.place ? JSON.stringify([opts.place]) : "",
        userId: opts.userId ?? "",
        messageCount: 0,
        toolCallCount: 0,
        requestCount: 1,
        lastRequestAt: nowISO,
        ...(opts.ghost !== undefined ? { ghost: opts.ghost.toString() } : {})
      });
    } else {
      const convUpdates: Record<string, string> = {
        lastTouchedAt: nowISO,
        lastRequestAt: nowISO
      };
      if (isReopeningClosedConversation) {
        convUpdates["status"] = "open";
        convUpdates["closedAt"] = "";
        convUpdates["closeReason"] = "";
        multi.zrem(this.key("convs:closed"), finalConversationId);
        // Allow toggling ghost mode when reopening
        if (opts.ghost !== undefined) {
          convUpdates["ghost"] = opts.ghost.toString();
        }
      } else if (opts.ghost !== undefined) {
        // For active conversations, allow toggling ghost mode
        convUpdates["ghost"] = opts.ghost.toString();
      }
      multi.hset(convKey, convUpdates).hincrby(convKey, "requestCount", 1);
    }

    multi
      .hset(reqKey, {
        conversationId: finalConversationId,
        token,
        startedAt: nowISO,
        modelUsed: model,
        initialPlace: opts.place ?? "",
        userId: opts.userId ?? "",
        clientMeta: opts.clientMeta ? JSON.stringify(opts.clientMeta) : ""
      })
      .zadd(this.key("convs:active"), now, finalConversationId)
      .zadd(this.key(`token:${token}:convs`), now, finalConversationId)
      .zadd(this.key(`conv:${finalConversationId}:requests`), now, requestId)
      .hincrby(this.metricsKey("requests"), "count", 1);

    await multi.exec();

    await this.mergeSetField(convKey, "tokenSet", [token]);
    await this.mergeSetField(convKey, "modelSet", [model]);
    if (opts.place) {
      await this.mergeSetField(convKey, "placeTags", [opts.place]);
    }

    return { requestId, conversationId: finalConversationId, isNewConversation: shouldCreateConversation };
  }

  /**
   * Record request completion latency.
   */
  async completeRequest(requestId: string, latencyMs: number) {
    await this.redis.hset(this.key(`req:${requestId}`), { latencyMs });
  }

  /**
   * Start a turn within a request, tracking model and token metadata.
   */
  async startTurn(
    requestId: string,
    conversationId: string,
    token: string,
    model: string,
    tokensIn?: number
  ): Promise<string> {
    const turnId = uniqueId("turn");
    const now = Date.now();
    const nowISO = nowIso();

    const turnKey = this.key(`turn:${turnId}`);

    const multi = this.redis
      .multi()
      .hset(turnKey, {
        requestId,
        conversationId,
        token,
        model,
        startedAt: nowISO,
        tokensIn: tokensIn ?? 0
      })
      .zadd(this.key(`conv:${conversationId}:turns`), now, turnId)
      .hincrby(this.metricsKey("turns"), "count", 1);

    await multi.exec();
    await this.mergeSetField(this.key(`conv:${conversationId}`), "modelSet", [model]);
    await this.mergeSetField(this.key(`conv:${conversationId}`), "tokenSet", [token]);

    return turnId;
  }

  /**
   * Mark a turn complete with latency, token usage, and optional error type.
   */
  async endTurn(
    turnId: string,
    opts: { status: TurnStatus; tokensIn?: number; tokensOut?: number; latencyMs: number; errorType?: string }
  ) {
    const turnKey = this.key(`turn:${turnId}`);
    const updates: {
      status: TurnStatus;
      latencyMs: number;
      tokensIn?: number;
      tokensOut?: number;
      errorType?: string;
    } = {
      status: opts.status,
      latencyMs: opts.latencyMs
    };
    const { tokensIn, tokensOut, errorType } = opts;
    if (typeof tokensIn === "number") updates.tokensIn = tokensIn;
    if (typeof tokensOut === "number") updates.tokensOut = tokensOut;
    if (errorType) updates.errorType = errorType;
    await this.redis.hset(turnKey, updates);
    if (opts.status === "error") {
      await this.redis.hincrby(this.metricsKey("turns"), "error", 1);
    }
  }

  /**
   * Persist messages for a conversation and update counters.
   */
  async appendMessages(conversationId: string, messages: Array<BaseMessage | MessageRecord>) {
    if (!messages.length) return;
    const convKey = this.key(`conv:${conversationId}`);
    await this.messageLog.append(conversationId, messages, convKey);

    // Notify registered context of new messages
    const context = this.registeredContexts.get(conversationId);
    if (context) {
      // Convert messages to MessageRecord format for context processing
      const messageRecords = messages.map(msg => {
        if (isMessageRecord(msg)) {
          return msg;
        }
        // Convert BaseMessage to MessageRecord
        const record = this.messageLog.serializeMessage(msg);
        return record;
      });

      // Process each message in the context
      for (const record of messageRecords) {
        context.processMessage(record);
      }
    }
  }

  async recordToolResult(turnId: string, toolName: string, result: ToolResult) {
    const hashKey = this.metricsKey(`tool:${toolName}`);
    const multi = this.redis.multi();
    multi.hincrby(hashKey, result.ok ? "ok" : "fail", 1);
    multi.hincrbyfloat(hashKey, "sum_ms", result.latencyMs);
    multi.hincrbyfloat(hashKey, "sum_sqr_ms", result.latencyMs * result.latencyMs);
    if (!result.ok && result.errorType) {
      multi.hincrby(hashKey, `error:${result.errorType}`, 1);
      await this.redis.hset(this.key(`turn:${turnId}`), { errorType: result.errorType });
    }
    await multi.exec();
  }

  async recordOpenRouterResult(turnId: string, model: string, result: OpenRouterResult) {
    const hashKey = this.metricsKey(`model:${model}:openrouter`);
    const latencyKey = this.metricsKey(`model:${model}:latency`);
    const tokensKey = this.metricsKey(`model:${model}:tokens`);
    const turnKey = this.key(`turn:${turnId}`);

    const multi = this.redis.multi();
    multi.hincrby(hashKey, result.ok ? "ok" : "fail", 1);
    if (!result.ok && result.errorType) {
      multi.hincrby(hashKey, `error:${result.errorType}`, 1);
    }

    if (typeof result.latencyMs === "number") {
      multi.hincrbyfloat(latencyKey, "sum_ms", result.latencyMs);
      multi.hincrbyfloat(latencyKey, "sum_sqr_ms", result.latencyMs * result.latencyMs);
      multi.hincrby(latencyKey, "count", 1);
    }

    const turnUpdates: { latencyMs?: number; tokensIn?: number; tokensOut?: number; errorType?: string } = {};
    if (typeof result.latencyMs === "number") {
      turnUpdates.latencyMs = result.latencyMs;
    }
    if (typeof result.tokensIn === "number") {
      multi.hincrbyfloat(tokensKey, "in", result.tokensIn);
      multi.hincrbyfloat(turnKey, "tokensIn", result.tokensIn);
      turnUpdates.tokensIn = result.tokensIn;
    }
    if (typeof result.tokensOut === "number") {
      multi.hincrbyfloat(tokensKey, "out", result.tokensOut);
      multi.hincrbyfloat(turnKey, "tokensOut", result.tokensOut);
      turnUpdates.tokensOut = result.tokensOut;
    }
    if (!result.ok && result.errorType) {
      turnUpdates.errorType = result.errorType;
    }

    if (Object.keys(turnUpdates).length) {
      multi.hset(turnKey, turnUpdates as Record<string, number | string>);
    }
    await multi.exec();
  }

  async recordLLMCall(
    conversationId: string,
    details: {
      model: string;
      context: Array<BaseMessage | MessageRecord>;
      result?: BaseMessage | MessageRecord | Array<BaseMessage | MessageRecord>;
      startedAt?: string;
      latencyMs?: number;
      toolLatencyMs?: number;
      tokens?: { in?: number; out?: number; cacheRead?: number; cacheWrite?: number; cached?: boolean };
      requestId?: string;
      turnId?: string;
      stage?: string;
      contextLimit?: number;
      contentPreviewChars?: number;
      tools?: unknown;
    }
  ) {
    const previewLimit = Number.isFinite(details.contentPreviewChars)
      ? Number(details.contentPreviewChars)
      : null;
    const maxContext = details.contextLimit ?? 12;

    const trimSnapshot = (snap: ReturnType<typeof snapshotMessageForTrace>) => {
      if (previewLimit === null) return snap;
      if (snap.content && typeof snap.content === "string" && snap.content.length > previewLimit) {
        return { ...snap, content: `${snap.content.slice(0, previewLimit)}…` };
      }
      return snap;
    };

    const contextSnapshots = details.context.map((msg) => snapshotMessageForTrace(msg)).map(trimSnapshot);
    const resultMessages = Array.isArray(details.result)
      ? details.result
      : details.result
        ? [details.result]
        : [];
    const resultSnapshots = resultMessages.map((msg) => snapshotMessageForTrace(msg)).map(trimSnapshot);

    const traceContent: Record<string, unknown> = {
      type: "llm_call",
      model: details.model,
      at: details.startedAt ?? nowIso(),
      stage: details.stage,
      context: contextSnapshots.slice(-maxContext)
    };
    if (resultSnapshots.length) traceContent["result"] = resultSnapshots;
    if (typeof details.latencyMs === "number") traceContent["latencyMs"] = details.latencyMs;
    if (typeof details.toolLatencyMs === "number") traceContent["toolLatencyMs"] = details.toolLatencyMs;
    if (details.tokens) traceContent["tokens"] = details.tokens;
    if (details.requestId) traceContent["requestId"] = details.requestId;
    if (details.turnId) traceContent["turnId"] = details.turnId;
    if (details.tools) traceContent["tools"] = details.tools;

    const message: MessageRecord = {
      id: uniqueId("msg"),
      role: "system",
      name: details.stage ? `llm_call.${details.stage}` : "llm_call",
      content: traceContent,
      createdAt: nowIso(),
      metadata: {
        traceType: "llm_call",
        model: details.model,
        ...(details.stage ? { traceStage: details.stage } : {}),
        ...(details.tokens ? { tokens: details.tokens } : {}),
        ...(typeof details.latencyMs === "number" ? { latencyMs: details.latencyMs } : {}),
        ...(typeof details.toolLatencyMs === "number" ? { toolLatencyMs: details.toolLatencyMs } : {}),
        ...(details.requestId ? { requestId: details.requestId } : {}),
        ...(details.turnId ? { turnId: details.turnId } : {})
      }
    };

    await this.appendMessages(conversationId, [message]);
  }

  // Recorder interface implementation
  async recordMessage(conversationId: string, message: BaseMessage | MessageRecord): Promise<void> {
    await this.appendMessages(conversationId, [message]);
  }

  async syncHistory(conversationId: string, messages: BaseMessage[]): Promise<void> {
    const convKey = this.key(`conv:${conversationId}`);
    await this.messageLog.sync(conversationId, messages, convKey);
  }

  async recordLLMCallStart(
    conversationId: string,
    details: {
      messageId: string;
      model: string;
      context: BaseMessage[];
      requestId?: string;
      turnId?: string;
      stage?: string;
      tools?: unknown;
    }
  ): Promise<void> {
    const traceContent: Record<string, unknown> = {
      type: "llm_call",
      model: details.model,
      at: nowIso(),
      stage: details.stage,
      context: details.context.map((msg) => snapshotMessageForTrace(msg)).slice(-12)
    };
    if (details.requestId) traceContent["requestId"] = details.requestId;
    if (details.turnId) traceContent["turnId"] = details.turnId;
    if (details.tools) traceContent["tools"] = details.tools;

    const message: MessageRecord = {
      id: uniqueId("msg"),
      role: "system",
      name: details.stage ? `llm_call.${details.stage}` : "llm_call",
      content: traceContent,
      createdAt: nowIso(),
      metadata: {
        traceType: "llm_call",
        model: details.model,
        messageId: details.messageId,
        ...(details.stage ? { traceStage: details.stage } : {}),
        ...(details.requestId ? { requestId: details.requestId } : {}),
        ...(details.turnId ? { turnId: details.turnId } : {})
      }
    };

    await this.appendMessages(conversationId, [message]);
  }

  async recordLLMCallComplete(
    conversationId: string,
    details: {
      messageId: string;
      result: BaseMessage | MessageRecord;
      latencyMs?: number;
      tokens?: { in?: number; out?: number };
    }
  ): Promise<void> {
    const resultMessage = Array.isArray(details.result) ? details.result[0] : details.result;
    const resultSnapshot = snapshotMessageForTrace(resultMessage);

    // Find the original LLM call to update it?
    // Actually, following the plan, we just record another message or some trace.
    // The previous recordLLMCall did it all at once.
    // For now, let's record completion as a separate trace message or update.
    // Let's stick to recording a separate "completion" trace for now as it's simpler in Redis.
    const traceContent: Record<string, unknown> = {
      type: "llm_call_complete",
      at: nowIso(),
      result: [resultSnapshot]
    };
    if (details.latencyMs) traceContent["latencyMs"] = details.latencyMs;
    if (details.tokens) traceContent["tokens"] = details.tokens;

    const message: MessageRecord = {
      id: uniqueId("msg"),
      role: "system",
      name: "llm_call_complete",
      content: traceContent,
      createdAt: nowIso(),
      metadata: {
        traceType: "llm_call_complete",
        messageId: details.messageId,
        ...(details.tokens ? { tokens: details.tokens } : {}),
        ...(typeof details.latencyMs === "number" ? { latencyMs: details.latencyMs } : {})
      }
    };

    await this.appendMessages(conversationId, [message]);
  }

  async recordToolCallStart(
    conversationId: string,
    details: {
      toolCallId: string;
      toolName: string;
      arguments: string;
      messageId?: string;
    }
  ): Promise<void> {
    const traceContent = {
      type: "tool_call",
      toolCallId: details.toolCallId,
      toolName: details.toolName,
      arguments: details.arguments,
      at: nowIso()
    };

    const message: MessageRecord = {
      id: uniqueId("msg"),
      role: "system",
      name: "tool_call",
      content: traceContent,
      createdAt: nowIso(),
      metadata: {
        traceType: "tool_call",
        toolCallId: details.toolCallId,
        messageId: details.messageId
      }
    };

    await this.appendMessages(conversationId, [message]);
  }

  async recordToolCallComplete(
    conversationId: string,
    details: {
      toolCallId: string;
      result: string;
      latencyMs?: number;
    }
  ): Promise<void> {
    const traceContent = {
      type: "tool_call_complete",
      toolCallId: details.toolCallId,
      result: details.result,
      latencyMs: details.latencyMs,
      at: nowIso()
    };

    const message: MessageRecord = {
      id: uniqueId("msg"),
      role: "system",
      name: "tool_call_complete",
      content: traceContent,
      createdAt: nowIso(),
      metadata: {
        traceType: "tool_call_complete",
        toolCallId: details.toolCallId,
        ...(typeof details.latencyMs === "number" ? { latencyMs: details.latencyMs } : {})
      }
    };

    await this.appendMessages(conversationId, [message]);
  }

  async getFullConversation(conversationId: string): Promise<{ records: MessageRecord[]; messages: OpenAIMessage[] }> {
    const records = await this.getMessages(conversationId);
    const messages = records
      .map((record) => messageRecordToOpenAI(record))
      .filter((m): m is OpenAIMessage => Boolean(m));
    return { records, messages };
  }

  async recordRateLimit(token: string, model: string, reason?: string) {
    const multi = this.redis.multi();
    multi.hincrby(this.metricsKey(`token:${token}:ratelimit`), "denied", 1);
    const modelKey = this.metricsKey(`model:${model}:openrouter`);
    multi.hincrby(modelKey, "fail", 1);
    if (reason) multi.hincrby(modelKey, `error:${reason}`, 1);
    await multi.exec();
  }

  async closeConversation(conversationId: string, reason: string = "idle") {
    const convKey = this.key(`conv:${conversationId}`);
    const convo = await this.redis.hgetall(convKey);
    if (!convo || Object.keys(convo).length === 0) {
      this.log.debug({ event: "close.conversation.not_found", conversationId });
      return;
    }
    const status = convo["status"];
    if (status === "closed") {
      this.log.debug({ event: "close.conversation.already_closed", conversationId });
      return;
    }

    const isGhost = convo["ghost"] === "true";

    this.log.info({
      event: "close.conversation.start",
      conversationId,
      reason
    });

    const closedAt = nowIso();
    const now = Date.now();

    const updates: Record<string, string> = {
      status: "closed",
      closedAt,
      closeReason: reason,
      lastTouchedAt: closedAt
    };

    const multi = this.redis
      .multi()
      .hset(convKey, updates)
      .zrem(this.key("convs:active"), conversationId)
      .zadd(this.key("convs:closed"), now, conversationId);

    await multi.exec();

    this.log.info({
      event: "close.conversation.updated_metadata",
      conversationId
    });

    const enqueued = isGhost ? false : await this.enqueueConversationTasks(conversationId);
    if (enqueued) {
      await this.updateIndexingStatus(conversationId, "queued", undefined, 1);
      this.log.info({
        event: "close.conversation.tasks_enqueued",
        conversationId,
        status: "queued"
      });
    } else if (isGhost) {
      this.log.info({
        event: "close.conversation.ghost_skipped_indexing",
        conversationId,
        reason: "ghost_conversation"
      });
    } else if (this.summarizer) {
      this.log.info({
        event: "close.conversation.fallback_summary",
        conversationId
      });
      try {
        const messages = await this.getMessages(conversationId);
        const summary = await this.summarizer.summarize(conversationId, messages);
        await this.updateConversationSummary(conversationId, summary);
        await this.updateIndexingStatus(conversationId, "indexed");
        this.log.info({
          event: "close.conversation.summary_completed",
          conversationId
        });
      } catch (err) {
        await this.redis.hset(convKey, {
          closeReason: `${reason}; summary_error:${formatError(err)}`
        });
        await this.updateIndexingStatus(conversationId, "failed", formatError(err), 1);
        this.log.warn({
          event: "close.conversation.summary_failed",
          conversationId,
          error: formatError(err)
        });
      }
    } else {
      this.log.info({
        event: "close.conversation.no_tasks",
        conversationId,
        reason: "queue_disabled_or_no_summarizer"
      });
    }
  }

  async updateConversationSummary(conversationId: string, summary: SummaryResult) {
    const convKey = this.key(`conv:${conversationId}`);
    const updates: Record<string, string> = {};
    if (summary.summary) updates["summary"] = summary.summary;
    if (summary.tags) updates["tags"] = JSON.stringify(summary.tags);
    if (summary.keywords) updates["keywords"] = JSON.stringify(summary.keywords);
    if (summary.places) updates["placeTags"] = JSON.stringify(summary.places);
    if (summary.flags) updates["flags"] = JSON.stringify(summary.flags);
    if (summary.summaryError) {
      const existing = (await this.redis.hget(convKey, "closeReason")) ?? "";
      const suffix = `summary_error:${summary.summaryError}`;
      updates["closeReason"] = existing ? `${existing}; ${suffix}` : suffix;
    }
    if (Object.keys(updates).length === 0) return;
    await this.redis.hset(convKey, updates);
  }

  async updateConversationFlags(conversationId: string, flags: SummaryFlags) {
    const convKey = this.key(`conv:${conversationId}`);
    const existingRaw = await this.redis.hget(convKey, "flags");
    let existing: SummaryFlags = {};
    try {
      existing = existingRaw ? (JSON.parse(existingRaw) as SummaryFlags) : {};
    } catch {
      existing = {};
    }
    const next: SummaryFlags = { ...existing, ...flags };
    await this.redis.hset(convKey, { flags: JSON.stringify(next) });
  }

  async updateIndexingStatus(
    conversationId: string,
    status: ConversationIndexingStatus,
    error?: string,
    attempts?: number
  ) {
    const convKey = this.key(`conv:${conversationId}`);
    const updates: Record<string, string> = { indexingStatus: status };
    if (error !== undefined) {
      updates["indexingError"] = error;
    }
    if (attempts !== undefined) {
      updates["indexingAttempts"] = String(attempts);
    }
    await this.redis.hset(convKey, updates);
  }

  private async ensureConversationQueue(): Promise<Queue<ConversationTaskPayload, unknown, ConversationTaskName> | null> {
    if (this.tasksDisabled) return null;
    if (this.conversationQueue) return this.conversationQueue;
    try {
      this.conversationQueue = createConversationQueue();
      this.log.info({ event: "queue.ensure", queue: conversationQueueName });
      return this.conversationQueue;
    } catch (err) {
      this.log.warn({ event: "queue.ensure.failed", err: toErrorObject(err) });
      return null;
    }
  }

  async retryIndexing(conversationId: string): Promise<boolean> {
    const queue = await this.ensureConversationQueue();
    if (!queue) return false;

    try {
      const existingConversation = await this.getConversation(conversationId);
      const currentAttempts = existingConversation?.indexingAttempts ?? 0;
      const nextAttempts = currentAttempts + 1;

      this.log.info({
        event: "indexing.retry.start",
        conversationId,
        currentAttempts,
        nextAttempts
      });

      // Remove any existing jobs for this conversation individually
      const jobIds = [
        buildConversationJobId(CONVERSATION_TASKS.index, conversationId),
        buildConversationJobId(CONVERSATION_TASKS.summary, conversationId),
        buildConversationJobId(CONVERSATION_TASKS.flag, conversationId)
      ];

      // Remove jobs individually using getJob and remove
      const removeResults = await Promise.all(
        jobIds.map(async (jobId) => {
          try {
            const job = await queue.getJob(jobId);
            if (job) {
              this.log.debug({ event: "indexing.job.found", conversationId, jobId, jobName: job.name });
              await job.remove();
              return { jobId, success: true };
            } else {
              this.log.debug({ event: "indexing.job.not_found", conversationId, jobId });
              return { jobId, success: false, reason: "not_found" };
            }
          } catch (removeErr) {
            // Ignore errors if job doesn't exist
            this.log.debug({ event: "indexing.job.remove.failed", conversationId, jobId, err: toErrorObject(removeErr) });
            return { jobId, success: false, reason: "error", error: toErrorObject(removeErr) };
          }
        })
      );

      this.log.info({
        event: "indexing.jobs.removed",
        conversationId,
        results: removeResults
      });

      // Only enqueue the index task for retry - remove other conversation processes
      const jobs = await Promise.all([
        queue.add(CONVERSATION_TASKS.index, { conversationId }, { jobId: buildConversationJobId(CONVERSATION_TASKS.index, conversationId) })
      ]);

      await this.updateIndexingStatus(conversationId, "queued", undefined, nextAttempts);

      this.log.info({
        event: "indexing.retry",
        conversationId,
        attempts: nextAttempts,
        jobs: jobs.map((job) => ({ id: job.id, name: job.name })),
        note: "Only index task queued for retry - other processes removed"
      });

      return true;
    } catch (err) {
      this.log.warn({ event: "indexing.retry.failed", conversationId, err: toErrorObject(err) });
      await this.updateIndexingStatus(conversationId, "failed", formatError(err));
      return false;
    }
  }

  async cancelIndexing(conversationId: string): Promise<boolean> {
    const queue = await this.ensureConversationQueue();
    if (!queue) return false;

    try {
      // Remove all jobs for this conversation individually
      const jobIds = [
        buildConversationJobId(CONVERSATION_TASKS.index, conversationId),
        buildConversationJobId(CONVERSATION_TASKS.summary, conversationId),
        buildConversationJobId(CONVERSATION_TASKS.flag, conversationId)
      ];

      // Remove jobs individually using getJob and remove
      const removeResults = await Promise.all(
        jobIds.map(async (jobId) => {
          try {
            const job = await queue.getJob(jobId);
            if (job) {
              this.log.debug({ event: "indexing.job.found", conversationId, jobId, jobName: job.name });
              await job.remove();
              return 1 as number;
            } else {
              this.log.debug({ event: "indexing.job.not_found", conversationId, jobId });
              return 0 as number;
            }
          } catch (removeErr) {
            // Ignore errors if job doesn't exist
            this.log.debug({ event: "indexing.job.remove.failed", conversationId, jobId, err: toErrorObject(removeErr) });
            return 0 as number;
          }
        })
      );

      const removedCount = removeResults.reduce((sum: number, count: number) => sum + count, 0);

      this.log.info({
        event: "indexing.jobs.removed",
        conversationId,
        removedCount,
        totalJobs: jobIds.length
      });

      await this.updateIndexingStatus(conversationId, "none");

      this.log.info({
        event: "indexing.cancel",
        conversationId,
        removedJobs: removedCount
      });

      return true;
    } catch (err) {
      this.log.warn({ event: "indexing.cancel.failed", conversationId, err: toErrorObject(err) });
      return false;
    }
  }

  private async enqueueConversationTasks(conversationId: string): Promise<boolean> {
    const queue = await this.ensureConversationQueue();
    if (!queue) return false;

    // Check if conversation is ghost - skip indexing but allow summary and flag tasks
    const conversation = await this.getConversation(conversationId);
    const isGhost = conversation?.ghost === true;

    try {
      this.log.info({
        event: "queue.enqueue.start",
        conversationId,
        isGhost
      });

      const jobPromises = [
        queue.add(CONVERSATION_TASKS.summary, { conversationId }, { jobId: buildConversationJobId(CONVERSATION_TASKS.summary, conversationId) }),
        queue.add(CONVERSATION_TASKS.flag, { conversationId }, { jobId: buildConversationJobId(CONVERSATION_TASKS.flag, conversationId) })
      ];

      // Only add index task if not ghost
      if (!isGhost) {
        jobPromises.unshift(
          queue.add(CONVERSATION_TASKS.index, { conversationId }, { jobId: buildConversationJobId(CONVERSATION_TASKS.index, conversationId) })
        );
      }

      const jobs = await Promise.all(jobPromises);

      this.log.info({
        event: "queue.enqueue",
        conversationId,
        jobs: jobs.map((job) => ({ id: job.id, name: job.name }))
      });
      return true;
    } catch (err) {
      this.log.warn({ event: "queue.enqueue.failed", conversationId, err: toErrorObject(err) });
      return false;
    }
  }

  async closeIfIdle(now: number = Date.now()) {
    const cutoff = now - this.idleMs;
    const idleIds = await this.redis.zrangebyscore(this.key("convs:active"), 0, cutoff);
    const results = await Promise.allSettled(idleIds.map((id) => this.closeConversation(id, "idle")));
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      // Log failures for monitoring
      this.log.warn({ event: "conversations.close.idle_failed", failures: failures.length });
    }
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    const convKey = this.key(`conv:${conversationId}`);
    const exists = await this.redis.exists(convKey);
    if (!exists) return false;

    const rawTokenSet = await this.redis.hget(convKey, "tokenSet");
    const tokenSet = parseJsonArray(rawTokenSet ?? undefined) ?? [];
    const [requestIds, turnIds] = await Promise.all([
      this.redis.zrevrange(this.key(`conv:${conversationId}:requests`), 0, -1),
      this.redis.zrevrange(this.key(`conv:${conversationId}:turns`), 0, -1)
    ]);

    const multi = this.redis
      .multi()
      .del(convKey)
      .del(this.key(`conv:${conversationId}:msgs`))
      .del(this.key(`conv:${conversationId}:requests`))
      .del(this.key(`conv:${conversationId}:turns`))
      .zrem(this.key("convs:active"), conversationId)
      .zrem(this.key("convs:closed"), conversationId);

    tokenSet.forEach((token) => {
      multi.zrem(this.key(`token:${token}:convs`), conversationId);
    });

    requestIds.forEach((reqId) => multi.del(this.key(`req:${reqId}`)));
    turnIds.forEach((turnId) => multi.del(this.key(`turn:${turnId}`)));

    await multi.exec();
    return true;
  }

  async getStatus(): Promise<RecordKeeperStatus> {
    const [activeIds, closedCount, requestMetrics, turnMetrics, mostRecentClosed] = await Promise.all([
      this.redis.zrevrangebyscore(this.key("convs:active"), Number.MAX_SAFE_INTEGER, 0),
      this.redis.zcard(this.key("convs:closed")),
      this.redis.hgetall(this.metricsKey("requests")),
      this.redis.hgetall(this.metricsKey("turns")),
      this.redis.zrevrangebyscore(this.key("convs:closed"), Number.MAX_SAFE_INTEGER, 0, "LIMIT", 0, 1)
    ]);

    const tokensActive = await this.countActiveTokens(activeIds);

    let lastActivityAt: string | undefined;
    const mostRecentActiveId = activeIds[0];
    if (mostRecentActiveId) {
      const lastTouched = await this.redis.hget(this.key(`conv:${mostRecentActiveId}`), "lastTouchedAt");
      if (lastTouched) {
        lastActivityAt = lastTouched;
      }
    } else if (mostRecentClosed[0]) {
      const closedTouch =
        (await this.redis.hget(this.key(`conv:${mostRecentClosed[0]}`), "lastTouchedAt")) ??
        (await this.redis.hget(this.key(`conv:${mostRecentClosed[0]}`), "closedAt"));
      if (closedTouch) {
        lastActivityAt = closedTouch;
      }
    }

    return {
      namespace: this.namespace,
      metricsNamespace: this.metricsNamespace,
      idleMs: this.idleMs,
      summarizerEnabled: Boolean(this.summarizer),
      activeConversations: activeIds.length,
      closedConversations: closedCount,
      totalRequests: parseInt(requestMetrics["count"] ?? "0", 10),
      totalTurns: parseInt(turnMetrics["count"] ?? "0", 10),
      errorTurns: parseInt(turnMetrics["error"] ?? "0", 10),
      tokensActive,
      ...(lastActivityAt ? { lastActivityAt } : {})
    };
  }

  async recallConversation(query: RecallQuery): Promise<RecallConversation[]> {
    if (query.conversationId) {
      const conversation = await this.getConversation(query.conversationId);
      if (!conversation) return [];
      const { messageLimit } = query;
      const messages = query.includeMessages ? await this.getMessages(query.conversationId, { ...(messageLimit ? { limit: messageLimit } : {}) }) : undefined;
      const payload: RecallConversation = { conversation };
      if (messages) payload.messages = messages;
      return [payload];
    }

    const since = query.timeRange?.since ?? 0;
    const until = query.timeRange?.until ?? Date.now();
    const limit = query.limit ?? 10;

    let candidateIds: string[] = [];
    if (query.token) {
      candidateIds = await this.redis.zrevrangebyscore(
        this.key(`token:${query.token}:convs`),
        until,
        since,
        "LIMIT",
        0,
        limit
      );
    } else {
      candidateIds = await this.redis.zrevrangebyscore(this.key("convs:closed"), until, since, "LIMIT", 0, limit);
    }

    const results: RecallConversation[] = [];
    for (const id of candidateIds) {
      const conversation = await this.getConversation(id);
      if (!conversation) continue;

      if (query.place && conversation.placeTags && !conversation.placeTags.includes(query.place)) {
        continue;
      }

      if (query.keywords && query.keywords.length) {
        const hasKeyword = conversation.keywords?.some((kw) =>
          query.keywords?.some((target) => kw.toLowerCase().includes(target.toLowerCase()))
        );
        if (!hasKeyword) continue;
      }

      const { messageLimit } = query;
      const messages = query.includeMessages ? await this.getMessages(id, { ...(messageLimit ? { limit: messageLimit } : {}) }) : undefined;
      const payload: RecallConversation = { conversation };
      if (messages) payload.messages = messages;
      results.push(payload);
      if (results.length >= limit) break;
    }

    return results;
  }

  async reopenConversation(conversationId: string, token: string): Promise<Conversation | null> {
    const convKey = this.key(`conv:${conversationId}`);
    const now = Date.now();
    const nowISO = nowIso();
    const exists = await this.redis.exists(convKey);
    if (!exists) return null;

    await this.redis
      .multi()
      .hset(convKey, { status: "open", lastTouchedAt: nowISO })
      .zadd(this.key("convs:active"), now, conversationId)
      .zadd(this.key(`token:${token}:convs`), now, conversationId)
      .exec();
    await this.mergeSetField(convKey, "tokenSet", [token]);
    const convo = await this.getConversation(conversationId);
    if (convo && (!convo.tokenSet || !convo.tokenSet.includes(token))) {
      const next = JSON.stringify([...(convo.tokenSet ?? []), token]);
      await this.redis.hset(convKey, { tokenSet: next });
      return { ...convo, tokenSet: [...(convo.tokenSet ?? []), token] };
    }
    return convo;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const data = await this.redis.hgetall(this.key(`conv:${id}`));
    if (!data) return null;
    const status = data["status"];
    const startedAt = data["startedAt"];
    const lastTouchedAt = data["lastTouchedAt"];
    if (!status || !startedAt || !lastTouchedAt) return null;
    const conversation: Conversation = {
      id,
      status: status as ConversationStatus,
      startedAt,
      lastTouchedAt
    };
    const closedAt = data["closedAt"];
    const summaryField = data["summary"];
    const tags = parseJsonArray(data["tags"]);
    const flags = data["flags"] ? (JSON.parse(data["flags"]) as Conversation["flags"]) : undefined;
    const modelSet = parseJsonArray(data["modelSet"]);
    const tokenSet = parseJsonArray(data["tokenSet"]);
    const placeTags = parseJsonArray(data["placeTags"]);
    const keywords = parseJsonArray(data["keywords"]);
    const closeReason = data["closeReason"];

    if (closedAt) conversation.closedAt = closedAt;
    if (summaryField) conversation.summary = summaryField;
    if (tags) conversation.tags = tags;
    if (flags) conversation.flags = flags;
    if (modelSet) conversation.modelSet = modelSet;
    if (tokenSet) conversation.tokenSet = tokenSet;
    if (placeTags) conversation.placeTags = placeTags;
    if (keywords) conversation.keywords = keywords;
    if (closeReason) conversation.closeReason = closeReason;
    if (data["messageCount"]) {
      const parsed = toNumber(data["messageCount"]);
      if (typeof parsed === "number") {
        conversation.messageCount = parsed;
      }
    }
    if (data["toolCallCount"]) {
      const parsed = toNumber(data["toolCallCount"]);
      if (typeof parsed === "number") {
        conversation.toolCallCount = parsed;
      }
    }
    if (data["userAssistantCount"]) {
      const parsed = toNumber(data["userAssistantCount"]);
      if (typeof parsed === "number") {
        conversation.userAssistantCount = parsed;
      }
    }
    if (data["maxTurnLatencyMs"]) {
      const parsed = toNumber(data["maxTurnLatencyMs"]);
      if (typeof parsed === "number") {
        conversation.maxTurnLatencyMs = parsed;
      }
    }
    if (data["requestCount"]) {
      const parsed = toNumber(data["requestCount"]);
      if (typeof parsed === "number") {
        conversation.requestCount = parsed;
      }
    }
    if (data["errorCount"]) {
      const parsed = toNumber(data["errorCount"]);
      if (typeof parsed === "number") {
        conversation.errorCount = parsed;
        conversation.hasErrors = parsed > 0;
      }
    }
    if (conversation.hasErrors === undefined && conversation.errorCount === undefined) {
      conversation.hasErrors = false;
    }
    if (data["lastRequestAt"]) conversation.lastRequestAt = data["lastRequestAt"];

    // Indexing status fields
    if (data["indexingStatus"]) {
      conversation.indexingStatus = data["indexingStatus"] as ConversationIndexingStatus;
    }
    if (data["indexingError"]) {
      conversation.indexingError = data["indexingError"];
    }
    if (data["indexingAttempts"]) {
      const parsedAttempts = toNumber(data["indexingAttempts"]);
      if (typeof parsedAttempts === "number") {
        conversation.indexingAttempts = parsedAttempts;
      }
    }

    // Ghost mode field
    if (data["ghost"]) {
      conversation.ghost = data["ghost"] === "true";
    }

    return conversation;
  }

  async getMessages(
    conversationId: string,
    options?: {
      limit?: number;
      role?: "user" | "assistant" | "system" | "tool";
      since?: string;
    }
  ): Promise<MessageRecord[]> {
    let messages = await this.messageLog.getMessages(conversationId, options?.limit);

    if (options?.role) {
      messages = messages.filter((m) => m.role === options.role);
    }

    if (options?.since) {
      const sinceTime = new Date(options.since).getTime();
      messages = messages.filter((m) => new Date(m.createdAt).getTime() >= sinceTime);
    }

    return messages;
  }

  private async getUserAssistantCount(conversationId: string): Promise<number> {
    return this.messageLog.countUserAssistant(conversationId);
  }

  private async getMaxTurnLatency(conversationId: string): Promise<number | undefined> {
    const turnIds = await this.redis.zrevrange(this.key(`conv:${conversationId}:turns`), 0, -1);
    if (!turnIds.length) return undefined;
    const multi = this.redis.multi();
    for (const turnId of turnIds) {
      multi.hget(this.key(`turn:${turnId}`), "latencyMs");
    }
    const results = await multi.exec();
    if (!results) return undefined;
    let max = -Infinity;
    for (const [, value] of results) {
      const parsed = typeof value === "string" ? Number(value) : NaN;
      if (Number.isFinite(parsed)) {
        max = Math.max(max, parsed);
      }
    }
    return max === -Infinity ? undefined : max;
  }

  async listConversations(opts: { limit?: number; includeOpen?: boolean; includeClosed?: boolean } = {}): Promise<
    ConversationWithStats[]
  > {
    const limit = opts.limit && opts.limit > 0 ? opts.limit : 50;
    const includeOpen = opts.includeOpen ?? true;
    const includeClosed = opts.includeClosed ?? true;

    const ids: string[] = [];
    if (includeOpen) {
      const openIds = await this.redis.zrevrange(this.key("convs:active"), 0, Math.max(limit - 1, 0));
      ids.push(...openIds);
    }

    if (includeClosed && ids.length < limit) {
      const remaining = limit - ids.length;
      const closedIds = await this.redis.zrevrange(this.key("convs:closed"), 0, Math.max(remaining - 1, 0));
      ids.push(...closedIds);
    }

    const uniqueIds = Array.from(new Set(ids));
    const conversations: ConversationWithStats[] = [];
    for (const id of uniqueIds) {
      const conversation = await this.getConversation(id);
      if (!conversation) {
        // Clean up stale references so counts stay accurate.
        await this.redis
          .multi()
          .zrem(this.key("convs:active"), id)
          .zrem(this.key("convs:closed"), id)
          .exec();
        continue;
      }
      const withStats = await this.conversationWithStats(conversation);
      conversations.push(withStats);
    }

    return conversations;
  }

  async getConversationWithMessages(
    conversationId: string,
    messageLimit?: number
  ): Promise<{ conversation: ConversationWithStats; messages: MessageRecord[] } | null> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) return null;
    const [messages, withStats] = await Promise.all([
      this.getMessages(conversationId, { ...(messageLimit ? { limit: messageLimit } : {}) }),
      this.conversationWithStats(conversation)
    ]);
    return { conversation: withStats, messages };
  }

  async countConversations(): Promise<{ active: number; closed: number; total: number }> {
    const [active, closed] = await Promise.all([
      this.redis.zcard(this.key("convs:active")),
      this.redis.zcard(this.key("convs:closed"))
    ]);
    return { active, closed, total: active + closed };
  }

  private async conversationWithStats(conversation: Conversation): Promise<ConversationWithStats> {
    const [messageCount, userAssistantCount, toolCallCount, requestCount, lastRequestAt, maxTurnLatencyMs] =
      await Promise.all([
        typeof conversation.messageCount === "number" ? conversation.messageCount : this.getMessageCount(conversation.id),
        typeof conversation.userAssistantCount === "number"
          ? conversation.userAssistantCount
          : this.getUserAssistantCount(conversation.id),
        typeof conversation.toolCallCount === "number" ? conversation.toolCallCount : this.countToolCalls(conversation.id),
        typeof conversation.requestCount === "number"
          ? conversation.requestCount
          : this.redis.zcard(this.key(`conv:${conversation.id}:requests`)),
        conversation.lastRequestAt ?? this.getLastRequestAt(conversation.id),
        typeof conversation.maxTurnLatencyMs === "number" ? conversation.maxTurnLatencyMs : this.getMaxTurnLatency(conversation.id)
      ]);

    return {
      ...conversation,
      messageCount,
      userAssistantCount,
      toolCallCount,
      ...(typeof maxTurnLatencyMs === "number" ? { maxTurnLatencyMs } : {}),
      ...(requestCount ? { requestCount } : {}),
      ...(lastRequestAt ? { lastRequestAt } : {}),
      ...(typeof conversation.errorCount === "number" ? { errorCount: conversation.errorCount } : {}),
      hasErrors: conversation.hasErrors ?? (conversation.errorCount ?? 0) > 0
    };
  }

  private async getMessageCount(conversationId: string): Promise<number> {
    const listKey = this.key(`conv:${conversationId}:msgs`);
    const count = await this.redis.llen(listKey);
    return count;
  }

  private async getLastRequestAt(conversationId: string): Promise<string | undefined> {
    const requestKey = this.key(`conv:${conversationId}:requests`);
    const latest = await this.redis.zrevrange(requestKey, 0, 0, "WITHSCORES");
    if (latest.length === 2) {
      const score = Number(latest[1]);
      if (Number.isFinite(score)) {
        return new Date(score).toISOString();
      }
    }
    return undefined;
  }

  private async countToolCalls(conversationId: string): Promise<number> {
    return this.messageLog.countToolCalls(conversationId);
  }

  private async findActiveConversationForToken(token: string, now: number): Promise<string | null> {
    const cutoff = now - this.idleMs;
    const ids = await this.redis.zrevrangebyscore(
      this.key(`token:${token}:convs`),
      now,
      cutoff,
      "LIMIT",
      0,
      1
    );
    if (!ids.length) return null;
    const candidate = ids[0];
    if (!candidate) return null;
    const conversation = await this.redis.hgetall(this.key(`conv:${candidate}`));
    if (!conversation || conversation["status"] !== "open") return null;
    return candidate;
  }

  private key(suffix: string) {
    return `${this.namespace}:${suffix}`;
  }

  private metricsKey(suffix: string) {
    return `${this.metricsNamespace}:${suffix}`;
  }

  private async mergeSetField(convKey: string, field: string, values: string[]) {
    const existing = await this.redis.hget(convKey, field);
    const set = new Set<string>();
    parseJsonArray(existing ?? undefined)?.forEach((v) => set.add(v));
    values.filter(Boolean).forEach((v) => set.add(v));
    await this.redis.hset(convKey, field, JSON.stringify(Array.from(set)));
  }

  private async countActiveTokens(conversationIds: string[]): Promise<number> {
    if (!conversationIds.length) return 0;
    const tokens = new Set<string>();
    for (const id of conversationIds) {
      const tokenSet = await this.redis.hget(this.key(`conv:${id}`), "tokenSet");
      parseJsonArray(tokenSet ?? undefined)?.forEach((token) => tokens.add(token));
    }
    return tokens.size;
  }
}

