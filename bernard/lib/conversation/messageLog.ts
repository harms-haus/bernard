import type { BaseMessage } from "@langchain/core/messages";
import type Redis from "ioredis";

import { safeStringify } from "./messages";
import type { MessageRecord, ToolCallEntry } from "./types";

const nowIso = () => new Date().toISOString();

function uniqueId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2, 12)}`;
}

/**
 * Normalize LangChain message types to the roles persisted in Redis.
 */
export function mapMessageRole(type: string | undefined): MessageRecord["role"] {
  if (type === "ai" || type === "assistant") return "assistant";
  if (type === "human" || type === "user") return "user";
  if (type === "system") return "system";
  if (type === "tool") return "tool";
  return "user";
}

/**
 * Accept permissive content shapes from LangChain and coerce them into
 * a record-friendly representation.
 */
export function normalizeMessageContent(content: unknown): MessageRecord["content"] {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter((part) => typeof part === "object") as Array<Record<string, unknown>>;
  if (content && typeof content === "object") return content as Record<string, unknown>;
  return "";
}

function isMessageRecord(msg: BaseMessage | MessageRecord): msg is MessageRecord {
  return "role" in msg && "createdAt" in msg;
}

/**
 * Safely strip unknown tool call inputs down to the subset we persist.
 */
export function toToolCallEntry(raw: unknown): ToolCallEntry {
  if (!raw || typeof raw !== "object") {
    const name = typeof raw === "string" ? raw : safeStringify(raw ?? "");
    return { name };
  }
  const tool = raw as ToolCallEntry;
  const normalized: ToolCallEntry = {};
  if (tool.id) normalized.id = tool.id;
  if (tool.type) normalized.type = tool.type;
  if (tool.name) normalized.name = tool.name;
  if (tool.arguments !== undefined) normalized.arguments = tool.arguments;
  if (tool.args !== undefined) normalized.args = tool.args;
  if (tool.input !== undefined) normalized.input = tool.input;
  if (tool.function && typeof tool.function === "object") {
    normalized.function = {};
    if (tool.function.name) normalized.function.name = tool.function.name;
    if (tool.function.arguments !== undefined) normalized.function.arguments = tool.function.arguments;
    if (tool.function.args !== undefined) normalized.function.args = tool.function.args;
  }
  const rawArgs = (tool as { raw?: unknown }).raw ?? (tool as { raw_arguments?: unknown }).raw_arguments;
  if (rawArgs !== undefined) normalized.raw = rawArgs;
  return normalized;
}

/**
 * Convert arbitrary message content into a string suitable for tracing.
 */
export function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const flattened = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const maybeText = (part as { text?: unknown }).text;
          if (typeof maybeText === "string") return maybeText;
          const maybeContent = (part as { content?: unknown }).content;
          if (typeof maybeContent === "string") return maybeContent;
        }
        return safeStringify(part);
      })
      .filter(Boolean)
      .join(" ");
    return flattened;
  }
  if (content && typeof content === "object") {
    const maybeText = (content as { text?: unknown }).text;
    if (typeof maybeText === "string") return maybeText;
    const maybeContent = (content as { content?: unknown }).content;
    if (typeof maybeContent === "string") return maybeContent;
    return safeStringify(content);
  }
  if (content === null || content === undefined) return "";
  return safeStringify(content);
}

/**
 * Count tool calls by inspecting assistant tool_calls and tool role outputs.
 */
export function countToolCallsInMessages(messages: MessageRecord[]): number {
  return messages.reduce((total, message) => {
    const fromToolCalls =
      message.role === "assistant" && Array.isArray(message.tool_calls) ? message.tool_calls.length : 0;
    const fromToolOutputs = message.role === "tool" ? 1 : 0;
    return total + fromToolCalls + fromToolOutputs;
  }, 0);
}

/**
 * Identify orchestrator and trace errors.
 */
export function isErrorRecord(message: MessageRecord): boolean {
  const name = message.name ?? "";
  const traceType = (message.metadata as { traceType?: string } | undefined)?.traceType ?? "";
  if (traceType === "error" || traceType === "orchestrator.error") return true;
  if (name.endsWith(".error") || name === "orchestrator.error") return true;
  return false;
}

/**
 * Count user and assistant messages for conversation stats.
 */
export function countUserAssistantMessages(messages: MessageRecord[]): number {
  return messages.reduce((total, message) => {
    return message.role === "user" || message.role === "assistant" ? total + 1 : total;
  }, 0);
}

export function snapshotMessageForTrace(message: BaseMessage | MessageRecord) {
  const isRecord = isMessageRecord(message);
  const baseType =
    (message as { _getType?: () => string })._getType?.() ??
    (message as { getType?: () => string }).getType?.();
  const role = isRecord ? message.role : mapMessageRole(baseType);
  const name = (message as { name?: string }).name;
  const tool_call_id = (message as { tool_call_id?: string }).tool_call_id;
  const toolCallsRaw =
    (message as { tool_calls?: ToolCallEntry[] }).tool_calls ??
    (message as { additional_kwargs?: { tool_calls?: ToolCallEntry[] } }).additional_kwargs?.tool_calls ??
    [];

  const tool_calls =
    Array.isArray(toolCallsRaw) && toolCallsRaw.length ? toolCallsRaw.map((call) => toToolCallEntry(call)) : undefined;

  const contentValue = isRecord ? message.content : (message as { content?: unknown }).content;
  const content = contentToText(contentValue);

  return {
    role,
    ...(name ? { name } : {}),
    ...(tool_call_id ? { tool_call_id } : {}),
    content,
    ...(tool_calls ? { tool_calls } : {})
  };
}

/**
 * Persists conversation messages to Redis while maintaining lightweight counters.
 */
export class MessageLog {
  constructor(private readonly redis: Redis, private readonly key: (suffix: string) => string) {}

  private listKey(conversationId: string) {
    return this.key(`conv:${conversationId}:msgs`);
  }

  private serializeMessage(msg: BaseMessage | MessageRecord): MessageRecord {
    if (isMessageRecord(msg)) {
      return msg;
    }

    const base = msg as BaseMessage & {
      tool_call_id?: string;
      tool_calls?: ToolCallEntry[];
      additional_kwargs?: { tool_calls?: ToolCallEntry[] };
      response_metadata?: Record<string, unknown>;
      usage_metadata?: { input_tokens?: number; output_tokens?: number };
      name?: string;
    };
    const role = mapMessageRole((base as { _getType?: () => string })._getType?.());
    const content = normalizeMessageContent((base as { content?: unknown }).content);
    const toolCallId = base.tool_call_id ?? base.name;
    const toolCalls = base.tool_calls ?? base.additional_kwargs?.tool_calls;
    const metadata = base.response_metadata;
    const tokenUsage = base.usage_metadata;

    let tokenDeltas: { in?: number; out?: number } | undefined;
    if (tokenUsage && (tokenUsage.input_tokens || tokenUsage.output_tokens)) {
      tokenDeltas = {};
      if (typeof tokenUsage.input_tokens === "number") tokenDeltas.in = tokenUsage.input_tokens;
      if (typeof tokenUsage.output_tokens === "number") tokenDeltas.out = tokenUsage.output_tokens;
      if (!tokenDeltas.in && !tokenDeltas.out) {
        tokenDeltas = undefined;
      }
    }

    const message: MessageRecord = {
      id: uniqueId("msg"),
      role,
      content,
      createdAt: nowIso()
    };
    if (base.name) message.name = base.name;
    if (toolCallId) message.tool_call_id = toolCallId;
    if (toolCalls?.length) message.tool_calls = toolCalls.map((call) => toToolCallEntry(call));
    if (tokenDeltas) message.tokenDeltas = tokenDeltas;
    if (metadata) message.metadata = metadata;

    return message;
  }

  /**
   * Append messages to the conversation log and update relevant counters.
   */
  async append(conversationId: string, messages: Array<BaseMessage | MessageRecord>, convKey: string) {
    if (!messages.length) return;
    const serialized = messages.map((msg) => this.serializeMessage(msg));
    const listKey = this.listKey(conversationId);
    const messageIncrement = serialized.length;
    const toolCallIncrement = countToolCallsInMessages(serialized);
    const errorIncrement = serialized.filter((msg) => isErrorRecord(msg)).length;
    const userAssistantIncrement = countUserAssistantMessages(serialized);
    const now = Date.now();
    const nowISO = nowIso();

    const multi = this.redis.multi();
    serialized.forEach((item) => {
      multi.rpush(listKey, JSON.stringify(item));
    });
    multi
      .hincrby(convKey, "messageCount", messageIncrement)
      .hincrby(convKey, "userAssistantCount", userAssistantIncrement)
      .hincrby(convKey, "toolCallCount", toolCallIncrement)
      .hincrby(convKey, "errorCount", errorIncrement)
      .hset(convKey, { lastTouchedAt: nowISO })
      .zadd(this.key("convs:active"), now, conversationId);
    await multi.exec();
  }

  async getMessages(conversationId: string, limit?: number): Promise<MessageRecord[]> {
    const listKey = this.listKey(conversationId);
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

  async countUserAssistant(conversationId: string): Promise<number> {
    const messages = await this.getMessages(conversationId);
    return countUserAssistantMessages(messages);
  }

  async countToolCalls(conversationId: string): Promise<number> {
    const messages = await this.getMessages(conversationId);
    return countToolCallsInMessages(messages);
  }
}
