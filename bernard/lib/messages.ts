import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { AIMessageFields, BaseMessage } from "@langchain/core/messages";

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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function parseToolInput(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
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
    const candidate = message as { _getType?: () => string };
    if (candidate._getType?.() === "ai") return message;
    // LangChain sometimes uses `getType`
    const getType = (message as { getType?: () => string }).getType;
    if (getType?.() === "ai") return message;
  }
  return null;
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

export function toOpenAIChatMessage(messages: BaseMessage[]) {
  const lastAssistant = findLastAssistantMessage(messages);
  const toolCalls = collectToolCalls(messages);
  return {
    role: "assistant" as const,
    content: contentFromMessage(lastAssistant) ?? "",
    ...(toolCalls.length ? { tool_calls: toolCalls } : {})
  };
}

export function extractTokenUsage(result: unknown): TokenUsage {
  if (!result || typeof result !== "object") return {};
  const withUsage = result as {
    response_metadata?: { token_usage?: TokenUsage };
    usage_metadata?: TokenUsage;
  };
  return withUsage.response_metadata?.token_usage ?? withUsage.usage_metadata ?? {};
}

export function extractUsageFromMessages(messages: BaseMessage[]) {
  const assistant = findLastAssistantMessage(messages);
  if (!assistant) return {};
  return extractTokenUsage(assistant);
}

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
            const name = call.function.name ?? "tool_call";
            const fallbackId = `${name}_${toolCalls.length}`;
            const id = typeof call.id === "string" && call.id.trim() ? call.id : fallbackId;
            const rawArgs = call.function.arguments;
            const parsedArgs = parseToolInput(rawArgs);
            const argsObject: Record<string, unknown> = isRecord(parsedArgs) ? parsedArgs : { value: parsedArgs };

            toolCalls.push({
              id,
              type: "tool_call",
              name,
              args: argsObject,
              function: {
                name,
                arguments: typeof rawArgs === "string" ? rawArgs : safeStringify(rawArgs)
              }
            } as LangGraphToolCall);
          }
        }

        if (msg.function_call) {
          const rawArgs = msg.function_call.arguments;
          const parsedArgs = parseToolInput(rawArgs);
        const argsObject: Record<string, unknown> = isRecord(parsedArgs) ? parsedArgs : { value: parsedArgs };

          toolCalls.push({
            id: msg.function_call.name ?? "function_call",
            type: "tool_call",
            name: msg.function_call.name,
          args: argsObject,
            function: {
              name: msg.function_call.name,
              arguments: typeof rawArgs === "string" ? rawArgs : safeStringify(rawArgs)
            }
          } as LangGraphToolCall);
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

export function extractMessagesFromChunk(chunk: unknown): BaseMessage[] | null {
  if (!chunk || typeof chunk !== "object") return null;

  const direct = (chunk as { messages?: unknown }).messages;
  if (Array.isArray(direct)) return direct as BaseMessage[];

  const data = (chunk as { data?: Record<string, unknown> }).data;
  if (!data || typeof data !== "object") return null;
  if (Array.isArray((data as { messages?: unknown }).messages)) return (data as { messages?: BaseMessage[] }).messages;
  const agent = (data as { agent?: { messages?: BaseMessage[] } }).agent;
  if (agent && Array.isArray(agent.messages)) return agent.messages;
  const tools = (data as { tools?: { messages?: BaseMessage[] } }).tools;
  if (tools && Array.isArray(tools.messages)) return tools.messages;
  return null;
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


