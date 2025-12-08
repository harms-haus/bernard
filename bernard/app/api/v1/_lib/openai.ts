import type { NextRequest } from "next/server";

import { ConversationSummaryService } from "@/lib/conversationSummary";
import { RecordKeeper } from "@/lib/recordKeeper";
import { TokenStore } from "@/lib/tokenStore";
import { getRedis } from "@/lib/redis";
import { getPrimaryModel } from "@/lib/models";
import type { BaseMessage } from "@langchain/core/messages";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { extractTokenUsage, mapOpenAIToMessages, type OpenAIMessage } from "@/lib/agent";

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
      owned_by: "bernard"
    }
  ];
}

export function bearerToken(req: NextRequest) {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function validateAuth(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) {
    return { error: new Response(JSON.stringify({ error: "Missing bearer token" }), { status: 401 }) };
  }

  const store = new TokenStore(getRedis());
  const auth = await store.validate(token);
  if (!auth) {
    return { error: new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 }) };
  }
  return { token };
}

export type AgentScaffolding = {
  keeper: RecordKeeper;
  conversationId: string;
  requestId: string;
  turnId: string;
  responseModelName: string;
  intentModelName: string;
};

export async function createScaffolding(opts: {
  token: string;
  responseModelOverride?: string;
  conversationId?: string;
}) {
  const redis = getRedis();
  let summarizer: ConversationSummaryService | undefined;
  try {
    summarizer = new ConversationSummaryService();
  } catch {
    // summarizer is optional
  }
  const keeper = new RecordKeeper(redis, summarizer ? { summarizer } : {});
  await keeper.closeIfIdle();

  const responseModelName = opts.responseModelOverride ?? getPrimaryModel("response");
  const intentModelName = getPrimaryModel("intent", { fallback: [responseModelName] });

  const { requestId, conversationId } = await keeper.startRequest(opts.token, responseModelName, {});
  const turnId = await keeper.startTurn(requestId, conversationId, opts.token, responseModelName);

  return { keeper, conversationId, requestId, turnId, responseModelName, intentModelName } satisfies AgentScaffolding;
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
    const candidate = message as { _getType?: () => string };
    if (candidate._getType?.() === "ai") return message;
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

export function mapChatMessages(input: OpenAIMessage[]) {
  return mapOpenAIToMessages(input);
}

export function mapCompletionPrompt(prompt: string): BaseMessage[] {
  return [new SystemMessage({ content: "" }), new HumanMessage({ content: prompt })];
}

export function summarizeToolOutputs(messages: BaseMessage[]) {
  return messages
    .filter((m) => (m as { _getType?: () => string })._getType?.() === "tool")
    .map((m) => {
      const id = (m as { tool_call_id?: string }).tool_call_id ?? "tool_call";
      const content = contentFromMessage(m) ?? "";
      return { id, content };
    });
}

export function isToolMessage(message: BaseMessage) {
  return (message as { _getType?: () => string })._getType?.() === "tool";
}


