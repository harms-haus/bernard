import type { IncomingMessage } from "node:http";

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { AIMessageFields, BaseMessage, MessageStructure, MessageType } from "@langchain/core/messages";
import { jsonrepair } from "jsonrepair";

import { validateAccessToken, bearerToken } from "@/lib/auth/auth";

export type OpenAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<{ type: string; text?: string }> | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  function_call?: LegacyFunctionCall;
};

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type LegacyFunctionCall = {
  name: string;
  arguments: unknown;
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

const VALID_ROLES = new Set<OpenAIMessage["role"]>(["system", "user", "assistant", "tool"]);

/**
 * Narrow an unknown value to a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Detect ChatML markers anywhere within a message-like payload.
 */
function containsChatMLMarkers(value: unknown): boolean {
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

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [name, value] = part.trim().split('=');
    if (name && value) {
      cookies[name] = value;
    }
  }
  return cookies;
}

export async function validateAuth(req: IncomingMessage) {
  const authHeader = req.headers.authorization;
  const cookieHeader = req.headers.cookie;
  const cookies = parseCookies(cookieHeader);
  const sessionCookie = cookies["bernard_session"];
  
  // Try bearer token first, then session cookie
  const token = bearerToken(authHeader) || sessionCookie || "";
  
  if (!token) {
    return { error: { message: "Missing authentication token", status: 401 } };
  }
  
  const result = await validateAccessToken(token);
  if ("error" in result) {
    return result;
  }
  return { token: result.access.token, user: result.access.user };
}


export function isBernardModel(model?: string | null) {
  return !model || model === BERNARD_MODEL_ID;
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
  } catch {
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
 * Collect tool calls from messages and normalize to OpenAI format.
 */
export function collectToolCalls(messages: BaseMessage[]) {
  const calls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }> = [];
  for (const message of messages) {
    if (message instanceof AIMessage && Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls) {
        calls.push({
          id: call.id ?? `${call.name}_${calls.length}`,
          type: "function" as const,
          function: {
            name: call.name,
            arguments: typeof call.args === "string" ? call.args : JSON.stringify(call.args)
          }
        });
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

export function mapChatMessages(input: OpenAIMessage[]): BaseMessage<MessageStructure, MessageType>[] {
  return mapOpenAIToMessages(input);
}

export function mapCompletionPrompt(prompt: string): BaseMessage[] {
  return [new SystemMessage({ content: "" }), new HumanMessage({ content: prompt })];
}
