import { User, UserStatus } from '../types/auth';

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
  search: {
    apiKey: string;
    apiUrl: string;
  };
  weather: {
    provider: "open-meteo" | "openweathermap" | "weatherapi";
    apiKey?: string; // Only for openweathermap and weatherapi
    apiUrl?: string; // Only for openweathermap and weatherapi
    forecastUrl?: string; // Only for open-meteo
    historicalUrl?: string; // Only for open-meteo
    timeoutMs?: number;
  };
  geocoding: {
    url: string;
    userAgent: string;
    email: string;
    referer: string;
  };
  homeAssistant?: {
    baseUrl: string;
    accessToken?: string;
  };
  plex?: {
    baseUrl: string;
    token: string;
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
    const defaultOptions: RequestInit = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const response = await fetch(url, {
      ...defaultOptions,
      ...options
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const error: APIError = new Error(
        errorText || `HTTP ${response.status}`
      );
      error.status = response.status;
      error.details = errorText;
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
    return this.request<AdminSettings>('/settings');
  }

  async getModelsSettings(): Promise<ModelsSettings> {
    return this.request<ModelsSettings>('/settings/models');
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
    return this.request<ModelsSettings>('/settings/models', {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  async listProviders(): Promise<ProviderType[]> {
    return this.request<ProviderType[]>('/providers');
  }

  async createProvider(body: Omit<ProviderType, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProviderType> {
    return this.request<ProviderType>('/providers', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  async getProvider(id: string): Promise<ProviderType> {
    return this.request<ProviderType>(`/providers/${id}`);
  }

  async updateProvider(id: string, body: Partial<Omit<ProviderType, 'id' | 'createdAt'>>): Promise<ProviderType> {
    return this.request<ProviderType>(`/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  async deleteProvider(id: string): Promise<void> {
    return this.request<void>(`/providers/${id}`, {
      method: 'DELETE'
    });
  }

  async testProvider(id: string): Promise<{
    status: 'working' | 'failed';
    error?: string;
    modelCount?: number;
    testedAt: string;
  }> {
    return this.request(`/providers/${id}/test`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  }

  async getProviderModels(id: string): Promise<ModelInfo[]> {
    return this.request<ModelInfo[]>(`/providers/${id}/models`);
  }

  async getServicesSettings(): Promise<ServicesSettings> {
    return this.request<ServicesSettings>('/settings/services');
  }

  async updateServicesSettings(body: ServicesSettings): Promise<ServicesSettings> {
    return this.request<ServicesSettings>('/settings/services', {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  async getOAuthSettings(): Promise<OAuthSettings> {
    return this.request<OAuthSettings>('/settings/oauth');
  }

  async updateOAuthSettings(body: OAuthSettings): Promise<OAuthSettings> {
    return this.request<OAuthSettings>('/settings/oauth', {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  async getBackupSettings(): Promise<BackupSettings> {
    return this.request<BackupSettings>('/settings/backups');
  }

  async updateBackupSettings(body: BackupSettings): Promise<BackupSettings> {
    return this.request<BackupSettings>('/settings/backups', {
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
    return this.request<void>('/auth/logout', {
      method: 'POST'
    });
  }


}

export const adminApiClient = new AdminApiClient();