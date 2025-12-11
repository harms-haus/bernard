export type ConversationStatus = "open" | "closed";

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
