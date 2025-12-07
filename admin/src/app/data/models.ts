export type HealthStatus = 'online' | 'degraded' | 'offline';

export interface BernardStatus {
  status: HealthStatus;
  uptimeSeconds: number;
  startedAt: string;
  version?: string;
  lastMessageAt?: string;
  activeConversations: number;
  tokensActive: number;
  queueSize?: number;
  notes?: string;
}

export interface TokenUsage {
  window: '24h' | '7d' | '30d';
  calls: number;
  promptTokens: number;
  completionTokens: number;
  lastUsedAt?: string;
}

export interface Token {
  id: string;
  name: string;
  createdAt: string;
  metadata?: Record<string, string>;
  lastUsedAt?: string;
  usage: TokenUsage;
  status: 'active' | 'revoked';
}

export type CreateTokenRequest = {
  name: string;
  metadata?: Record<string, string>;
};

export type UpdateTokenRequest = {
  name?: string;
  metadata?: Record<string, string>;
  status?: 'active' | 'revoked';
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
