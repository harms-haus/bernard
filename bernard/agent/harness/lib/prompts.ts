import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { AIMessageFields, BaseMessage } from "@langchain/core/messages";

export function turnToMessage(turn: BaseMessage): BaseMessage {
  return turn;
}

export function recentMessages(messages: BaseMessage[], count: number): BaseMessage[] {
  if (count <= 0) return [];
  return messages.slice(-count);
}

export function system(content: string) {
  return new SystemMessage({ content });
}

export function user(content: string) {
  return new HumanMessage({ content });
}

export function ai(content: string, opts: { toolCalls?: AIMessageFields["tool_calls"] } = {}) {
  const message: AIMessageFields = { content };
  if (opts.toolCalls) message.tool_calls = opts.toolCalls;
  return new AIMessage(message);
}

export function toolMessage(id: string, content: unknown, name?: string) {
  return new ToolMessage({
    tool_call_id: id,
    content: typeof content === "string" ? content : JSON.stringify(content),
    ...(name ? { name } : {})
  });
}



