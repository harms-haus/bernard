import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, InjectionToken, Provider } from '@angular/core';
import { delay, map, Observable, of } from 'rxjs';

import { environment } from '../config/environment';
import {
  AdminSettings,
  BernardStatus,
  ConversationDetail,
  ConversationDetailResponse,
  ConversationListItem,
  ConversationMessage,
  CreateMemoryRequest,
  CreateTokenRequest,
  CreateUserRequest,
  HistoryQuery,
  HistoryListResponse,
  Memory,
  ModelsSettings,
  OAuthSettings,
  RecordKeeperStatus,
  ServiceConfig,
  ServicesSettings,
  Token,
  UpdateMemoryRequest,
  UpdateServiceRequest,
  UpdateTokenRequest,
  UpdateUserRequest,
  User,
  BackupSettings,
  ConversationIndexingStatus
} from './models';

/**
 * REST contracts (backend to align with):
 * - GET    /api/status                      -> BernardStatus (includes recordKeeper)
 * - GET    /api/recordkeeper/status         -> { status: RecordKeeperStatus }
 * - GET    /api/tokens                      -> { tokens: Token[] }
 * - POST   /api/tokens                      -> Token (CreateTokenRequest) // includes secret once
 * - GET    /api/tokens/:id                  -> { token: Token }
 * - PATCH  /api/tokens/:id                  -> { token: Token }
 * - DELETE /api/tokens/:id                  -> { removed: boolean }
 * - GET    /api/services                    -> ServiceConfig[]
 * - PUT    /api/services/:id                -> ServiceConfig (UpdateServiceRequest)
 * - GET    /api/admin/history               -> HistoryListResponse
 * - GET    /api/admin/history/:id           -> ConversationDetailResponse
 * - PATCH  /api/admin/history/:id           -> { conversation: ConversationDetail } // body: { ttl: 0 }
 * - DELETE /api/admin/history/:id           -> { removed: boolean }
 * - GET    /api/auth/me                     -> { user: User | null }
 * - POST   /api/auth/logout                 -> 204
 * - GET    /api/users                       -> { users: User[] }
 * - POST   /api/users                       -> { user: User }
 * - PATCH  /api/users/:id                   -> { user: User }
 * - DELETE /api/users/:id                   -> { user: User }
 * - POST   /api/users/:id/reset             -> { reset: true }
 */
export interface ApiClient {
  getStatus(): Observable<BernardStatus>;
  getRecordKeeperStatus(): Observable<RecordKeeperStatus>;
  listTokens(): Observable<Token[]>;
  createToken(body: CreateTokenRequest): Observable<Token>;
  updateToken(id: string, body: UpdateTokenRequest): Observable<Token>;
  deleteToken(id: string): Observable<void>;
  listServices(): Observable<ServiceConfig[]>;
  updateService(id: string, body: UpdateServiceRequest): Observable<ServiceConfig>;
  listHistory(query?: HistoryQuery): Observable<HistoryListResponse>;
  getConversation(id: string, messageLimit?: number): Observable<ConversationDetailResponse>;
  closeConversation(id: string): Observable<ConversationDetail>;
  deleteConversation(id: string): Observable<void>;
  getIndexingStatus(id: string): Observable<{ indexingStatus: ConversationIndexingStatus; indexingError?: string; indexingAttempts?: number }>;
  retryIndexing(id: string): Observable<{ success: boolean; indexingStatus: ConversationIndexingStatus; message: string }>;
  cancelIndexing(id: string): Observable<{ success: boolean; indexingStatus: ConversationIndexingStatus; message: string }>;
  listMemories(): Observable<Memory[]>;
  createMemory(body: CreateMemoryRequest): Observable<Memory>;
  updateMemory(id: string, body: UpdateMemoryRequest): Observable<Memory>;
  refreshMemory(id: string): Observable<Memory>;
  deleteMemory(id: string): Observable<void>;
  getSettings(): Observable<AdminSettings>;
  getModelsSettings(): Observable<ModelsSettings>;
  updateModelsSettings(body: ModelsSettings): Observable<ModelsSettings>;
  getServicesSettings(): Observable<ServicesSettings>;
  updateServicesSettings(body: ServicesSettings): Observable<ServicesSettings>;
  getOAuthSettings(): Observable<OAuthSettings>;
  updateOAuthSettings(body: OAuthSettings): Observable<OAuthSettings>;
  getBackupSettings(): Observable<BackupSettings>;
  updateBackupSettings(body: BackupSettings): Observable<BackupSettings>;
  getMe(): Observable<User | null>;
  listUsers(): Observable<User[]>;
  createUser(body: CreateUserRequest): Observable<User>;
  updateUser(id: string, body: UpdateUserRequest): Observable<User>;
  deleteUser(id: string): Observable<User>;
  resetUser(id: string): Observable<void>;
  logout(): Observable<void>;
}

export const API_CLIENT = new InjectionToken<ApiClient>('API_CLIENT');

export const provideApiClient = (): Provider => ({
  provide: API_CLIENT,
  deps: [HttpClient],
  useFactory: (http: HttpClient): ApiClient => {
    if (environment.useMocks) {
      return new MockApiClient();
    }
    return new HttpApiClient(http, environment.apiBaseUrl);
  }
});

class HttpApiClient implements ApiClient {
  constructor(
    private readonly http: HttpClient,
    private readonly baseUrl: string
  ) {}

  private options() {
    return { withCredentials: true };
  }

  getStatus() {
    return this.http.get<BernardStatus>(`${this.baseUrl}/status`, this.options());
  }

  getRecordKeeperStatus() {
    return this.http
      .get<{ status: RecordKeeperStatus }>(`${this.baseUrl}/recordkeeper/status`, this.options())
      .pipe(map((res) => res.status));
  }

  listTokens() {
    return this.http
      .get<{ tokens: Token[] }>(`${this.baseUrl}/tokens`, this.options())
      .pipe(map((res) => res.tokens ?? []));
  }

  createToken(body: CreateTokenRequest) {
    return this.http.post<Token>(`${this.baseUrl}/tokens`, body, this.options());
  }

  updateToken(id: string, body: UpdateTokenRequest) {
    return this.http
      .patch<{ token: Token }>(`${this.baseUrl}/tokens/${id}`, body, this.options())
      .pipe(map((res) => res.token));
  }

  deleteToken(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/tokens/${id}`, this.options());
  }

  listServices() {
    return this.http.get<ServiceConfig[]>(`${this.baseUrl}/services`, this.options());
  }

  updateService(id: string, body: UpdateServiceRequest) {
    return this.http.put<ServiceConfig>(`${this.baseUrl}/services/${id}`, body, this.options());
  }

  listHistory(query?: HistoryQuery) {
    const params = new HttpParams({
      fromObject: {
        limit: query?.limit ? String(query.limit) : '',
        includeOpen: query?.includeOpen === false ? 'false' : 'true',
        includeClosed: query?.includeClosed === false ? 'false' : 'true'
      }
    });

    return this.http.get<HistoryListResponse>(`${this.baseUrl}/admin/history`, {
      ...this.options(),
      params
    });
  }

  getConversation(id: string, messageLimit?: number) {
    const params = new HttpParams({
      fromObject: {
        messageLimit: messageLimit ? String(messageLimit) : ''
      }
    });

    return this.http.get<ConversationDetailResponse>(`${this.baseUrl}/admin/history/${id}`, {
      ...this.options(),
      params
    });
  }

  closeConversation(id: string) {
    return this.http
      .patch<{ conversation: ConversationDetail }>(`${this.baseUrl}/admin/history/${id}`, { ttl: 0 }, this.options())
      .pipe(map((res) => res.conversation));
  }

  deleteConversation(id: string) {
    return this.http
      .delete<{ removed: boolean }>(`${this.baseUrl}/admin/history/${id}`, this.options())
      .pipe(map(() => void 0));
  }

  getIndexingStatus(id: string) {
    return this.http.get<{ indexingStatus: ConversationIndexingStatus; indexingError?: string; indexingAttempts?: number }>(
      `${this.baseUrl}/conversations/${id}/indexing-status`, 
      this.options()
    );
  }

  retryIndexing(id: string) {
    return this.http.post<{ success: boolean; indexingStatus: ConversationIndexingStatus; message: string }>(
      `${this.baseUrl}/conversations/${id}/retry-indexing`, 
      {}, 
      this.options()
    );
  }

  cancelIndexing(id: string) {
    return this.http.post<{ success: boolean; indexingStatus: ConversationIndexingStatus; message: string }>(
      `${this.baseUrl}/conversations/${id}/cancel-indexing`, 
      {}, 
      this.options()
    );
  }

  listMemories() {
    return this.http
      .get<{ memories: Memory[] }>(`${this.baseUrl}/memories`, this.options())
      .pipe(map((res) => res.memories ?? []));
  }

  createMemory(body: CreateMemoryRequest) {
    return this.http
      .post<{ memory: Memory }>(`${this.baseUrl}/memories`, body, this.options())
      .pipe(map((res) => res.memory));
  }

  updateMemory(id: string, body: UpdateMemoryRequest) {
    return this.http
      .patch<{ memory: Memory }>(`${this.baseUrl}/memories/${id}`, body, this.options())
      .pipe(map((res) => res.memory));
  }

  refreshMemory(id: string) {
    return this.updateMemory(id, { refresh: true });
  }

  deleteMemory(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/memories/${id}`, this.options());
  }

  getSettings() {
    return this.http.get<AdminSettings>(`${this.baseUrl}/settings`, this.options());
  }

  getModelsSettings() {
    return this.http.get<ModelsSettings>(`${this.baseUrl}/settings/models`, this.options());
  }

  updateModelsSettings(body: ModelsSettings) {
    return this.http.put<ModelsSettings>(`${this.baseUrl}/settings/models`, body, this.options());
  }

  getServicesSettings() {
    return this.http.get<ServicesSettings>(`${this.baseUrl}/settings/services`, this.options());
  }

  updateServicesSettings(body: ServicesSettings) {
    return this.http.put<ServicesSettings>(`${this.baseUrl}/settings/services`, body, this.options());
  }

  getOAuthSettings() {
    return this.http.get<OAuthSettings>(`${this.baseUrl}/settings/oauth`, this.options());
  }

  updateOAuthSettings(body: OAuthSettings) {
    return this.http.put<OAuthSettings>(`${this.baseUrl}/settings/oauth`, body, this.options());
  }

  getBackupSettings() {
    return this.http.get<BackupSettings>(`${this.baseUrl}/settings/backups`, this.options());
  }

  updateBackupSettings(body: BackupSettings) {
    return this.http.put<BackupSettings>(`${this.baseUrl}/settings/backups`, body, this.options());
  }

  getMe() {
    return this.http
      .get<{ user: User | null }>(`${this.baseUrl}/auth/me`, this.options())
      .pipe(map((res) => res.user ?? null));
  }

  listUsers() {
    return this.http
      .get<{ users: User[] }>(`${this.baseUrl}/users`, this.options())
      .pipe(map((res) => res.users ?? []));
  }

  createUser(body: CreateUserRequest) {
    return this.http.post<{ user: User }>(`${this.baseUrl}/users`, body, this.options()).pipe(map((res) => res.user));
  }

  updateUser(id: string, body: UpdateUserRequest) {
    return this.http
      .patch<{ user: User }>(`${this.baseUrl}/users/${id}`, body, this.options())
      .pipe(map((res) => res.user));
  }

  deleteUser(id: string) {
    return this.http
      .delete<{ user: User }>(`${this.baseUrl}/users/${id}`, this.options())
      .pipe(map((res) => res.user));
  }

  resetUser(id: string) {
    return this.http.post<void>(`${this.baseUrl}/users/${id}/reset`, {}, this.options());
  }

  logout() {
    return this.http.post<void>(`${this.baseUrl}/auth/logout`, {}, this.options());
  }
}

class MockApiClient implements ApiClient {
  private readonly status: BernardStatus = {
    status: 'online',
    uptimeSeconds: 86_400 + 3200,
    startedAt: new Date(Date.now() - 89_600_000).toISOString(),
    version: '0.1.0',
    lastActivityAt: new Date().toISOString(),
    activeConversations: 3,
    tokensActive: 5,
    queueSize: 0,
    notes: 'Mock data; wire up real API to replace.',
    recordKeeper: {
      namespace: 'bernard:rk',
      metricsNamespace: 'bernard:rk:metrics',
      idleMs: 10 * 60 * 1000,
      summarizerEnabled: true,
      activeConversations: 3,
      closedConversations: 12,
      totalRequests: 240,
      totalTurns: 260,
      errorTurns: 3,
      tokensActive: 5,
      lastActivityAt: new Date().toISOString()
    }
  };

  private readonly recordKeeperStatus: RecordKeeperStatus = this.status.recordKeeper;

  private tokens: Token[] = [
    {
      id: this.createId(),
      name: 'Home Assistant',
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      lastUsedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      status: 'active'
    },
    {
      id: this.createId(),
      name: 'Mobile Client',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      lastUsedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      status: 'disabled'
    }
  ];

  private users: User[] = [
    {
      id: 'admin@example.com',
      displayName: 'Admin User',
      isAdmin: true,
      status: 'active',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    }
  ];

  private services: ServiceConfig[] = [
    {
      id: 'openrouter',
      name: 'OpenRouter',
      description: 'LLM gateway for Bernard agent',
      apiKey: 'sk-****router',
      options: { model: 'openrouter/anthropic/claude-3-opus', baseUrl: 'https://openrouter.ai/api/v1' },
      updatedAt: new Date().toISOString()
    },
    {
      id: 'search',
      name: 'Web Search',
      description: 'Brave-backed web search tool',
      apiKey: 'brv-****',
      options: { endpoint: 'https://search.local/api' },
      updatedAt: new Date().toISOString()
    },
    {
      id: 'weather',
      name: 'Open-Meteo',
      description: 'Forecast provider (no key required)',
      options: { units: 'metric', includeAirQuality: true },
      updatedAt: new Date().toISOString()
    }
  ];

  private readonly conversationIds = {
    active: this.createId(),
    closed: this.createId()
  };

  private memories: Memory[] = [
    {
      id: this.createId(),
      label: 'home address',
      content: '555 Homeward Dr.',
      conversationId: this.conversationIds.active,
      createdAt: new Date().toISOString(),
      refreshedAt: new Date().toISOString(),
      freshnessMaxDays: 7
    }
  ];

  private conversations: ConversationDetail[] = [
    {
      id: this.conversationIds.active,
      status: 'open',
      summary: 'Asked for weather and set a 10 minute timer.',
      startedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      lastTouchedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      lastRequestAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      messageCount: 6,
      toolCallCount: 2,
      requestCount: 3,
      tags: ['weather', 'timer'],
      flags: { explicit: false, forbidden: false },
      source: 'Home Assistant',
      tokenNames: [this.tokens[0]?.name ?? 'Home Assistant'],
      tokenIds: [this.tokens[0]?.id ?? 'tok-1'],
      modelSet: ['openrouter/claude-3-sonnet'],
      placeTags: ['kitchen'],
      keywords: ['weather', 'timer']
    },
    {
      id: this.conversationIds.closed,
      status: 'closed',
      summary: 'Looked up local coffee shops and asked for a summary.',
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      lastTouchedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      closedAt: new Date(Date.now() - 88 * 60 * 1000).toISOString(),
      lastRequestAt: new Date(Date.now() - 88 * 60 * 1000).toISOString(),
      messageCount: 5,
      toolCallCount: 1,
      requestCount: 2,
      tags: ['search'],
      flags: { explicit: false, forbidden: false },
      source: 'Mobile Client',
      tokenNames: [this.tokens[1]?.name ?? 'Mobile Client'],
      tokenIds: [this.tokens[1]?.id ?? 'tok-2'],
      modelSet: ['gpt-4o-mini'],
      placeTags: ['seattle'],
      keywords: ['coffee'],
      closeReason: 'completed'
    }
  ];

  private messages: Record<string, ConversationMessage[]> = {
    [this.conversationIds.active]: [
      {
        id: this.createId(),
        role: 'user',
        content: 'What is the weather in Seattle tomorrow?',
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
      },
      {
        id: this.createId(),
        role: 'assistant',
        content: 'Let me check the forecast for Seattle tomorrow.',
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000 + 45_000).toISOString()
      },
      {
        id: this.createId(),
        role: 'tool',
        content: { name: 'get_weather_forecast', args: { lat: 47.6062, lon: -122.3321, target: 'tomorrow' } },
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000 + 60_000).toISOString()
      },
      {
        id: this.createId(),
        role: 'assistant',
        content: 'High 68°F, low 54°F with light rain expected.',
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000 + 90_000).toISOString()
      },
      {
        id: this.createId(),
        role: 'user',
        content: 'Great, set a 10 minute timer.',
        createdAt: new Date(Date.now() - 3.8 * 60 * 60 * 1000).toISOString()
      },
      {
        id: this.createId(),
        role: 'assistant',
        content: 'Timer started for 10 minutes.',
        createdAt: new Date(Date.now() - 3.8 * 60 * 60 * 1000 + 45_000).toISOString()
      }
    ],
    [this.conversationIds.closed]: [
      {
        id: this.createId(),
        role: 'user',
        content: 'Find me coffee shops near Capitol Hill.',
        createdAt: new Date(Date.now() - 100 * 60 * 1000).toISOString()
      },
      {
        id: this.createId(),
        role: 'assistant',
        content: 'Searching for nearby coffee shops with good ratings.',
        createdAt: new Date(Date.now() - 99 * 60 * 1000).toISOString()
      },
      {
        id: this.createId(),
        role: 'tool',
        content: { name: 'web_search', results: 3 },
        createdAt: new Date(Date.now() - 99 * 60 * 1000 + 45_000).toISOString()
      },
      {
        id: this.createId(),
        role: 'assistant',
        content: 'Found three options: Analog Coffee, Victrola, and Espresso Vivace.',
        createdAt: new Date(Date.now() - 98 * 60 * 1000).toISOString()
      },
      {
        id: this.createId(),
        role: 'user',
        content: 'Summarize the hours and location.',
        createdAt: new Date(Date.now() - 97 * 60 * 1000).toISOString()
      }
    ]
  };

  private settings: AdminSettings = {
    models: {
      response: { primary: 'gpt-4o-mini', fallbacks: ['gpt-4o'], options: { temperature: 0.5 } },
      intent: { primary: 'gpt-4o-mini', fallbacks: ['gpt-4o'], options: { temperature: 0 } },
      memory: { primary: 'gpt-4o-mini', fallbacks: [], options: { temperature: 0 } },
      utility: { primary: 'gpt-4o-mini', fallbacks: [], options: { temperature: 0 } },
      aggregation: { primary: 'gpt-4o-mini', fallbacks: [], options: { temperature: 0 } }
    },
    services: {
      memory: {
        embeddingModel: 'text-embedding-3-small',
        embeddingBaseUrl: 'https://api.openai.com/v1',
        embeddingApiKey: 'sk-****',
        indexName: 'bernard_memories',
        keyPrefix: 'bernard:memories',
        namespace: 'bernard:memories'
      },
      search: { apiKey: 'brv-****', apiUrl: 'https://api.search.brave.com/res/v1/web/search' },
      weather: {
        apiKey: 'openweather-api-key',
        apiUrl: 'https://api.openweathermap.org/data/2.5/weather',
        forecastUrl: 'https://api.open-meteo.com/v1/forecast',
        historicalUrl: 'https://archive-api.open-meteo.com/v1/archive',
        units: 'imperial'
      },
      geocoding: {
        url: 'https://nominatim.openstreetmap.org/search',
        userAgent: 'bernard-admin (+https://example.com)',
        email: 'ops@example.com',
        referer: 'https://example.com'
      }
    },
    oauth: {
      google: {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
        redirectUri: 'http://localhost:3000/api/auth/google/callback',
        scope: 'openid profile email',
        clientId: 'google-client-id',
        clientSecret: 'google-client-secret'
      },
      github: {
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userInfoUrl: 'https://api.github.com/user',
        redirectUri: 'http://localhost:3000/api/auth/github/callback',
        scope: 'read:user user:email',
        clientId: 'github-client-id',
        clientSecret: 'github-client-secret'
      }
    },
    backups: {
      debounceSeconds: 60,
      directory: './backups',
      retentionDays: 14,
      retentionCount: 20
    }
  };

  getStatus() {
    return of(this.status).pipe(delay(120));
  }

  getRecordKeeperStatus() {
    return of(this.recordKeeperStatus).pipe(delay(80));
  }

  listTokens() {
    return of(this.tokens).pipe(delay(120));
  }

  createToken(body: CreateTokenRequest) {
    const token: Token = {
      id: this.createId(),
      name: body.name,
      createdAt: new Date().toISOString(),
      status: 'active',
      token: `tok-${this.createId()}`
    };
    this.tokens = [...this.tokens, token];
    return of(token).pipe(delay(120));
  }

  updateToken(id: string, body: UpdateTokenRequest) {
    const existing = this.tokens.find((token) => token.id === id);
    if (!existing) {
      const placeholder: Token = {
        id,
        name: body.name ?? 'unknown',
        createdAt: new Date().toISOString(),
        status: body.status ?? 'active'
      };
      return of(placeholder).pipe(delay(120));
    }

    const updated = this.tokens.map((token) =>
      token.id === id
        ? {
            ...token,
            ...('name' in body && body.name ? { name: body.name } : {}),
            ...('status' in body && body.status ? { status: body.status } : {})
          }
        : token
    );
    const next = updated.find((t) => t.id === id) as Token;
    this.tokens = updated;
    return of(next).pipe(delay(120));
  }

  deleteToken(id: string) {
    this.tokens = this.tokens.filter((t) => t.id !== id);
    return of(void 0).pipe(delay(80));
  }

  listServices() {
    return of(this.services).pipe(delay(100));
  }

  updateService(id: string, body: UpdateServiceRequest) {
    this.services = this.services.map((service) =>
      service.id === id
        ? {
            ...service,
            ...body,
            updatedAt: new Date().toISOString()
          }
        : service
    );
    const service = this.services.find((s) => s.id === id) as ServiceConfig;
    return of(service).pipe(delay(120));
  }

  listHistory(query?: HistoryQuery) {
    const includeOpen = query?.includeOpen ?? true;
    const includeClosed = query?.includeClosed ?? true;
    const filtered = this.conversations.filter((conversation) => {
      if (conversation.status === 'open') return includeOpen;
      if (conversation.status === 'closed') return includeClosed;
      return true;
    });

    const limit = query?.limit ?? filtered.length;
    const items = filtered.slice(0, limit);
    const activeCount = this.conversations.filter((c) => c.status === 'open').length;
    const closedCount = this.conversations.filter((c) => c.status === 'closed').length;

    return of({ items, total: filtered.length, activeCount, closedCount }).pipe(delay(140));
  }

  getConversation(id: string, messageLimit?: number) {
    const conversation = this.conversations.find((conv) => conv.id === id);
    if (!conversation) {
      return of({
        conversation: {
          id,
          status: 'closed' as const,
          summary: 'Conversation not found',
          startedAt: new Date().toISOString(),
          lastTouchedAt: new Date().toISOString(),
          messageCount: 0,
          toolCallCount: 0,
          tags: [],
          source: 'unknown',
          tokenIds: [],
          tokenNames: [],
          lastRequestAt: new Date().toISOString()
        },
        messages: []
      }).pipe(delay(80));
    }

    const messages = this.messages[id] ?? [];
    const limitedMessages =
      typeof messageLimit === 'number' && messageLimit > 0 ? messages.slice(-messageLimit) : messages;

    return of({
      conversation,
      messages: limitedMessages
    }).pipe(delay(120));
  }

  deleteConversation(id: string) {
    this.conversations = this.conversations.filter((conv) => conv.id !== id);
    delete this.messages[id];
    return of(void 0).pipe(delay(80));
  }

  getIndexingStatus(id: string) {
    const conversation = this.conversations.find((conv) => conv.id === id);
    if (!conversation) {
      return of({ 
        indexingStatus: 'none' as ConversationIndexingStatus,
        indexingError: 'Conversation not found',
        indexingAttempts: 0 
      }).pipe(delay(40));
    }
    return of({ 
      indexingStatus: (conversation.indexingStatus ?? 'none') as ConversationIndexingStatus,
      indexingError: conversation.indexingError,
      indexingAttempts: conversation.indexingAttempts ?? 0 
    }).pipe(delay(40));
  }

  retryIndexing(id: string) {
    const conversation = this.conversations.find((conv) => conv.id === id);
    if (!conversation) {
      return of({ 
        success: false,
        indexingStatus: 'none' as ConversationIndexingStatus,
        message: 'Conversation not found' 
      }).pipe(delay(60));
    }
    
    const currentStatus = conversation.indexingStatus ?? 'none';
    if (currentStatus === 'queued' || currentStatus === 'indexing') {
      return of({ 
        success: false,
        indexingStatus: currentStatus as ConversationIndexingStatus,
        message: `Cannot retry indexing while already ${currentStatus}` 
      }).pipe(delay(60));
    }
    
    this.conversations = this.conversations.map((conv) =>
      conv.id === id 
        ? { 
            ...conv, 
            indexingStatus: 'queued' as ConversationIndexingStatus,
            indexingAttempts: (conv.indexingAttempts ?? 0) + 1,
            indexingError: undefined 
          } 
        : conv
    );
    
    return of({ 
      success: true,
      indexingStatus: 'queued' as ConversationIndexingStatus,
      message: 'Indexing tasks queued successfully' 
    }).pipe(delay(80));
  }

  cancelIndexing(id: string) {
    const conversation = this.conversations.find((conv) => conv.id === id);
    if (!conversation) {
      return of({ 
        success: false,
        indexingStatus: 'none' as ConversationIndexingStatus,
        message: 'Conversation not found' 
      }).pipe(delay(60));
    }
    
    const currentStatus = conversation.indexingStatus ?? 'none';
    if (currentStatus === 'indexed' || currentStatus === 'failed') {
      return of({ 
        success: false,
        indexingStatus: currentStatus as ConversationIndexingStatus,
        message: `Cannot cancel indexing in current state: ${currentStatus}` 
      }).pipe(delay(60));
    }
    
    this.conversations = this.conversations.map((conv) =>
      conv.id === id 
        ? { 
            ...conv, 
            indexingStatus: 'none' as ConversationIndexingStatus,
            indexingError: undefined 
          } 
        : conv
    );
    
    return of({ 
      success: true,
      indexingStatus: 'none' as ConversationIndexingStatus,
      message: 'Indexing tasks canceled successfully' 
    }).pipe(delay(80));
  }

  closeConversation(id: string) {
    const now = new Date().toISOString();
    const existing = this.conversations.find((conv) => conv.id === id);
    const closed: ConversationDetail = existing ?? {
      id,
      status: 'closed',
      summary: 'Conversation not found',
      startedAt: now,
      lastTouchedAt: now,
      messageCount: 0,
      toolCallCount: 0,
      tags: [],
      source: 'unknown',
      tokenNames: [],
      tokenIds: []
    };

    this.conversations = this.conversations.map((conv) =>
      conv.id === id
        ? { ...conv, status: 'closed', closedAt: now, lastTouchedAt: now, closeReason: 'manual' }
        : conv
    );
    if (!existing) {
      this.conversations = [closed, ...this.conversations];
    }

    const updated = this.conversations.find((conv) => conv.id === id) as ConversationDetail;
    return of(updated).pipe(delay(80));
  }

  listMemories() {
    return of(this.memories).pipe(delay(60));
  }

  createMemory(body: CreateMemoryRequest) {
    const memory: Memory = {
      id: this.createId(),
      label: body.label,
      content: body.content,
      conversationId: body.conversationId,
      createdAt: new Date().toISOString(),
      refreshedAt: new Date().toISOString(),
      freshnessMaxDays: 7
    };
    this.memories = [memory, ...this.memories];
    return of(memory).pipe(delay(80));
  }

  updateMemory(id: string, body: UpdateMemoryRequest) {
    this.memories = this.memories.map((m) =>
      m.id === id
        ? {
            ...m,
            ...(body.label ? { label: body.label } : {}),
            ...(body.content ? { content: body.content } : {}),
            ...(body.conversationId ? { conversationId: body.conversationId } : {}),
            ...(body.successorId !== undefined ? { successorId: body.successorId ?? undefined } : {}),
            refreshedAt: body.refresh ? new Date().toISOString() : m.refreshedAt
          }
        : m
    );
    const found = this.memories.find((m) => m.id === id) as Memory;
    return of(found).pipe(delay(60));
  }

  refreshMemory(id: string) {
    return this.updateMemory(id, { refresh: true });
  }

  deleteMemory(id: string) {
    this.memories = this.memories.filter((m) => m.id !== id);
    return of(void 0).pipe(delay(40));
  }

  getSettings() {
    return of(this.settings).pipe(delay(60));
  }

  getModelsSettings() {
    return of(this.settings.models).pipe(delay(60));
  }

  updateModelsSettings(body: ModelsSettings) {
    this.settings = { ...this.settings, models: body };
    return of(body).pipe(delay(60));
  }

  getServicesSettings() {
    return of(this.settings.services).pipe(delay(60));
  }

  updateServicesSettings(body: ServicesSettings) {
    this.settings = { ...this.settings, services: body };
    return of(body).pipe(delay(60));
  }

  getOAuthSettings() {
    return of(this.settings.oauth).pipe(delay(60));
  }

  updateOAuthSettings(body: OAuthSettings) {
    this.settings = { ...this.settings, oauth: body };
    return of(body).pipe(delay(60));
  }

  getBackupSettings() {
    return of(this.settings.backups).pipe(delay(60));
  }

  updateBackupSettings(body: BackupSettings) {
    this.settings = { ...this.settings, backups: body };
    return of(body).pipe(delay(60));
  }

  getMe() {
    return of({ ...this.users[0] }).pipe(delay(40));
  }

  listUsers() {
    return of(this.users).pipe(delay(80));
  }

  createUser(body: CreateUserRequest) {
    const user: User = {
      id: body.id,
      displayName: body.displayName,
      isAdmin: body.isAdmin,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.users = [...this.users, user];
    return of(user).pipe(delay(120));
  }

  updateUser(id: string, body: UpdateUserRequest) {
    this.users = this.users.map((user) =>
      user.id === id
        ? {
            ...user,
            ...(body.displayName ? { displayName: body.displayName } : {}),
            ...(typeof body.isAdmin === 'boolean' ? { isAdmin: body.isAdmin } : {}),
            ...(body.status ? { status: body.status } : {}),
            updatedAt: new Date().toISOString()
          }
        : user
    );
    const user = this.users.find((u) => u.id === id) as User;
    return of(user).pipe(delay(120));
  }

  deleteUser(id: string) {
    this.users = this.users.map((user) =>
      user.id === id
        ? {
            ...user,
            displayName: `deleted-${user.displayName}`,
            isAdmin: false,
            status: 'deleted',
            updatedAt: new Date().toISOString()
          }
        : user
    );
    const user = this.users.find((u) => u.id === id) as User;
    return of(user).pipe(delay(60));
  }

  resetUser(_id: string) {
    return of(void 0).pipe(delay(40));
  }

  logout() {
    return of(void 0).pipe(delay(40));
  }

  private createId() {
    return Math.random().toString(36).slice(2, 10);
  }
}
