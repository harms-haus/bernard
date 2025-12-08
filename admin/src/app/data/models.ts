export type HealthStatus = 'online' | 'degraded' | 'offline';

export interface RecordKeeperStatus {
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
}

export interface BernardStatus {
  status: HealthStatus;
  uptimeSeconds: number;
  startedAt: string;
  version?: string;
  lastActivityAt?: string;
  lastMessageAt?: string;
  activeConversations: number;
  tokensActive: number;
  queueSize?: number;
  notes?: string;
  recordKeeper: RecordKeeperStatus;
}

export interface Token {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  status: 'active' | 'disabled';
  token?: string; // present only immediately after creation
}

export type CreateTokenRequest = {
  name: string;
};

export type UpdateTokenRequest = {
  name?: string;
  status?: Token['status'];
};

export interface ServiceConfig {
  id: 'openrouter' | 'redis' | 'search' | 'weather';
  name: string;
  description: string;
  apiKey?: string;
  options: Record<string, string | number | boolean>;
  updatedAt?: string;
}

export type UpdateServiceRequest = Partial<Pick<ServiceConfig, 'apiKey' | 'options'>>;

export type ConversationStatus = 'open' | 'closed';

export type ConversationListItem = {
  id: string;
  status: ConversationStatus;
  summary?: string;
  startedAt: string;
  lastTouchedAt: string;
  closedAt?: string;
  lastRequestAt?: string;
  messageCount: number;
  toolCallCount: number;
  requestCount?: number;
  tags: string[];
  flags?: { explicit?: boolean; forbidden?: boolean; summaryError?: boolean | string };
  source: string;
  tokenNames: string[];
  tokenIds: string[];
};

export type ConversationDetail = ConversationListItem & {
  modelSet?: string[];
  placeTags?: string[];
  keywords?: string[];
  closeReason?: string;
};

export type ToolCall = {
  id?: string;
  type?: string;
  name?: string;
  arguments?: unknown;
  args?: unknown;
  input?: unknown;
  function?: { name?: string; arguments?: unknown; args?: unknown };
  [key: string]: unknown;
};

export type ConversationMessage = {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Record<string, unknown> | Array<Record<string, unknown>>;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  createdAt: string;
  tokenDeltas?: { in?: number; out?: number };
  metadata?: Record<string, unknown>;
};

export interface HistoryQuery {
  limit?: number;
  includeOpen?: boolean;
  includeClosed?: boolean;
}

export type HistoryListResponse = {
  items: ConversationListItem[];
  total: number;
  activeCount: number;
  closedCount: number;
};

export type ConversationDetailResponse = {
  conversation: ConversationDetail;
  messages: ConversationMessage[];
};

export type UserStatus = 'active' | 'disabled' | 'deleted';

export type User = {
  id: string;
  displayName: string;
  isAdmin: boolean;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
};

export type CreateUserRequest = {
  id: string;
  displayName: string;
  isAdmin: boolean;
};

export type UpdateUserRequest = Partial<Pick<CreateUserRequest, 'displayName' | 'isAdmin'>> & {
  status?: Extract<UserStatus, 'active' | 'disabled'>;
};
