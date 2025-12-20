import type { BaseMessage } from "@langchain/core/messages";
import type { OpenAIMessage } from "./messages";

export type ConversationStatus = "open" | "closed";
export type ConversationIndexingStatus = "none" | "queued" | "indexing" | "indexed" | "failed";
// SummaryFlags moved to summary.ts to avoid export conflict

/**
 * Archivist interface: Read-only access to conversation data
 * Harnesses receive this interface to retrieve context
 */
export interface Archivist {
  /**
   * Get messages for a conversation, optionally filtered by role
   */
  getMessages(
    conversationId: string,
    options?: {
      limit?: number;
      role?: "user" | "assistant" | "system" | "tool";
      since?: string; // ISO timestamp
    }
  ): Promise<MessageRecord[]>;

  /**
   * Get full conversation with messages
   */
  getFullConversation(conversationId: string): Promise<{
    records: MessageRecord[];
    messages: OpenAIMessage[];
  }>;

  /**
   * Get conversation metadata
   */
  getConversation(conversationId: string): Promise<Conversation | null>;
}

/**
 * Recorder interface: Write-only access to conversation data
 * Orchestrator uses this to record events
 */
export interface Recorder {
  /**
   * Record user or assistant messages
   */
  recordMessage(
    conversationId: string,
    message: BaseMessage | MessageRecord
  ): Promise<void>;

  /**
   * Record LLM call event (start)
   */
  recordLLMCallStart(
    conversationId: string,
    details: {
      messageId: string;
      model: string;
      context: BaseMessage[];
      requestId?: string;
      turnId?: string;
      stage?: string;
      tools?: unknown;
    }
  ): Promise<void>;

  /**
   * Record LLM call completion
   */
  recordLLMCallComplete(
    conversationId: string,
    details: {
      messageId: string;
      result: BaseMessage | MessageRecord;
      latencyMs?: number;
      tokens?: { in?: number; out?: number };
    }
  ): Promise<void>;

  /**
   * Record tool call event (start)
   */
  recordToolCallStart(
    conversationId: string,
    details: {
      toolCallId: string;
      toolName: string;
      arguments: string;
      messageId?: string; // Link to AI message that triggered this
    }
  ): Promise<void>;

  /**
   * Record tool call completion
   */
  recordToolCallComplete(
    conversationId: string,
    details: {
      toolCallId: string;
      result: string;
      latencyMs?: number;
    }
  ): Promise<void>;

  /**
   * Deduplicate and add messages to the historical record in proper placement.
   */
  syncHistory(
    conversationId: string,
    messages: BaseMessage[]
  ): Promise<void>;
}


export type ToolCallEntry = {
  id?: string;
  type?: string;
  name?: string;
  arguments?: unknown;
  args?: unknown;
  input?: unknown;
  function?: { name?: string; arguments?: unknown; args?: unknown };
  raw?: unknown;
  raw_arguments?: unknown;
  [key: string]: unknown;
};

export type MessageRecord = {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string | Record<string, unknown> | Array<Record<string, unknown>>;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallEntry[];
  createdAt: string;
  tokenDeltas?: { in?: number; out?: number };
  metadata?: Record<string, unknown>;
};

export type Conversation = {
  id: string;
  status: ConversationStatus;
  startedAt: string;
  lastTouchedAt: string;
  closedAt?: string;
  summary?: string;
  tags?: string[];
  flags?: { explicit?: boolean; forbidden?: boolean; summaryError?: boolean | string };
  modelSet?: string[];
  tokenSet?: string[];
  placeTags?: string[];
  keywords?: string[];
  closeReason?: string;
  messageCount?: number;
  userAssistantCount?: number;
  toolCallCount?: number;
  maxTurnLatencyMs?: number;
  requestCount?: number;
  lastRequestAt?: string;
  errorCount?: number;
  hasErrors?: boolean;
  indexingStatus?: ConversationIndexingStatus;
  indexingError?: string;
  indexingAttempts?: number;
};

export type ConversationStats = {
  messageCount: number;
  toolCallCount: number;
  requestCount?: number;
  lastRequestAt?: string;
};

export type ConversationWithStats = Conversation & ConversationStats;

export type Request = {
  id: string;
  conversationId: string;
  token: string;
  startedAt: string;
  latencyMs?: number;
  modelUsed?: string;
  initialPlace?: string;
  clientMeta?: Record<string, unknown>;
};

export type TurnStatus = "ok" | "error";

export type Turn = {
  id: string;
  requestId: string;
  conversationId: string;
  token: string;
  model: string;
  startedAt: string;
  latencyMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  toolCalls?: string;
  status?: TurnStatus;
  errorType?: string;
};

export type ToolResult = {
  ok: boolean;
  latencyMs: number;
  errorType?: string;
};

export type OpenRouterResult = {
  ok: boolean;
  latencyMs: number;
  errorType?: string;
  tokensIn?: number;
  tokensOut?: number;
};

export type RecordKeeperStatus = {
  namespace: string;
  metricsNamespace: string;
  idleMs: number;
  summarizerEnabled: boolean;
  activeConversations: number;
  closedConversations: number;
  totalRequests: number;
  totalTurns: number;
  errorTurns: number;
  tokensActive: number;
  lastActivityAt?: string;
};

export type RecallQuery = {
  conversationId?: string;
  token?: string;
  timeRange?: { since?: number; until?: number };
  keywords?: string[];
  place?: string;
  limit?: number;
  includeMessages?: boolean;
  messageLimit?: number;
};

export type RecallConversation = {
  conversation: Conversation;
  messages?: MessageRecord[];
};
