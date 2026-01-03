import type { ClientTool, ServerTool } from "@langchain/core/tools";
import type { BaseMessage, ContentBlock } from "langchain";

export type TracerEvent = "request_start" | "request_end" | "request_error" | "user_message" | "llm_call_start" | "llm_call_complete" | "llm_call_error" | "tool_call_start" | "tool_call_complete" | "tool_call_error" | "assistant_message" | "recollection";

export type requestStartData = {
  type: "request_start";
  id: string;
  conversationId?: string | undefined;
  model: string;
  agent: string;
  messages: BaseMessage[];
};

export type requestEndData = {
  type: "request_end";
  id: string;
  conversationId?: string | undefined;
  model: string;
  agent: string;
  messages: BaseMessage[];
};

export type requestErrorData = {
  type: "request_error";
  id: string;
  conversationId?: string | undefined;
  model: string;
  agent: string;
  messages: BaseMessage[];
  error: string;
};
export type recollectionsData = {
  type: "recollection";
  recollections: {
    id: string;
    conversationId?: string | undefined;
    content: string | (ContentBlock | ContentBlock.Text)[] | undefined;
  }[];
};

export type userMessageData = {
  type: "user_message";
  id: string;
  conversationId?: string | undefined;
  content: string | (ContentBlock | ContentBlock.Text)[] | undefined;
};

export type llmCallStartData = {
  type: "llm_call_start";
  id: string;
  conversationId?: string | undefined;
  model: string;
  agent: string;
  messages: BaseMessage[];
  tools?: (ServerTool | ClientTool)[] | undefined;
};

export type llmCallCompleteData = {
  type: "llm_call_complete";
  id: string;
  conversationId?: string | undefined;
  model: string;
  agent: string;
  content: string | (ContentBlock | ContentBlock.Text)[] | undefined;
  duration: number;
};

export type llmCallErrorData = {
  type: "llm_call_error";
  id: string;
  conversationId?: string | undefined;
  model: string;
  agent: string;
  error: string;
  duration: number;
};

export type toolCallStartData = {
  type: "tool_call_start";
  id: string;
  conversationId?: string | undefined;
  name: string;
  arguments: Record<string, unknown>;
};

export type toolCallCompleteData = {
  type: "tool_call_complete";
  id: string;
  conversationId?: string | undefined;
  name: string;
  result: string | (ContentBlock | ContentBlock.Text)[] | undefined;
  duration: number;
};

export type toolCallErrorData = {
  type: "tool_call_error";
  id: string;
  conversationId?: string | undefined;
  name: string;
  error: string;
  duration: number;
};

export type assistantMessageData = {
  type: "assistant_message";
  id: string;
  conversationId?: string | undefined;
  content: string | (ContentBlock | ContentBlock.Text)[] | undefined;
};

export type requestCompleteData = {
  type: "request_stop";
  id: string;
  conversationId?: string | undefined;
  model: string;
  agent: string;
  messages: BaseMessage[];
};

export type onEventData = 
  requestStartData |
  requestEndData |
  requestErrorData |
  recollectionsData |
  userMessageData |
  llmCallStartData |
  llmCallCompleteData |
  llmCallErrorData |
  toolCallStartData |
  toolCallCompleteData |
  toolCallErrorData |
  assistantMessageData |
  requestCompleteData;

export interface Tracer {
  requestStart(data: Omit<requestStartData, "type">): void;

  recollections(data: Omit<recollectionsData, "type">): void;

  userMessage(data: Omit<userMessageData, "type">): void;

  llmCallStart(data: Omit<llmCallStartData, "type">): void;

  llmCallComplete(data: Omit<llmCallCompleteData, "type">): void;

  llmCallError(data: Omit<llmCallErrorData, "type">): void;

  toolCallStart(data: Omit<toolCallStartData, "type">): void;

  toolCallComplete(data: Omit<toolCallCompleteData, "type">): void;

  toolCallError(data: Omit<toolCallErrorData, "type">): void;

  assistantMessage(data: Omit<assistantMessageData, "type">): void;

  requestComplete(data: Omit<requestCompleteData, "type">): void;

  requestError(data: Omit<requestErrorData, "type">): void;

  onEvent(callback: (data: onEventData) => void): void;
}