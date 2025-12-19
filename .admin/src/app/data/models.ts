export type HealthStatus = 'online' | 'degraded' | 'offline';

export type ModelInfo = {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
};

export type ProviderType = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string;
  testStatus?: 'untested' | 'working' | 'failed';
  testError?: string;
};

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

export type ModelCallOptions = {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
};

export type ModelCategorySettings = {
  primary: string;
  providerId: string;
  options?: ModelCallOptions;
};

export type ModelsSettings = {
  providers: ProviderType[];
  response: ModelCategorySettings;
  router: ModelCategorySettings;
  memory: ModelCategorySettings;
  utility: ModelCategorySettings;
  aggregation?: ModelCategorySettings;
};

export type MemoryServiceSettings = {
  embeddingModel?: string;
  embeddingBaseUrl?: string;
  embeddingApiKey?: string;
  indexName?: string;
  keyPrefix?: string;
  namespace?: string;
};

export type SearchServiceSettings = {
  apiKey?: string;
  apiUrl?: string;
};

export type WeatherServiceSettings = {
  apiKey?: string;
  apiUrl?: string;
  forecastUrl?: string;
  historicalUrl?: string;
  units?: 'metric' | 'imperial';
  timeoutMs?: number;
};

export type GeocodingServiceSettings = {
  url?: string;
  userAgent?: string;
  email?: string;
  referer?: string;
};

export type ServicesSettings = {
  memory: MemoryServiceSettings;
  search: SearchServiceSettings;
  weather: WeatherServiceSettings;
  geocoding: GeocodingServiceSettings;
};

export type OAuthClientSettings = {
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  redirectUri: string;
  scope: string;
  clientId: string;
  clientSecret?: string;
};

export type OAuthSettings = {
  google: OAuthClientSettings;
  github: OAuthClientSettings;
  default?: OAuthClientSettings;
};

export type BackupSettings = {
  debounceSeconds: number;
  directory: string;
  retentionDays: number;
  retentionCount: number;
};

export type AdminSettings = {
  models: ModelsSettings;
  services: ServicesSettings;
  oauth: OAuthSettings;
  backups: BackupSettings;
};

export type ConversationStatus = 'open' | 'closed';
export type ConversationIndexingStatus = 'none' | 'queued' | 'indexing' | 'indexed' | 'failed';

export type ConversationListItem = {
  id: string;
  status: ConversationStatus;
  summary?: string;
  startedAt: string;
  lastTouchedAt: string;
  closedAt?: string;
  lastRequestAt?: string;
  messageCount: number;
  userAssistantCount?: number;
  maxTurnLatencyMs?: number;
  toolCallCount: number;
  requestCount?: number;
  tags: string[];
  flags?: { explicit?: boolean; forbidden?: boolean; summaryError?: boolean | string };
  source: string;
  tokenNames: string[];
  tokenIds: string[];
  errorCount?: number;
  hasErrors?: boolean;
  indexingStatus?: ConversationIndexingStatus;
  indexingError?: string;
  indexingAttempts?: number;
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

export type Memory = {
  id: string;
  label: string;
  content: string;
  conversationId: string;
  createdAt: string;
  refreshedAt: string;
  freshnessMaxDays: number;
  successorId?: string;
};

export type CreateMemoryRequest = {
  label: string;
  content: string;
  conversationId: string;
};

export type UpdateMemoryRequest = Partial<Pick<CreateMemoryRequest, 'label' | 'content' | 'conversationId'>> & {
  successorId?: string | null;
  refresh?: boolean;
};

export type MemorizeResponse = {
  memory: Memory;
  outcome: 'created' | 'updated' | 'refreshed';
  predecessorId?: string;
};
