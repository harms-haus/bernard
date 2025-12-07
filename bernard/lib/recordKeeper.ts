import crypto from "node:crypto";
import type { BaseMessage } from "@langchain/core/messages";
import type Redis from "ioredis";

import type { ConversationSummaryService, SummaryResult } from "./conversationSummary";

export type ConversationStatus = "open" | "closed";

export type MessageRecord = {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string | Record<string, unknown> | Array<Record<string, unknown>>;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; name?: string; arguments?: string }>;
  createdAt: string;
  tokenDeltas?: { in?: number; out?: number };
  metadata?: Record<string, unknown>;
};

export type Conversation = {
  id: string;
  status: ConversationStatus;
  startedAt: string;
  lastTouchedAt: string;
  closedAt?: string;
  summary?: string;
  tags?: string[];
  flags?: { explicit?: boolean; forbidden?: boolean; summaryError?: boolean | string };
  modelSet?: string[];
  tokenSet?: string[];
  placeTags?: string[];
  keywords?: string[];
  closeReason?: string;
};

export type Request = {
  id: string;
  conversationId: string;
  token: string;
  startedAt: string;
  latencyMs?: number;
  modelUsed?: string;
  initialPlace?: string;
  clientMeta?: Record<string, unknown>;
};

export type TurnStatus = "ok" | "error";

export type Turn = {
  id: string;
  requestId: string;
  conversationId: string;
  token: string;
  model: string;
  startedAt: string;
  latencyMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  toolCalls?: string;
  status?: TurnStatus;
  errorType?: string;
};

export type ToolResult = {
  ok: boolean;
  latencyMs: number;
  errorType?: string;
};

export type OpenRouterResult = {
  ok: boolean;
  latencyMs: number;
  errorType?: string;
  tokensIn?: number;
  tokensOut?: number;
};

export type RecallQuery = {
  conversationId?: string;
  token?: string;
  timeRange?: { since?: number; until?: number };
  keywords?: string[];
  place?: string;
  limit?: number;
  includeMessages?: boolean;
  messageLimit?: number;
};

export type RecallConversation = {
  conversation: Conversation;
  messages?: MessageRecord[];
};

type RecordKeeperOptions = {
  namespace?: string;
  metricsNamespace?: string;
  idleMs?: number;
  summarizer?: ConversationSummaryService;
};

const DEFAULT_NAMESPACE = "bernard:rk";
const DEFAULT_METRICS_NAMESPACE = "bernard:rk:metrics";
const DEFAULT_IDLE_MS = 10 * 60 * 1000; // 10 minutes

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

type MessageWithDetails = BaseMessage & {
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: MessageRecord["tool_calls"];
  response_metadata?: Record<string, unknown>;
  usage_metadata?: { input_tokens?: number; output_tokens?: number };
  name?: string;
};

function normalizeMessageContent(content: unknown): MessageRecord["content"] {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const records = content.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
    if (records.length) return records;
  }
  if (content && typeof content === "object") {
    return content as Record<string, unknown>;
  }
  if (typeof content === "number" || typeof content === "boolean") {
    return String(content);
  }
  return "";
}

function isMessageRecord(msg: BaseMessage | MessageRecord): msg is MessageRecord {
  return "role" in msg && "createdAt" in msg;
}

export class RecordKeeper {
  private readonly namespace: string;
  private readonly metricsNamespace: string;
  private readonly idleMs: number;
  private readonly summarizer?: ConversationSummaryService;

  constructor(
    private readonly redis: Redis,
    opts: RecordKeeperOptions = {}
  ) {
    this.namespace = opts.namespace ?? DEFAULT_NAMESPACE;
    this.metricsNamespace = opts.metricsNamespace ?? DEFAULT_METRICS_NAMESPACE;
    this.idleMs = opts.idleMs ?? DEFAULT_IDLE_MS;
    this.summarizer = opts.summarizer;
  }

  async startRequest(
    token: string,
    model: string,
    opts: { place?: string; clientMeta?: Record<string, unknown>; conversationId?: string } = {}
  ): Promise<{ requestId: string; conversationId: string; isNewConversation: boolean }> {
    const now = Date.now();
    const nowISO = nowIso();

    const conversationId = opts.conversationId ?? (await this.findActiveConversationForToken(token, now));
    const finalConversationId = conversationId ?? uniqueId("conv");
    const isNewConversation = !conversationId;
    const requestId = uniqueId("req");

    const convKey = this.key(`conv:${finalConversationId}`);
    const reqKey = this.key(`req:${requestId}`);

    const multi = this.redis.multi();

    if (isNewConversation) {
      multi.hset(convKey, {
        status: "open",
        startedAt: nowISO,
        lastTouchedAt: nowISO,
        modelSet: JSON.stringify([model]),
        tokenSet: JSON.stringify([token]),
        placeTags: opts.place ? JSON.stringify([opts.place]) : ""
      });
    } else {
      multi.hset(convKey, { lastTouchedAt: nowISO });
    }

    multi
      .hset(reqKey, {
        conversationId: finalConversationId,
        token,
        startedAt: nowISO,
        modelUsed: model,
        initialPlace: opts.place ?? "",
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

    return { requestId, conversationId: finalConversationId, isNewConversation };
  }

  async completeRequest(requestId: string, latencyMs: number) {
    await this.redis.hset(this.key(`req:${requestId}`), { latencyMs });
  }

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

  async endTurn(
    turnId: string,
    opts: { status: TurnStatus; tokensIn?: number; tokensOut?: number; latencyMs: number; errorType?: string }
  ) {
    const turnKey = this.key(`turn:${turnId}`);
    const updates: Record<string, string | number> = {
      status: opts.status,
      latencyMs: opts.latencyMs
    };
    if (typeof opts.tokensIn === "number") updates.tokensIn = opts.tokensIn;
    if (typeof opts.tokensOut === "number") updates.tokensOut = opts.tokensOut;
    if (opts.errorType) updates.errorType = opts.errorType;
    await this.redis.hset(turnKey, updates);
    if (opts.status === "error") {
      await this.redis.hincrby(this.metricsKey("turns"), "error", 1);
    }
  }

  async appendMessages(conversationId: string, messages: Array<BaseMessage | MessageRecord>) {
    if (!messages.length) return;
    const serialized = messages.map((msg) => this.serializeMessage(msg));
    const listKey = this.key(`conv:${conversationId}:msgs`);
    const now = Date.now();
    const nowISO = nowIso();
    const multi = this.redis.multi();
    serialized.forEach((item) => {
      multi.rpush(listKey, JSON.stringify(item));
    });
    multi
      .hset(this.key(`conv:${conversationId}`), { lastTouchedAt: nowISO })
      .zadd(this.key("convs:active"), now, conversationId);
    await multi.exec();
  }

  async recordToolResult(turnId: string, toolName: string, result: ToolResult) {
    const hashKey = this.metricsKey(`tool:${toolName}`);
    const multi = this.redis.multi();
    multi.hincrby(hashKey, result.ok ? "ok" : "fail", 1);
    multi.hincrbyfloat(hashKey, "sum_ms", result.latencyMs);
    multi.hincrbyfloat(hashKey, "sum_sqr_ms", result.latencyMs * result.latencyMs);
    if (!result.ok && result.errorType) {
      multi.hincrby(hashKey, `error:${result.errorType}`, 1);
    }
    if (!result.ok && result.errorType) {
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

    const turnUpdates: Record<string, number | string> = {
      latencyMs: result.latencyMs
    };
    if (typeof result.tokensIn === "number") {
      multi.hincrbyfloat(tokensKey, "in", result.tokensIn);
      multi.hincrbyfloat(turnKey, "tokensIn", result.tokensIn);
    }
    if (typeof result.tokensOut === "number") {
      multi.hincrbyfloat(tokensKey, "out", result.tokensOut);
      multi.hincrbyfloat(turnKey, "tokensOut", result.tokensOut);
    }
    if (!result.ok && result.errorType) {
      turnUpdates.errorType = result.errorType;
    }

    if (Object.keys(turnUpdates).length) {
      multi.hset(turnKey, turnUpdates);
    }
    await multi.exec();
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
    if (!convo || convo.status === "closed") return;

    const closedAt = nowIso();
    const now = Date.now();

    const messages = await this.getMessages(conversationId);
    let summary: SummaryResult | null = null;
    if (this.summarizer) {
      summary = await this.summarizer.summarize(conversationId, messages);
    }

    const updates: Record<string, string> = {
      status: "closed",
      closedAt,
      closeReason: reason,
      lastTouchedAt: closedAt
    };
    if (summary?.summary) updates.summary = summary.summary;
    if (summary?.tags) updates.tags = JSON.stringify(summary.tags);
    if (summary?.flags) updates.flags = JSON.stringify(summary.flags);
    if (summary?.keywords) updates.keywords = JSON.stringify(summary.keywords);
    if (summary?.places) updates.placeTags = JSON.stringify(summary.places);
    if (summary?.summaryError) updates.closeReason = `${reason}; summary_error:${summary.summaryError}`;

    const multi = this.redis
      .multi()
      .hset(convKey, updates)
      .zrem(this.key("convs:active"), conversationId)
      .zadd(this.key("convs:closed"), now, conversationId);

    await multi.exec();
  }

  async closeIfIdle(now: number = Date.now()) {
    const cutoff = now - this.idleMs;
    const idleIds = await this.redis.zrangebyscore(this.key("convs:active"), 0, cutoff);
    for (const id of idleIds) {
      await this.closeConversation(id, "idle");
    }
  }

  async recallConversation(query: RecallQuery): Promise<RecallConversation[]> {
    if (query.conversationId) {
      const conversation = await this.getConversation(query.conversationId);
      if (!conversation) return [];
      const messages = query.includeMessages ? await this.getMessages(query.conversationId, query.messageLimit) : undefined;
      return [{ conversation, messages }];
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

      const messages = query.includeMessages ? await this.getMessages(id, query.messageLimit) : undefined;
      results.push({ conversation, messages });
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
    if (!data || !data.status) return null;
    return {
      id,
      status: data.status as ConversationStatus,
      startedAt: data.startedAt,
      lastTouchedAt: data.lastTouchedAt,
      closedAt: data.closedAt || undefined,
      summary: data.summary || undefined,
      tags: parseJsonArray(data.tags),
      flags: data.flags ? (JSON.parse(data.flags) as Conversation["flags"]) : undefined,
      modelSet: parseJsonArray(data.modelSet),
      tokenSet: parseJsonArray(data.tokenSet),
      placeTags: parseJsonArray(data.placeTags),
      keywords: parseJsonArray(data.keywords),
      closeReason: data.closeReason || undefined
    };
  }

  async getMessages(conversationId: string, limit?: number): Promise<MessageRecord[]> {
    const listKey = this.key(`conv:${conversationId}:msgs`);
    let raw: string[];
    if (typeof limit === "number") {
      raw = await this.redis.lrange(listKey, -limit, -1);
    } else {
      raw = await this.redis.lrange(listKey, 0, -1);
    }
    return raw
      .map((item) => {
        try {
          return JSON.parse(item) as MessageRecord;
        } catch {
          return null;
        }
      })
      .filter((m): m is MessageRecord => m !== null);
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
    const conversation = await this.redis.hgetall(this.key(`conv:${ids[0]}`));
    if (!conversation || conversation.status !== "open") return null;
    return ids[0];
  }

  private key(suffix: string) {
    return `${this.namespace}:${suffix}`;
  }

  private metricsKey(suffix: string) {
    return `${this.metricsNamespace}:${suffix}`;
  }

  private serializeMessage(msg: BaseMessage | MessageRecord): MessageRecord {
    if (isMessageRecord(msg)) {
      return msg;
    }

    const base = msg as MessageWithDetails;
    const role = base._getType() as MessageRecord["role"];
    const content = normalizeMessageContent(base.content);
    const toolCallId = base.tool_call_id ?? base.name;
    const toolCalls = base.tool_calls;
    const metadata = base.response_metadata;
    const tokenUsage = base.usage_metadata;

    return {
      id: uniqueId("msg"),
      role,
      content,
      name: base.name,
      tool_call_id: toolCallId,
      tool_calls: toolCalls,
      createdAt: nowIso(),
      tokenDeltas:
        tokenUsage && (tokenUsage.input_tokens || tokenUsage.output_tokens)
          ? { in: tokenUsage.input_tokens, out: tokenUsage.output_tokens }
          : undefined,
      metadata
    };
  }

  private async mergeSetField(convKey: string, field: string, values: string[]) {
    const existing = await this.redis.hget(convKey, field);
    const set = new Set<string>();
    parseJsonArray(existing ?? undefined)?.forEach((v) => set.add(v));
    values.filter(Boolean).forEach((v) => set.add(v));
    await this.redis.hset(convKey, field, JSON.stringify(Array.from(set)));
  }
}

