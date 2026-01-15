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
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  content: string;
}

export interface Task {
  id: string;
  name: string;
  status: 'queued' | 'running' | 'completed' | 'errored' | 'uncompleted' | 'cancelled';
  toolName: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  runtimeMs?: number;
  errorMessage?: string;
  messageCount: number;
  toolCallCount: number;
  tokensIn: number;
  tokensOut: number;
  archived: boolean;
}

export interface TaskDetail {
  task: Task;
  events: Array<{
    type: string;
    timestamp: string;
    data: Record<string, unknown>;
  }>;
  sections: Record<string, {
    name: string;
    description: string;
    content: string;
  }>;
  messages: Array<{
    id: string;
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    createdAt: string;
    name?: string;
    tool_call_id?: string;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: {
        name: string;
        arguments: string;
      };
    }>;
  }>;
}

export interface TasksListResponse {
  tasks: Task[];
  total: number;
  hasMore: boolean;
}

export interface ThreadListItem {
  id: string;
  name?: string;
  createdAt: string;
  lastTouchedAt: string;
  messageCount?: number;
}

export interface ThreadDetail {
  id: string;
  checkpoints: Array<{ id: string; timestamp: string }>;
  checkpointCount: number;
}

class APIClient {
  private readonly authBaseUrl: string;
  private readonly apiBaseUrl: string;
  private readonly baseUrl: string;
  private currentUserInFlight: Promise<User | null> | null = null;
  private currentUserCache: { user: User | null; cachedAtMs: number } | null = null;

  constructor(authBaseUrl: string = '', apiBaseUrl: string = '/api', baseUrl: string = '') {
    this.authBaseUrl = authBaseUrl;
    this.apiBaseUrl = apiBaseUrl;
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    baseUrl?: string
  ): Promise<T> {
    // For auth endpoints, use the current host
    if ((endpoint.startsWith('/auth/') || endpoint.startsWith('/api/auth/')) && !baseUrl) {
      baseUrl = `${window.location.protocol}//${window.location.host}`;
    }
    const url = `${baseUrl || this.apiBaseUrl}${endpoint}`;
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
      // 304 Not Modified is actually successful for cached responses
      if (response.status === 304) {
        // For 304 responses, we should have cached data, but since we don't cache auth responses,
        // treat this as an error to force a fresh request
        const error: Error & { status?: number; details?: unknown } = new Error(
          `HTTP ${response.status} - cached response not available`
        );
        error.status = response.status;
        throw error;
      }

      const errorText = await response.text().catch(() => '');
      const error: Error & { status?: number; details?: unknown } = new Error(
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

  private getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('authToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    return this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    }, this.authBaseUrl);
  }

  async githubLogin(): Promise<void> {
    // Redirect to core login page with provider specified
    window.location.href = '/auth/login?provider=github';
  }

  async googleLogin(): Promise<void> {
    // Redirect to core login page with provider specified
    window.location.href = '/auth/login?provider=google';
  }

  async logout(): Promise<void> {
    return this.request<void>('/api/auth/sign-out', {
      method: 'POST'
    }, this.authBaseUrl);
  }

  async getCurrentUser(): Promise<User | null> {
    // Deduplicate /api/auth/get-session to avoid runaway request storms.
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

    this.currentUserInFlight = this.request<{ user: User | null }>('/api/auth/get-session', undefined, this.authBaseUrl)
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
    }, this.authBaseUrl);
  }

  async updateProfile(data: UpdateProfileRequest): Promise<User> {
    const response = await this.request<{ user: User }>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(data)
    }, this.authBaseUrl);
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

  async chat(messages: ConversationMessage[], chatId?: string): Promise<ChatResponse> {
    const response = await fetch(`/v1/chat/completions`, {
      credentials: 'same-origin',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({
        model: 'bernard-v1',
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        ...(chatId ? { chatId } : {})
      })
    });

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    return response.json();
  }

  async chatStream(messages: ConversationMessage[], ghost?: boolean, signal?: AbortSignal, chatId?: string): Promise<ReadableStream> {
    const response = await fetch(`/v1/chat/completions`, {
      credentials: 'same-origin',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({
        model: 'bernard-v1',
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        stream: true,
        ...(ghost ? { ghost: true } : {}),
        ...(chatId ? { chatId } : {})
      }),
      signal
    });

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }
    return response.body;
  }

  async getConversationHistory(limit: number = 100, includeMessages: boolean = false, threadId?: string | null): Promise<any[]> {
    const params = new URLSearchParams({
      limit: String(limit),
      includeMessages: String(includeMessages)
    });
    if (threadId) {
      params.set('threadId', threadId);
    }
    
    const response = await fetch(`${this.baseUrl}/history?${params.toString()}`, {
      credentials: 'same-origin',
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to fetch conversation history');
    }

    const data = await response.json();
    return data.results || [];
  }

  async updateConversationGhostStatus(threadId: string, ghost: boolean): Promise<{ threadId: string; ghost: boolean; updated: boolean }> {
    const response = await fetch(`${this.baseUrl}/conversations/${threadId}`, {
      credentials: 'same-origin',
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ ghost })
    });

    if (!response.ok) {
      throw new Error('Failed to update conversation ghost status');
    }

    return response.json();
  }

  async deleteConversation(threadId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/admin/history/${threadId}`, {
      credentials: 'same-origin',
      method: 'DELETE',
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(errorText || `Failed to delete conversation (${response.status})`);
    }
  }

  async closeConversation(threadId: string, reason: string = 'manual'): Promise<void> {
    const response = await fetch(`${this.baseUrl}/admin/history/${threadId}`, {
      credentials: 'same-origin',
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ ttl: 0, reason })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(errorText || `Failed to close conversation (${response.status})`);
    }
  }

  // Task API methods
  async getTasks(includeArchived: boolean = false, limit: number = 50, offset: number = 0): Promise<TasksListResponse> {
    const params = new URLSearchParams({
      includeArchived: String(includeArchived),
      limit: String(limit),
      offset: String(offset)
    });

    const response = await fetch(`${this.baseUrl}/tasks?${params}`, {
      credentials: 'same-origin',
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to fetch tasks');
    }

    return response.json();
  }

  async getTask(taskId: string): Promise<TaskDetail> {
    const response = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
      credentials: 'same-origin',
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to fetch task details');
    }

    return response.json();
  }

  async listThreads(limit: number = 50): Promise<{ threads: ThreadListItem[]; total: number; hasMore: boolean }> {
    const response = await fetch(`/threads/search`, {
      credentials: 'same-origin',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({
        limit,
        order: 'desc',
        checkpoint_filters: [],
        thread_filters: []
      })
    });

    if (!response.ok) {
      throw new Error('Failed to fetch threads');
    }

    // LangGraph returns a plain array, not { data, has_more }
    const result = await response.json();
    const threads: ThreadListItem[] = Array.isArray(result) ? result.map((t: any) => ({
      id: t.thread_id,
      name: t.metadata?.name,
      createdAt: t.created_at,
      lastTouchedAt: t.updated_at,
      messageCount: t.metadata?.messageCount || 0
    })) : [];

    return {
      threads,
      total: threads.length,
      hasMore: false
    };
  }

  async getThread(threadId: string): Promise<ThreadDetail> {
    const response = await fetch(`/threads/${threadId}`, {
      credentials: 'same-origin',
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to fetch thread');
    }

    return response.json();
  }

  async createThread(): Promise<{ thread_id: string }> {
    const response = await fetch(`/threads`, {
      credentials: 'same-origin',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new Error('Failed to create thread');
    }

    return response.json();
  }

  async updateThread(threadId: string, name: string): Promise<{ id: string; name: string; updated: boolean }> {
    const response = await fetch(`/threads/${threadId}`, {
      credentials: 'same-origin',
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ name })
    });

    if (!response.ok) {
      throw new Error('Failed to update thread');
    }

    return response.json();
  }

  async deleteThread(threadId: string): Promise<{ id: string; deleted: boolean }> {
    const response = await fetch(`/threads/${threadId}`, {
      credentials: 'same-origin',
      method: 'DELETE',
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to delete thread');
    }

    // LangGraph may return empty body
    try {
      return await response.json();
    } catch {
      return { id: threadId, deleted: true };
    }
  }

  async autoRenameThread(
    threadId: string,
    firstMessage?: string,
    messages?: Array<{ type: string; content: unknown }>
  ): Promise<{
    success: boolean;
    threadId: string;
    name: string;
  }> {
    const body: Record<string, unknown> = {};
    if (firstMessage) {
      body.firstMessage = firstMessage;
    }
    if (messages) {
      body.messages = messages;
    }

    const response = await fetch(`/api/threads/${threadId}/auto-rename`, {
      credentials: 'same-origin',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Failed to auto-rename thread');
    }

    return response.json();
  }
}

export const apiClient = new APIClient('', '/api', '/api');