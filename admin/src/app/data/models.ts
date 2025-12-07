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

export interface ActivationSummary {
  id: string;
  type: 'model' | 'tool';
  toolName?: string;
  inputPreview: string;
  outputPreview: string;
  createdAt: string;
  durationMs?: number;
}

export interface Conversation {
  id: string;
  userLabel: string;
  createdAt: string;
  updatedAt: string;
  tokenId?: string;
  summary: string;
  messageCount: number;
  toolCallCount: number;
  status: 'completed' | 'running' | 'error';
  activations: ActivationSummary[];
}

export interface Paginated<T> {
  items: T[];
  nextCursor?: string;
  total?: number;
}

export interface HistoryQuery {
  search?: string;
  limit?: number;
  cursor?: string;
  status?: Conversation['status'];
}
