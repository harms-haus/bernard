import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, InjectionToken, Provider } from '@angular/core';
import { delay, map, Observable, of } from 'rxjs';

import { environment } from '../config/environment';
import {
  ActivationSummary,
  BernardStatus,
  Conversation,
  CreateTokenRequest,
  HistoryQuery,
  Paginated,
  ServiceConfig,
  Token,
  UpdateServiceRequest,
  UpdateTokenRequest
} from './models';

/**
 * REST contracts (backend to align with):
 * - GET    /api/status                      -> BernardStatus
 * - GET    /api/tokens                      -> { tokens: Token[] }
 * - POST   /api/tokens                      -> Token (CreateTokenRequest) // includes secret once
 * - GET    /api/tokens/:id                  -> { token: Token }
 * - PATCH  /api/tokens/:id                  -> { token: Token }
 * - DELETE /api/tokens/:id                  -> { removed: boolean }
 * - GET    /api/services                    -> ServiceConfig[]
 * - PUT    /api/services/:id                -> ServiceConfig (UpdateServiceRequest)
 * - GET    /api/history?search&limit&cursor -> Paginated<Conversation>
 */
export interface ApiClient {
  getStatus(): Observable<BernardStatus>;
  listTokens(): Observable<Token[]>;
  createToken(body: CreateTokenRequest): Observable<Token>;
  updateToken(id: string, body: UpdateTokenRequest): Observable<Token>;
  deleteToken(id: string): Observable<void>;
  listServices(): Observable<ServiceConfig[]>;
  updateService(id: string, body: UpdateServiceRequest): Observable<ServiceConfig>;
  listHistory(query?: HistoryQuery): Observable<Paginated<Conversation>>;
}

export const API_CLIENT = new InjectionToken<ApiClient>('API_CLIENT');

export const provideApiClient = (): Provider => ({
  provide: API_CLIENT,
  deps: [HttpClient],
  useFactory: (http: HttpClient): ApiClient => {
    if (environment.useMocks) {
      return new MockApiClient();
    }
    return new HttpApiClient(http, environment.apiBaseUrl, environment.adminToken);
  }
});

class HttpApiClient implements ApiClient {
  constructor(
    private readonly http: HttpClient,
    private readonly baseUrl: string,
    private readonly adminToken?: string
  ) {}

  private options() {
    if (!this.adminToken) {
      return {};
    }
    return { headers: new HttpHeaders({ Authorization: `Bearer ${this.adminToken}` }) };
  }

  getStatus() {
    return this.http.get<BernardStatus>(`${this.baseUrl}/status`, this.options());
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
        search: query?.search ?? '',
        limit: query?.limit ? String(query.limit) : '',
        cursor: query?.cursor ?? '',
        status: query?.status ?? ''
      }
    });

    return this.http.get<Paginated<Conversation>>(`${this.baseUrl}/history`, {
      ...this.options(),
      params
    });
  }
}

class MockApiClient implements ApiClient {
  private readonly status: BernardStatus = {
    status: 'online',
    uptimeSeconds: 86_400 + 3200,
    startedAt: new Date(Date.now() - 89_600_000).toISOString(),
    version: '0.1.0',
    lastMessageAt: new Date().toISOString(),
    activeConversations: 3,
    tokensActive: 5,
    queueSize: 0,
    notes: 'Mock data; wire up real API to replace.'
  };

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

  private conversations: Conversation[] = [
    {
      id: this.createId(),
      userLabel: 'Kitchen Display',
      createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      tokenId: this.tokens[0]?.id,
      summary: 'Asked for weather and set a 10 minute timer.',
      messageCount: 6,
      toolCallCount: 2,
      status: 'completed',
      activations: [
        {
          id: this.createId(),
          type: 'tool',
          toolName: 'get_weather',
          inputPreview: 'Weather in Seattle tomorrow',
          outputPreview: 'High 68°F, low 54°F, light rain',
          createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
          durationMs: 1200
        },
        {
          id: this.createId(),
          type: 'tool',
          toolName: 'set_timer',
          inputPreview: '10 minute timer',
          outputPreview: 'Timer started',
          createdAt: new Date(Date.now() - 3.8 * 60 * 60 * 1000).toISOString(),
          durationMs: 300
        }
      ]
    },
    {
      id: this.createId(),
      userLabel: 'Mobile',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      tokenId: this.tokens[1]?.id,
      summary: 'Looked up local coffee shops and asked for a summary.',
      messageCount: 5,
      toolCallCount: 1,
      status: 'completed',
      activations: [
        {
          id: this.createId(),
          type: 'tool',
          toolName: 'web_search',
          inputPreview: 'best coffee near capitol hill',
          outputPreview: 'Found 3 options with hours and ratings',
          createdAt: new Date(Date.now() - 100 * 60 * 1000).toISOString(),
          durationMs: 2400
        }
      ]
    }
  ];

  getStatus() {
    return of(this.status).pipe(delay(120));
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
    const searchTerm = query?.search?.toLowerCase().trim() ?? '';
    const filtered = this.conversations.filter((conversation) => {
      const matchesSearch = searchTerm.length
        ? conversation.summary.toLowerCase().includes(searchTerm) ||
          conversation.userLabel.toLowerCase().includes(searchTerm)
        : true;
      const matchesStatus = query?.status ? conversation.status === query.status : true;
      return matchesSearch && matchesStatus;
    });

    const limit = query?.limit ?? 10;
    const items = filtered.slice(0, limit);
    const nextCursor = filtered.length > limit ? filtered[limit]?.id : undefined;

    return of({ items, nextCursor, total: filtered.length }).pipe(delay(140));
  }

  private createId() {
    return Math.random().toString(36).slice(2, 10);
  }
}
