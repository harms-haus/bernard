import { User, UserStatus } from '@/types/auth';

export interface ProviderType {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
  testStatus?: 'working' | 'failed';
}

export interface ModelInfo {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface ModelCallOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export interface ModelCategorySettings {
  primary: string;
  providerId: string;
  options?: ModelCallOptions;
  dimension?: number;
}

export interface ModelsSettings {
  providers: ProviderType[];
  response: ModelCategorySettings;
  router: ModelCategorySettings;
  utility: ModelCategorySettings;
  aggregation: ModelCategorySettings;
  embedding: ModelCategorySettings;
}

export interface ConversationListItem {
  id: string;
  status: 'open' | 'closed';
  summary: string;
  startedAt: string;
  lastTouchedAt: string;
  lastRequestAt: string;
  messageCount: number;
  toolCallCount: number;
  requestCount: number;
  tags: string[];
  flags: { explicit: boolean; forbidden: boolean };
  source: string;
  tokenNames: string[];
  tokenIds: string[];
  modelSet: string[];
  placeTags: string[];
  keywords: string[];
  closeReason?: string;
  indexingStatus?: 'none' | 'queued' | 'indexing' | 'indexed' | 'failed';
  indexingError?: string;
  indexingAttempts?: number;
}

export interface ConversationDetail {
  id: string;
  status: 'open' | 'closed';
  summary: string;
  startedAt: string;
  lastTouchedAt: string;
  lastRequestAt: string;
  closedAt?: string;
  messageCount: number;
  toolCallCount: number;
  requestCount: number;
  tags: string[];
  flags: { explicit: boolean; forbidden: boolean };
  source: string;
  tokenNames: string[];
  tokenIds: string[];
  modelSet: string[];
  placeTags: string[];
  keywords: string[];
  closeReason?: string;
  indexingStatus?: 'none' | 'queued' | 'indexing' | 'indexed' | 'failed';
  indexingError?: string;
  indexingAttempts?: number;
  ghost?: boolean;
}

export interface ConversationMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Record<string, unknown> | Array<Record<string, unknown>>;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    name?: string;
    arguments?: unknown;
    args?: unknown;
    input?: unknown;
    function?: { name?: string; arguments?: unknown; args?: unknown };
  }>;
  createdAt: string;
  tokenDeltas?: { in?: number; out?: number };
  metadata?: Record<string, unknown>;
}

export interface ConversationDetailResponse {
  conversation: ConversationDetail;
  messages: ConversationMessage[];
}

export interface HistoryQuery {
  limit?: number;
  includeOpen?: boolean;
  includeClosed?: boolean;
}

export interface BernardStatus {
  status: 'online' | 'degraded' | 'offline';
  uptimeSeconds: number;
  startedAt: string;
  version: string;
  lastActivityAt: string;
  activeConversations: number;
  tokensActive: number;
  queueSize: number;
  notes?: string;
  recordKeeper?: RecordKeeperStatus;
}

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
  lastActivityAt: string;
}

export interface ServiceConfig {
  id: string;
  name: string;
  description: string;
  apiKey?: string;
  options: Record<string, unknown>;
  updatedAt: string;
}

export interface ServicesSettings {
  memory?: {
    embeddingModel?: string;
    embeddingBaseUrl?: string;
    embeddingApiKey?: string;
    indexName?: string;
    keyPrefix?: string;
    namespace?: string;
  };
  search?: {
    apiKey?: string;
    apiUrl?: string;
  };
  weather: {
    provider: "open-meteo" | "openweathermap" | "weatherapi";
    apiKey?: string;
    apiUrl?: string;
    forecastUrl?: string;
    historicalUrl?: string;
    timeoutMs?: number;
  };
  geocoding?: {
    url?: string;
    userAgent?: string;
    email?: string;
    referer?: string;
  };
  homeAssistant?: {
    baseUrl?: string;
    accessToken?: string;
  };
  plex?: {
    baseUrl?: string;
    token?: string;
  };
  kokoro?: {
    baseUrl?: string;
  };
  tts?: {
    baseUrl?: string;
    apiKey?: string;
  };
  stt?: {
    baseUrl?: string;
    apiKey?: string;
  };
  overseerr?: {
    baseUrl?: string;
    apiKey?: string;
  };
  infrastructure?: {
    redisUrl?: string;
    queuePrefix?: string;
    taskQueueName?: string;
    taskWorkerConcurrency?: number;
    taskMaxRuntimeMs?: number;
    taskAttempts?: number;
    taskBackoffMs?: number;
    taskKeepCompleted?: number;
    taskKeepFailed?: number;
    taskArchiveAfterDays?: number;
  };
}

export interface OAuthSettings {
  google: {
    authUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
    redirectUri: string;
    scope: string;
    clientId: string;
    clientSecret: string;
  };
  github: {
    authUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
    redirectUri: string;
    scope: string;
    clientId: string;
    clientSecret: string;
  };
}

export interface BackupSettings {
  debounceSeconds: number;
  directory: string;
  retentionDays: number;
  retentionCount: number;
}

export interface LimitsSettings {
  currentRequestMaxTokens: number;
  responseMaxTokens: number;
  allowSignups: boolean;
}

export interface AutomationInfo {
  id: string;
  name: string;
  description: string;
  hooks: string[];
  enabled: boolean;
  lastRunTime?: number;
  lastRunDuration?: number;
  runCount: number;
}

export interface AutomationSettings {
  enabled: boolean;
  lastRunTime?: number;
  lastRunDuration?: number;
  runCount: number;
}

export interface AdminSettings {
  models: ModelsSettings;
  services: ServicesSettings;
  oauth: OAuthSettings;
  backups: BackupSettings;
}



export interface CreateTokenRequest {
  name: string;
}

export interface UpdateTokenRequest {
  name?: string;
  status?: 'active' | 'disabled';
}

export interface Token {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  status: 'active' | 'disabled';
  token?: string;
}

export interface CreateUserRequest {
  id: string;
  displayName: string;
  isAdmin: boolean;
}

export interface UpdateUserRequest {
  displayName?: string;
  isAdmin?: boolean;
  status?: UserStatus;
}

export interface UpdateServiceRequest {
  name?: string;
  description?: string;
  apiKey?: string;
  options?: Record<string, unknown>;
}

export interface APIError extends Error {
  status?: number;
  details?: unknown;
}

class AdminApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {};

    // Only set Content-Type if there's a body
    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      credentials: 'include',
      headers: { ...headers, ...options.headers },
      ...options
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const error = Object.assign(new Error(errorText || `HTTP ${response.status}`), {
        status: response.status,
        details: errorText,
      }) as APIError;
      throw error;
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // Status endpoints
  async getStatus(): Promise<BernardStatus> {
    return this.request<BernardStatus>('/status');
  }

  async getRecordKeeperStatus(): Promise<RecordKeeperStatus> {
    const response = await this.request<{ status: RecordKeeperStatus }>('/recordkeeper/status');
    return response.status;
  }

  // Token management
  async listTokens(): Promise<Token[]> {
    const response = await this.request<{ tokens: Token[] }>('/tokens');
    return response.tokens || [];
  }

  async createToken(body: CreateTokenRequest): Promise<Token> {
    const response = await this.request<{ token: Token }>('/tokens', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    return response.token;
  }

  async updateToken(id: string, body: UpdateTokenRequest): Promise<Token> {
    const response = await this.request<{ token: Token }>(`/tokens/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
    return response.token;
  }

  async deleteToken(id: string): Promise<void> {
    return this.request<void>(`/tokens/${id}`, {
      method: 'DELETE'
    });
  }

  // Service management
  async listServices(): Promise<ServiceConfig[]> {
    return this.request<ServiceConfig[]>('/services');
  }

  async updateService(id: string, body: UpdateServiceRequest): Promise<ServiceConfig> {
    return this.request<ServiceConfig>(`/services/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  // History management
  async listHistory(query?: HistoryQuery): Promise<{
    items: ConversationListItem[];
    total: number;
    activeCount: number;
    closedCount: number;
  }> {
    const params = new URLSearchParams();
    if (query?.limit) params.append('limit', String(query.limit));
    if (query?.includeOpen === false) params.append('includeOpen', 'false');
    if (query?.includeClosed === false) params.append('includeClosed', 'false');

    const queryString = params.toString();
    const endpoint = `/admin/history${queryString ? `?${queryString}` : ''}`;
    return this.request(endpoint);
  }

  async getConversation(id: string, messageLimit?: number): Promise<ConversationDetailResponse> {
    const params = messageLimit ? `?messageLimit=${messageLimit}` : '';
    return this.request<ConversationDetailResponse>(`/admin/history/${id}${params}`);
  }

  async closeConversation(id: string): Promise<ConversationDetail> {
    const response = await this.request<{ conversation: ConversationDetail }>(`/admin/history/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ttl: 0 })
    });
    return response.conversation;
  }

  async deleteConversation(id: string): Promise<void> {
    return this.request<void>(`/admin/history/${id}`, {
      method: 'DELETE'
    });
  }

  async getIndexingStatus(id: string): Promise<{
    indexingStatus: 'none' | 'queued' | 'indexing' | 'indexed' | 'failed';
    indexingError?: string;
    indexingAttempts?: number;
  }> {
    return this.request(`/conversations/${id}/indexing-status`);
  }

  async retryIndexing(id: string): Promise<{
    success: boolean;
    indexingStatus: 'none' | 'queued' | 'indexing' | 'indexed' | 'failed';
    message: string;
  }> {
    return this.request(`/conversations/${id}/retry-indexing`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  }

  async cancelIndexing(id: string): Promise<{
    success: boolean;
    indexingStatus: 'none' | 'queued' | 'indexing' | 'indexed' | 'failed';
    message: string;
  }> {
    return this.request(`/conversations/${id}/cancel-indexing`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  }


  // Settings management
  async getSettings(): Promise<AdminSettings> {
    const [models, services, oauth, backups, limits] = await Promise.all([
      this.getModelsSettings(),
      this.getServicesSettings(),
      this.getOAuthSettings(),
      this.getBackupSettings(),
      this.getLimitsSettings(),
    ]);
    return { models, services, oauth, backups };
  }

  async getModelsSettings(): Promise<ModelsSettings> {
    return this.request<ModelsSettings>('/admin/models');
  }

  // Automation management
  async getAutomations(): Promise<{ automations: AutomationInfo[] }> {
    return this.request<{ automations: AutomationInfo[] }>('/admin/automations');
  }

  async updateAutomation(id: string, enabled: boolean): Promise<AutomationSettings> {
    return this.request<AutomationSettings>(`/admin/automations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled })
    });
  }

  async updateModelsSettings(body: ModelsSettings): Promise<ModelsSettings> {
    return this.request<ModelsSettings>('/admin/models', {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  async listProviders(): Promise<ProviderType[]> {
    return this.request<ProviderType[]>('/admin/providers');
  }

  async createProvider(body: Omit<ProviderType, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProviderType> {
    return this.request<ProviderType>('/admin/providers', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  async getProvider(id: string): Promise<ProviderType> {
    return this.request<ProviderType>(`/admin/providers/${id}`);
  }

  async updateProvider(id: string, body: Partial<Omit<ProviderType, 'id' | 'createdAt'>>): Promise<ProviderType> {
    return this.request<ProviderType>(`/admin/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  async deleteProvider(id: string): Promise<void> {
    return this.request<void>(`/admin/providers/${id}`, {
      method: 'DELETE'
    });
  }

  async testProvider(id: string): Promise<{
    status: 'working' | 'failed';
    error?: string;
    modelCount?: number;
    testedAt: string;
  }> {
    return this.request(`/admin/providers/${id}/test`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  }

  async getProviderModels(id: string): Promise<ModelInfo[]> {
    return this.request<ModelInfo[]>(`/admin/providers/${id}/models`);
  }

  async getServicesSettings(): Promise<ServicesSettings> {
    const response = await this.request<{ success: boolean; data: ServicesSettings }>('/admin/services');
    if (response && typeof response === 'object' && 'data' in response) {
      return (response as { data: ServicesSettings }).data;
    }
    return response as ServicesSettings;
  }

  async updateServicesSettings(body: ServicesSettings): Promise<ServicesSettings> {
    const response = await this.request<{ success: boolean; data: ServicesSettings }>('/admin/services', {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    if (response && typeof response === 'object' && 'data' in response) {
      return (response as { data: ServicesSettings }).data;
    }
    return response as ServicesSettings;
  }

  async testHomeAssistantConnection(settings: {
    baseUrl: string;
    accessToken?: string;
  }): Promise<{
    status: 'success' | 'failed';
    error?: string;
    errorType?: 'configuration' | 'unauthorized' | 'connection' | 'server_error' | 'unknown';
    message?: string;
    testedAt: string;
  }> {
    return this.request('/admin/services/test/home-assistant', {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  }

  async testPlexConnection(settings: {
    baseUrl: string;
    token: string;
  }): Promise<{
    status: 'success' | 'failed';
    error?: string;
    errorType?: 'configuration' | 'unauthorized' | 'connection' | 'server_error' | 'unknown';
    message?: string;
    machineIdentifier?: string;
    testedAt: string;
  }> {
    return this.request('/admin/services/test/plex', {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  }

  async testTtsConnection(settings: {
    baseUrl: string;
    apiKey?: string;
  }): Promise<{
    status: 'success' | 'failed';
    error?: string;
    errorType?: 'configuration' | 'unauthorized' | 'connection' | 'server_error' | 'unknown';
    message?: string;
    testedAt: string;
  }> {
    return this.request('/admin/services/test/tts', {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  }

  async testSttConnection(settings: {
    baseUrl: string;
    apiKey?: string;
  }): Promise<{
    status: 'success' | 'failed';
    error?: string;
    errorType?: 'configuration' | 'unauthorized' | 'connection' | 'server_error' | 'unknown';
    message?: string;
    testedAt: string;
  }> {
    return this.request('/admin/services/test/stt', {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  }

  async testOverseerrConnection(settings: {
    baseUrl: string;
    apiKey: string;
  }): Promise<{
    status: 'success' | 'failed';
    error?: string;
    errorType?: 'configuration' | 'unauthorized' | 'connection' | 'server_error' | 'unknown';
    message?: string;
    testedAt: string;
  }> {
    return this.request('/admin/services/test/overseerr', {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  }

  async getOAuthSettings(): Promise<OAuthSettings> {
    return this.request<OAuthSettings>('/admin/oauth');
  }

  async updateOAuthSettings(body: OAuthSettings): Promise<OAuthSettings> {
    return this.request<OAuthSettings>('/admin/oauth', {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  async getBackupSettings(): Promise<BackupSettings> {
    return this.request<BackupSettings>('/admin/backups');
  }

  async updateBackupSettings(body: BackupSettings): Promise<BackupSettings> {
    return this.request<BackupSettings>('/admin/backups', {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  async getLimitsSettings(): Promise<LimitsSettings> {
    return this.request<LimitsSettings>('/admin/limits');
  }

  async updateLimitsSettings(body: LimitsSettings): Promise<LimitsSettings> {
    return this.request<LimitsSettings>('/admin/limits', {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  // User management
  async listUsers(): Promise<User[]> {
    const response = await this.request<{ users: User[] }>('/users');
    return response.users || [];
  }

  async createUser(body: CreateUserRequest): Promise<User> {
    const response = await this.request<{ user: User }>('/users', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    return response.user;
  }

  async updateUser(id: string, body: UpdateUserRequest): Promise<User> {
    const response = await this.request<{ user: User }>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
    return response.user;
  }

  async deleteUser(id: string): Promise<User> {
    const response = await this.request<{ user: User }>(`/users/${id}`, {
      method: 'DELETE'
    });
    return response.user;
  }

  async resetUser(id: string): Promise<void> {
    return this.request<void>(`/users/${id}/reset`, {
      method: 'POST'
    });
  }

  async clearEntireIndex(): Promise<{
    success: boolean;
    conversationsQueued: number;
    keysDeleted: number;
  }> {
    return this.request('/admin/clear-entire-index', {
      method: 'POST'
    });
  }

  async triggerAutomation(conversationId: string, automationId: string): Promise<{
    success: boolean;
    message: string;
    conversationId: string;
    automationId: string;
  }> {
    return this.request(`/conversations/${conversationId}/trigger-automation/${automationId}`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  }

  async logout(): Promise<void> {
    return this.request<void>('/api/auth/sign-out', {
      method: 'POST'
    });
  }

}

export const adminApiClient = new AdminApiClient();