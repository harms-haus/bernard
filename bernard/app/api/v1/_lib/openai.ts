import type { NextRequest } from "next/server";

import type { BaseMessage, MessageStructure, MessageType } from "@langchain/core/messages";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

import { validateAccessToken } from "@/lib/auth";
import { extractTokenUsage, mapOpenAIToMessages, type OpenAIMessage } from "@/lib/conversation/messages";
import { ConversationSummaryService } from "@/lib/conversation/summary";
import { RecordKeeper, type MessageRecord } from "@/lib/conversation/recordKeeper";
import { getPrimaryModel } from "@/lib/config/models";
import { getRedis } from "@/lib/infra/redis";
import { messageRecordToBaseMessage } from "@/lib/conversation/messages";

export const BERNARD_MODEL_ID = "bernard-v1";

export type ModelInfo = {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
};

export function listModels(): ModelInfo[] {
  return [
    {
      id: BERNARD_MODEL_ID,
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: "bernard-v1"
    }
  ];
}

export async function validateAuth(req: NextRequest) {
  const result = await validateAccessToken(req);
  if ("error" in result) {
    return result;
  }
  return { token: result.access.token };
}

export type AgentScaffolding = {
  keeper: RecordKeeper;
  conversationId: string;
  requestId: string;
  turnId: string;
  responseModelName: string;
  routerModelName: string;
  isNewConversation: boolean;
};

export async function createScaffolding(opts: {
  token: string;
  responseModelOverride?: string;
  conversationId?: string;
  userId?: string;
  ghost?: boolean;
}) {
  const redis = getRedis();
  let summarizer: ConversationSummaryService | undefined;
  try {
    summarizer = await ConversationSummaryService.create();
  } catch {
    // summarizer is optional
  }
  const keeper = new RecordKeeper(redis, summarizer ? { summarizer } : {});
  await keeper.closeIfIdle();

  const responseModelName = opts.responseModelOverride ?? (await getPrimaryModel("response"));
  const routerModelName = await getPrimaryModel("router", { fallback: [responseModelName] });

  const { requestId, conversationId, isNewConversation } = await keeper.startRequest(opts.token, responseModelName, {
    ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
    ...(opts.userId ? { userId: opts.userId } : {}),
    ...(opts.ghost !== undefined ? { ghost: opts.ghost } : {})
  });
  const turnId = await keeper.startTurn(requestId, conversationId, opts.token, responseModelName);

  return { keeper, conversationId, requestId, turnId, responseModelName, routerModelName, isNewConversation } satisfies AgentScaffolding;
}

export function isBernardModel(model?: string | null) {
  return !model || model === BERNARD_MODEL_ID;
}

export function toOpenAIChatMessage(messages: BaseMessage[]) {
  const lastAssistant = findLastAssistantMessage(messages);
  const toolCalls = collectToolCalls(messages);
  return {
    role: "assistant" as const,
    content: contentFromMessage(lastAssistant) ?? "",
    ...(toolCalls.length ? { tool_calls: toolCalls } : {})
  };
}

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

export function extractUsageFromMessages(messages: BaseMessage[]) {
  const assistant = findLastAssistantMessage(messages);
  if (!assistant) return {};
  return extractTokenUsage(assistant);
}

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

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

export function findLastAssistantMessage(messages: BaseMessage[]): BaseMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue;
    const candidate = message as { type: string };
    if (candidate.type === "ai") return message;
  }
  return null;
}

export function extractMessagesFromChunk(chunk: unknown): BaseMessage[] | null {
  if (!chunk || typeof chunk !== "object") return null;

  const direct = (chunk as { messages?: unknown }).messages;
  if (Array.isArray(direct)) return direct as BaseMessage[];

  const data = (chunk as { data?: Record<string, unknown> }).data;
  if (!data || typeof data !== "object") return null;
  const rootMessages = (data as { messages?: BaseMessage[] }).messages;
  if (Array.isArray(rootMessages)) return rootMessages;
  const agent = (data as { agent?: { messages?: BaseMessage[] } }).agent;
  if (agent && Array.isArray(agent.messages)) return agent.messages;
  const tools = (data as { tools?: { messages?: BaseMessage[] } }).tools;
  if (tools && Array.isArray(tools.messages)) return tools.messages;
  return null;
}

export function mapChatMessages(input: OpenAIMessage[]): BaseMessage<MessageStructure, MessageType>[] {
  return mapOpenAIToMessages(input);
}

export function mapCompletionPrompt(prompt: string): BaseMessage[] {
  return [new SystemMessage({ content: "" }), new HumanMessage({ content: prompt })];
}

export function summarizeToolOutputs(messages: BaseMessage[]) {
  return messages
    .filter((m) => (m as { type: string }).type === "tool")
    .map((m) => {
      const id = (m as { tool_call_id?: string }).tool_call_id ?? "tool_call";
      const content = contentFromMessage(m) ?? "";
      return { id, content };
    });
}

export function isToolMessage(message: BaseMessage) {
  return (message as { type: string }).type === "tool";
}

type TimelineEntry = {
  message: BaseMessage;
  ts: number;
  roleRank: number;
  seq: number;
};

function roleOrder(message: BaseMessage): number {
  const type = (message as { type: string }).type;
  switch (type) {
    case "human":
      return 0;
    case "ai":
      return 1;
    case "tool":
      return 2;
    case "system":
      return 3;
    default:
      return 4;
  }
}

function shouldIncludeHistoryRecord(record: MessageRecord): boolean {
  if (record.role !== "system") return true;

  // Exclude all system messages from history when preparing LLM context.
  // Harnesses provide their own fresh system prompts.
  // This also excludes traces and errors which are recorded as system messages.
  return false;
}

function toTimelineEntry(record: MessageRecord, index: number): TimelineEntry | null {
  if (!shouldIncludeHistoryRecord(record)) return null;
  const message = messageRecordToBaseMessage(record, { includeTraces: true });
  if (!message) return null;
  const ts = Date.parse(record.createdAt ?? "");
  return {
    message,
    ts: Number.isFinite(ts) ? ts : Number.NaN,
    roleRank: roleOrder(message),
    seq: index
  };
}

function compareEntries(a: TimelineEntry, b: TimelineEntry): number {
  const aHasTs = Number.isFinite(a.ts);
  const bHasTs = Number.isFinite(b.ts);
  if (aHasTs && bHasTs && a.ts !== b.ts) return a.ts - b.ts;
  if (aHasTs && !bHasTs) return -1;
  if (!aHasTs && bHasTs) return 1;
  // When timestamps are equal or missing, preserve original sequence to avoid reordering turns.
  if (!aHasTs && !bHasTs) return a.seq - b.seq;
  if (a.roleRank !== b.roleRank) return a.roleRank - b.roleRank;
  return a.seq - b.seq;
}

async function mergeHistoryWithIncoming(history: MessageRecord[], incoming: BaseMessage<MessageStructure, MessageType>[]): Promise<BaseMessage<MessageStructure, MessageType>[]> {
  const historyEntries = history
    .map((record, index) => toTimelineEntry(record, index))
    .filter((entry): entry is TimelineEntry => Boolean(entry));

  const hasFiniteHistoryTs = historyEntries.some((entry) => Number.isFinite(entry.ts));
  const historyWithTs = hasFiniteHistoryTs
    ? historyEntries
    : historyEntries.map((entry, idx) => ({ ...entry, ts: idx }));

  const latestTs = historyWithTs.reduce((max, entry) => {
    return Number.isFinite(entry.ts) ? Math.max(max, entry.ts) : max;
  }, Number.NEGATIVE_INFINITY);

  const baseTs = Number.isFinite(latestTs) ? latestTs + 1 : historyWithTs.length;
  const startSeq = historyEntries.length;

  const incomingEntries: TimelineEntry[] = incoming.map((message, idx) => ({
    message,
    ts: baseTs + idx,
    roleRank: roleOrder(message),
    seq: startSeq + idx
  }));

  const combined = [...historyWithTs, ...incomingEntries];
  combined.sort(compareEntries);

  const messages = combined.map((entry) => entry.message);

  // Import and apply deduplication to prevent duplicate messages
  const { deduplicateMessages } = await import("@/lib/conversation/dedup");
  return deduplicateMessages(messages);
}

export async function hydrateMessagesWithHistory(opts: {
  keeper: RecordKeeper;
  conversationId: string;
  incoming: BaseMessage<MessageStructure, MessageType>[];
}): Promise<BaseMessage<MessageStructure, MessageType>[]> {
  const history = await opts.keeper.getMessages(opts.conversationId);
  if (!history.length) return opts.incoming;
  return mergeHistoryWithIncoming(history, opts.incoming);
}


