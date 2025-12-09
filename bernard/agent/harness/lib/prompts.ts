import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";

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

export function ai(content: string, opts: { toolCalls?: unknown[] } = {}) {
  return new AIMessage({ content, ...(opts.toolCalls ? { tool_calls: opts.toolCalls } : {}) });
}

export function toolMessage(id: string, content: unknown, name?: string) {
  return new ToolMessage({
    tool_call_id: id,
    content: typeof content === "string" ? content : JSON.stringify(content),
    ...(name ? { name } : {})
  });
}


