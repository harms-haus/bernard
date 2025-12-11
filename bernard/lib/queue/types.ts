export const CONVERSATION_TASKS = {
  index: "conversation:index",
  summary: "conversation:summary",
  flag: "conversation:flag"
} as const;

export type ConversationTaskName = (typeof CONVERSATION_TASKS)[keyof typeof CONVERSATION_TASKS];

export type ConversationTaskPayload = {
  conversationId: string;
};

export function buildConversationJobId(name: ConversationTaskName, conversationId: string): string {
  return `${name}:${conversationId}`;
}

export function isConversationPayload(data: unknown): data is ConversationTaskPayload {
  return Boolean(data && typeof data === "object" && typeof (data as { conversationId?: unknown }).conversationId === "string");
}
