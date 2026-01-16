import type { IAPIClient, LoginCredentials, UpdateProfileRequest } from './types';
import type { User } from '@/types/auth';

class APIClient implements IAPIClient {
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

  private async request<T>(endpoint: string, options: RequestInit = {}, baseUrl?: string): Promise<T> {
    if ((endpoint.startsWith('/auth/') || endpoint.startsWith('/api/auth/')) && !baseUrl) {
      baseUrl = `${window.location.protocol}//${window.location.host}`;
    }
    const url = `${baseUrl || this.apiBaseUrl}${endpoint}`;
    const defaultOptions: RequestInit = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const response = await fetch(url, {
      ...defaultOptions,
      ...options,
      headers: { ...defaultOptions.headers, ...options.headers }
    });

    if (!response.ok) {
      if (response.status === 304) {
        const error: Error & { status?: number } = new Error(`HTTP ${response.status} - cached response not available`);
        error.status = response.status;
        throw error;
      }
      const errorText = await response.text().catch(() => '');
      const error: Error & { status?: number; details?: unknown } = new Error(errorText || `HTTP ${response.status}`);
      error.status = response.status;
      error.details = errorText;
      throw error;
    }

    if (response.status === 204) return {} as T;
    return response.json();
  }

  private getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('authToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  async login(credentials: LoginCredentials) {
    return this.request<{ user: User; accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    }, this.authBaseUrl);
  }

  async logout() {
    const result = await this.request<void>('/api/auth/sign-out', { method: 'POST' }, this.authBaseUrl);
    this.currentUserCache = null;
    localStorage.removeItem('authToken');
    return result;
  }

  async getCurrentUser() {
    const now = Date.now();
    const cacheTtlMs = 2000;

    if (this.currentUserCache && now - this.currentUserCache.cachedAtMs < cacheTtlMs) {
      return this.currentUserCache.user;
    }

    if (this.currentUserInFlight) return this.currentUserInFlight;

    this.currentUserInFlight = this.request<{ user: User | null }>('/api/auth/get-session', undefined, this.authBaseUrl)
      .then((response) => {
        this.currentUserCache = { user: response.user, cachedAtMs: Date.now() };
        return response.user;
      })
      .finally(() => { this.currentUserInFlight = null; });

    return this.currentUserInFlight;
  }

  async githubLogin() {
    window.location.href = '/auth/login?provider=github';
  }

  async googleLogin() {
    window.location.href = '/auth/login?provider=google';
  }

  async updateProfile(data: UpdateProfileRequest) {
    const response = await this.request<{ user: User }>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(data)
    }, this.authBaseUrl);
    return response.user;
  }

  async listThreads(limit: number = 50) {
    const response = await fetch(`/threads/search`, {
      credentials: 'same-origin',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      body: JSON.stringify({ limit, order: 'desc', checkpoint_filters: [], thread_filters: [] })
    });

    // 404 means no threads found - return empty list gracefully
    if (response.status === 404) {
      return { threads: [], total: 0, hasMore: false };
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(errorText || `HTTP ${response.status}`);
    }

    const result = await response.json();
    const threads = Array.isArray(result) ? result.map((t: any) => ({
      id: t.thread_id,
      name: t.metadata?.name,
      createdAt: t.created_at,
      lastTouchedAt: t.updated_at,
      messageCount: t.metadata?.messageCount || 0
    })) : [];

    return { threads, total: threads.length, hasMore: false };
  }

  async getThread(threadId: string) {
    const response = await fetch(`/threads/${threadId}`, {
      credentials: 'same-origin',
      headers: this.getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch thread');
    return response.json();
  }

  async createThread() {
    const response = await fetch(`/threads`, {
      credentials: 'same-origin',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      body: JSON.stringify({})
    });
    if (!response.ok) throw new Error('Failed to create thread');
    return response.json();
  }

  async updateThread(threadId: string, name: string) {
    const response = await fetch(`/threads/${threadId}`, {
      credentials: 'same-origin',
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      body: JSON.stringify({ name })
    });
    if (!response.ok) throw new Error('Failed to update thread');
    return response.json();
  }

  async deleteThread(threadId: string) {
    const response = await fetch(`/threads/${threadId}`, {
      credentials: 'same-origin',
      method: 'DELETE',
      headers: this.getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to delete thread');
    try { return await response.json(); }
    catch { return { id: threadId, deleted: true }; }
  }

  async autoRenameThread(
    threadId: string,
    firstMessage?: string,
    messages?: Array<{ type: string; content: unknown }>
  ) {
    const body: Record<string, unknown> = {};
    if (firstMessage) body.firstMessage = firstMessage;
    if (messages) body.messages = messages;

    const response = await fetch(`/api/threads/${threadId}/auto-rename`, {
      credentials: 'same-origin',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Failed to auto-rename thread');
    }
    return response.json();
  }

  async listUsers() {
    const response = await this.request<{ users: User[] }>('/users');
    return response.users || [];
  }

  async createUser(userData: { id: string; displayName: string; isAdmin: boolean }) {
    const response = await this.request<{ user: User }>('/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
    return response.user;
  }

  async updateUser(id: string, data: Partial<User>) {
    const response = await this.request<{ user: User }>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
    return response.user;
  }

  async deleteUser(id: string) {
    const response = await this.request<{ user: User }>(`/users/${id}`, { method: 'DELETE' });
    return response.user;
  }

  async getTasks(includeArchived: boolean = false, limit: number = 50, offset: number = 0) {
    const params = new URLSearchParams({ includeArchived: String(includeArchived), limit: String(limit), offset: String(offset) });
    const response = await fetch(`${this.baseUrl}/tasks?${params}`, {
      credentials: 'same-origin',
      headers: this.getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch tasks');
    return response.json();
  }

  async getTask(taskId: string) {
    const response = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
      credentials: 'same-origin',
      headers: this.getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch task details');
    return response.json();
  }
}

// Factory and default export for backward compatibility
let _apiClient: IAPIClient | null = null;

export function createAPIClient(config: { authBaseUrl?: string; apiBaseUrl?: string; baseUrl?: string } = {}): IAPIClient {
  return new APIClient(config.authBaseUrl, config.apiBaseUrl, config.baseUrl);
}

export function setAPIClient(client: IAPIClient): void {
  _apiClient = client;
}

export function getAPIClient(): IAPIClient {
  if (!_apiClient) {
    _apiClient = createAPIClient();
  }
  return _apiClient;
}

export function resetAPIClient(): void {
  _apiClient = null;
}

export const apiClient = getAPIClient();
