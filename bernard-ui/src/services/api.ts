import { User, UserStatus } from '../types/auth';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
}

export interface GenerateAccessTokenResponse {
  token: string;
  expiresAt: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
  email?: string;
}

export interface Token {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  status: 'active' | 'disabled';
  token?: string; // present only immediately after creation
}

export interface CreateTokenRequest {
  name: string;
}

export interface UpdateTokenRequest {
  name?: string;
  status?: Token['status'];
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

export interface APIError extends Error {
  status?: number;
  details?: unknown;
}

class ApiClient {
  private readonly baseUrl: string;
  private currentUserInFlight: Promise<User | null> | null = null;
  private currentUserCache: { user: User | null; cachedAtMs: number } | null =
    null;

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

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    return this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
  }

  async githubLogin(): Promise<void> {
    // Use direct navigation to bypass React Router
    window.open('/api/auth/github/login', '_self');
  }

  async googleLogin(): Promise<void> {
    // Use direct navigation to bypass React Router
    window.open('/api/auth/google/login', '_self');
  }

  async logout(): Promise<void> {
    return this.request<void>('/auth/logout', {
      method: 'POST'
    });
  }

  async getCurrentUser(): Promise<User | null> {
    // Deduplicate /auth/me to avoid runaway request storms.
    // This also smooths over StrictMode double-invokes in dev.
    const now = Date.now();
    const cacheTtlMs = 2000;

    if (
      this.currentUserCache &&
      now - this.currentUserCache.cachedAtMs < cacheTtlMs
    ) {
      return this.currentUserCache.user;
    }

    if (this.currentUserInFlight) {
      return this.currentUserInFlight;
    }

    this.currentUserInFlight = this.request<{ user: User | null }>('/auth/me')
      .then((response) => {
        this.currentUserCache = { user: response.user, cachedAtMs: Date.now() };
        return response.user;
      })
      .finally(() => {
        this.currentUserInFlight = null;
      });

    return this.currentUserInFlight;
  }

  async generateAccessToken(): Promise<GenerateAccessTokenResponse> {
    return this.request<GenerateAccessTokenResponse>('/auth/token', {
      method: 'POST'
    });
  }

  async updateProfile(data: UpdateProfileRequest): Promise<User> {
    const response = await this.request<{ user: User }>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
    return response.user;
  }

  async listUsers(): Promise<User[]> {
    const response = await this.request<{ users: User[] }>('/users');
    return response.users || [];
  }

  async createUser(userData: {
    id: string;
    displayName: string;
    isAdmin: boolean;
  }): Promise<User> {
    const response = await this.request<{ user: User }>('/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
    return response.user;
  }

  async updateUser(
    id: string,
    data: Partial<Pick<User, 'displayName' | 'isAdmin'>> & {
      status?: Extract<UserStatus, 'active' | 'disabled'>;
    }
  ): Promise<User> {
    const response = await this.request<{ user: User }>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
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

  async chatStream(messages: Array<{ role: string; content: string }>): Promise<ReadableStream> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      credentials: 'include',
      body: JSON.stringify({
        model: 'bernard-v1',
        stream: true,
        messages: messages.map(msg => ({
          role: msg.role === 'ai' ? 'assistant' : msg.role,
          content: msg.content
        }))
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const error: APIError = new Error(errorText || `HTTP ${response.status}`);
      error.status = response.status;
      error.details = errorText;
      throw error;
    }

    return response.body as ReadableStream;
  }
}

export const apiClient = new ApiClient();