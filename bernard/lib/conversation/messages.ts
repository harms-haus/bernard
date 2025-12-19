import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { AIMessageFields, BaseMessage } from "@langchain/core/messages";
import { jsonrepair } from "jsonrepair";

import type { MessageRecord, ToolCallEntry } from "./types";

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type LegacyFunctionCall = {
  name: string;
  arguments: unknown;
};

export type OpenAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<{ type: string; text?: string }> | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  function_call?: LegacyFunctionCall;
};

export type TokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_write_input_tokens?: number;
  cached?: boolean;
};

export type LangGraphToolCall = NonNullable<AIMessage["tool_calls"]>[number];

export const VALID_ROLES = new Set<OpenAIMessage["role"]>(["system", "user", "assistant", "tool"]);

/**
 * Narrow an unknown value to a record.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Detect ChatML markers anywhere within a message-like payload.
 */
export function containsChatMLMarkers(value: unknown): boolean {
  if (typeof value === "string") return value.includes("<|") || value.includes("|>");
  if (Array.isArray(value)) return value.some((part) => containsChatMLMarkers(part));
  if (value && typeof value === "object") {
    const maybeText = (value as { text?: unknown }).text;
    if (maybeText !== undefined && containsChatMLMarkers(maybeText)) return true;
    const maybeContent = (value as { content?: unknown }).content;
    if (maybeContent !== undefined && containsChatMLMarkers(maybeContent)) return true;
  }
  return false;
}

/**
 * Safely stringify values, falling back to String() when JSON.stringify fails.
 */
export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Parse tool input; attempts JSON.parse then jsonrepair before giving up.
 */
export function parseToolInput(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const candidate = raw.trim();
  if (!candidate) return raw;
  try {
    return JSON.parse(candidate);
  } catch {
    try {
      const repaired = jsonrepair(candidate);
      return JSON.parse(repaired);
    } catch {
      return raw;
    }
  }
}

/**
 * Parse tool input and return diagnostics about repair attempts.
 */
export function parseToolInputWithDiagnostics(raw: unknown): {
  value: unknown;
  success: boolean;
  repaired: boolean;
  error?: string;
} {
  if (typeof raw !== "string") return { value: raw, success: true, repaired: false };
  const candidate = raw.trim();
  if (!candidate) return { value: raw, success: true, repaired: false };
  try {
    return { value: JSON.parse(candidate), success: true, repaired: false };
  } catch (err) {
    try {
      const repaired = jsonrepair(candidate);
      return { value: JSON.parse(repaired), success: true, repaired: true };
    } catch (repairErr) {
      return {
        value: raw,
        success: false,
        repaired: false,
        error: repairErr instanceof Error ? repairErr.message : String(repairErr)
      };
    }
  }
}

/**
 * Normalize content from a LangChain BaseMessage to a string when possible.
 */
export function contentFromMessage(message: BaseMessage | null): string | null {
  if (!message) return null;
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("");
  }
  if (content && typeof content === "object" && "text" in (content as Record<string, unknown>)) {
    const text = (content as { text?: unknown }).text;
    return typeof text === "string" ? text : null;
  }
  return null;
}

/**
 * Find the last assistant/ai message in a list.
 */
export function findLastAssistantMessage(messages: BaseMessage[]): BaseMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue;
    const candidate = message as { type: string };
    if (candidate.type === "ai") return message;
  }
  return null;
}

/**
 * Collect tool calls from any message that already includes tool_calls.
 */
export function collectToolCalls(messages: BaseMessage[]) {
  const calls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }> = [];
  for (const message of messages) {
    if ((message as { tool_calls?: unknown[] }).tool_calls) {
      const tc = (message as { tool_calls?: unknown[] }).tool_calls;
      if (Array.isArray(tc)) {
        for (const call of tc) {
          const fn = (call as { function?: { name?: string; arguments?: unknown } }).function;
          const id = (call as { id?: string }).id ?? fn?.name ?? "tool_call";
          const name = fn?.name ?? "tool_call";
          const args = fn?.arguments ?? "";
          calls.push({
            id: String(id),
            type: "function",
            function: {
              name: String(name),
              arguments: typeof args === "string" ? args : safeStringify(args)
            }
          });
        }
      }
    }
  }
  return calls;
}

/**
 * Convert a list of messages into the OpenAI chat message shape using the last assistant.
 */
export function toOpenAIChatMessage(messages: BaseMessage[]) {
  const lastAssistant = findLastAssistantMessage(messages);
  const toolCalls = collectToolCalls(messages);
  return {
    role: "assistant" as const,
    content: contentFromMessage(lastAssistant) ?? "",
    ...(toolCalls.length ? { tool_calls: toolCalls } : {})
  };
}

/**
 * Extract token usage details from a provider result.
 */
export function extractTokenUsage(result: unknown): TokenUsage {
  if (!result || typeof result !== "object") return {};
  const withUsage = result as {
    response_metadata?: { token_usage?: TokenUsage };
    usage_metadata?: TokenUsage;
  };
  return withUsage.response_metadata?.token_usage ?? withUsage.usage_metadata ?? {};
}

/**
 * Extract token usage from the last assistant message.
 */
export function extractUsageFromMessages(messages: BaseMessage[]) {
  const assistant = findLastAssistantMessage(messages);
  if (!assistant) return {};
  return extractTokenUsage(assistant);
}

function isTraceMessage(record: MessageRecord): boolean {
  const traceType = (record.metadata as { traceType?: string } | undefined)?.traceType;
  if (traceType === "llm_call") return true;
  return record.name === "llm_call";
}

type MessageContentLike = string | Array<{ type: string; text?: string }>;

function normalizeRecordContent(content: MessageRecord["content"]): MessageContentLike {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    if (content.length === 0) return "";
    return content as Array<{ type: string; text?: string }>;
  }
  if (content && typeof content === "object") return safeStringify(content);
  return "";
}

/**
 * Convert a persisted MessageRecord into a LangChain BaseMessage.
 */
export function messageRecordToBaseMessage(record: MessageRecord, opts: { includeTraces?: boolean } = {}): BaseMessage | null {
  if (!opts.includeTraces && isTraceMessage(record)) return null;

  const normalizedContent = normalizeRecordContent(record.content);
  const base = { content: normalizedContent, ...(record.name ? { name: record.name } : {}) } as {
    content: MessageContentLike;
    name?: string;
  };

  switch (record.role) {
    case "system":
      return new SystemMessage(base);
    case "user":
      return new HumanMessage(base);
    case "assistant": {
      const aiFields: AIMessageFields = { content: normalizedContent };
      if (record.tool_calls?.length) {
        (aiFields as { tool_calls?: AIMessage["tool_calls"] }).tool_calls = record.tool_calls as unknown as AIMessage["tool_calls"];
      }
      if (record.name) {
        (aiFields as { name?: string }).name = record.name;
      }
      return new AIMessage(aiFields);
    }
    case "tool":
      return new ToolMessage({
        tool_call_id: record.tool_call_id ?? record.name ?? "tool_call",
        content: typeof normalizedContent === "string" ? normalizedContent : safeStringify(normalizedContent),
        ...(record.name ? { name: record.name } : {})
      });
    default:
      return new HumanMessage(base);
  }
}

/**
 * Map message records to LangChain messages, optionally keeping trace messages.
 */
export function mapRecordsToMessages(records: MessageRecord[], opts: { includeTraces?: boolean } = {}): BaseMessage[] {
  return records
    .map((record) => messageRecordToBaseMessage(record, opts))
    .filter((msg): msg is BaseMessage => Boolean(msg));
}

function normalizeRecordToolCall(call: ToolCallEntry, index: number): ToolCall {
  const fn = call.function ?? {};
  const id = (call.id ?? fn.name ?? `tool_call_${index}`).toString();
  const name = (call.name ?? fn.name ?? "tool_call").toString();
  const rawArgs = fn.arguments ?? (call as { arguments?: unknown }).arguments ?? call.args ?? call.input;
  const normalizedArgs = typeof rawArgs === "string" ? rawArgs : safeStringify(rawArgs);
  return {
    id,
    type: (call.type as "function" | undefined) ?? "function",
    function: { name, arguments: normalizedArgs }
  };
}

/**
 * Convert a MessageRecord into an OpenAIMessage.
 */
export function messageRecordToOpenAI(record: MessageRecord): OpenAIMessage | null {
  if (isTraceMessage(record)) {
    return {
      role: "system",
      name: record.name ?? "llm_call",
      content: typeof record.content === "string" ? record.content : safeStringify(record.content),
      ...(record.metadata ? { metadata: record.metadata } : {})
    } as OpenAIMessage;
  }

  const base: OpenAIMessage = {
    role: record.role,
    content:
      typeof record.content === "string"
        ? record.content
        : Array.isArray(record.content)
          ? (record.content as Array<{ type: string; text?: string }>)
          : safeStringify(record.content)
  } as OpenAIMessage;

  if (record.name) base.name = record.name;
  if (record.role === "tool") {
    base.tool_call_id = record.tool_call_id ?? record.name ?? "tool_call";
  }

  if (record.tool_calls?.length) {
    base.tool_calls = record.tool_calls.map((call, index) => normalizeRecordToolCall(call, index));
  }

  return base;
}

function buildToolCallFromOpenAI(call: ToolCall, index: number): LangGraphToolCall {
  const name = call.function.name ?? "tool_call";
  const fallbackId = `${name}_${index}`;
  const id = typeof call.id === "string" && call.id.trim() ? call.id : fallbackId;
  const rawArgs = call.function.arguments;
  const parsedArgs = parseToolInput(rawArgs);
  const argsObject: Record<string, unknown> =
    isRecord(parsedArgs) && !Array.isArray(parsedArgs) ? parsedArgs : { value: parsedArgs };

  return {
    id,
    type: "tool_call",
    name,
    args: argsObject,
    function: {
      name,
      arguments: typeof rawArgs === "string" ? rawArgs : safeStringify(rawArgs)
    }
  } as LangGraphToolCall;
}

function buildToolCallFromLegacyFunctionCall(call: LegacyFunctionCall): LangGraphToolCall {
  const rawArgs = call.arguments;
  const parsedArgs = parseToolInput(rawArgs);
  const argsObject: Record<string, unknown> =
    isRecord(parsedArgs) && !Array.isArray(parsedArgs) ? parsedArgs : { value: parsedArgs };

  return {
    id: call.name ?? "function_call",
    type: "tool_call",
    name: call.name,
    args: argsObject,
    function: {
      name: call.name,
      arguments: typeof rawArgs === "string" ? rawArgs : safeStringify(rawArgs)
    }
  } as LangGraphToolCall;
}

/**
 * Convert OpenAI chat messages into LangChain messages, guarding against ChatML markers.
 */
export function mapOpenAIToMessages(input: OpenAIMessage[]): BaseMessage[] {
  return input.map((msg) => {
    const content = msg.content ?? "";
    if (!VALID_ROLES.has(msg.role)) {
      throw new Error(`Unsupported role "${String(msg.role)}"`);
    }
    if (containsChatMLMarkers(content)) {
      throw new Error("Unsupported ChatML markers in message content");
    }
    switch (msg.role) {
      case "system":
        return new SystemMessage({ content });
      case "user":
        return new HumanMessage({ content });
      case "assistant": {
        const toolCalls: AIMessage["tool_calls"] = [];

        if (Array.isArray(msg.tool_calls)) {
          for (const call of msg.tool_calls) {
            toolCalls.push(buildToolCallFromOpenAI(call, toolCalls.length));
          }
        }

        if (msg.function_call) {
          toolCalls.push(buildToolCallFromLegacyFunctionCall(msg.function_call));
        }

        const aiFields: AIMessageFields = { content };
        if (toolCalls.length) {
          (aiFields as { tool_calls?: AIMessage["tool_calls"] }).tool_calls = toolCalls;
        }
        return new AIMessage(aiFields);
      }
      case "tool":
        return new ToolMessage({
          tool_call_id: msg.tool_call_id ?? msg.name ?? "unknown_tool_call",
          content
        });
      default:
        throw new Error("Unsupported role");
    }
  });
}

/**
 * Extract a messages array from various possible chunk shapes.
 */
export function extractMessagesFromChunk(chunk: unknown): BaseMessage[] | null {
  if (!chunk || typeof chunk !== "object") return null;

  const direct = (chunk as { messages?: unknown }).messages;
  if (Array.isArray(direct)) return direct as BaseMessage[];

  const data = (chunk as { data?: Record<string, unknown> }).data;
  if (!data || typeof data !== "object") return null;
  const dataMessages = (data as { messages?: BaseMessage[] }).messages;
  if (Array.isArray(dataMessages)) return dataMessages;
  const agent = (data as { agent?: { messages?: BaseMessage[] } }).agent;
  if (agent && Array.isArray(agent.messages)) return agent.messages;
  const tools = (data as { tools?: { messages?: BaseMessage[] } }).tools;
  if (tools && Array.isArray(tools.messages)) return tools.messages;
  return null;
}

/**
 * Summarize only tool messages to a minimal array of id/content.
 */
export function summarizeToolOutputs(messages: BaseMessage[]) {
  return messages
    .filter((m) => (m as { type: string }).type === "tool")
    .map((m) => {
      const id = (m as { tool_call_id?: string }).tool_call_id ?? "tool_call";
      const content = contentFromMessage(m) ?? "";
      return { id, content };
    });
}

/**
 * Quick type guard for tool messages.
 */
export function isToolMessage(message: BaseMessage) {
  return (message as { type: string }).type === "tool";
}


