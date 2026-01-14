# Phase 5.1 Refactoring Plan: Critical Chat Components

**Date:** January 13, 2026  
**Objective:** Refactor Phase 5.1 critical chat components to beeasier to mock and test  
**Target:** Achieve 80%+ test coverage for Thread, ConversationHistory, and message components

---

## Executive Summary

The Phase 5.1 critical chat components are currently **nearly untestable** due to:
- **15+ external dependencies** per component (context, APIs, browser APIs)
- **Direct API calls** embedded in components
- **Tight coupling** with React context providers
- **Missing dependency injection** points
- **Duplicate code** (BranchSwitcher exists in 2 locations)
- **No mock infrastructure** for testing

This plan provides a systematic approach to refactoring each component with specific code examples and implementation order.

---

## Component Analysis Summary

| Component | Lines | Dependencies | Testability Score | Primary Issues |
|-----------|-------|--------------|-------------------|----------------|
| Thread.tsx | 334 | 15+ | 2/10 | Direct API calls, clipboard, URL APIs |
| ConversationHistory.tsx | 449 | 12+ | 3/10 | localStorage, LangGraph SDK, direct API |
| ai.tsx | 118 | 5 | 4/10 | StreamContext tightly coupled |
| human.tsx | 160 | 6 | 3/10 | StreamContext, duplicate BranchSwitcher |
| tool-calls.tsx | 149 | 3 | 6/10 | Formatting functions not extracted |
| progress.tsx | 61 | 4 | 5/10 | StreamContext coupled |
| BranchSwitcher.tsx | 62 | 0 | 9/10 | Pure UI, but duplicated |

**Average Testability Score: 4.6/10**

---

## Priority Matrix

| Priority | Impact | Effort | Items |
|----------|--------|--------|-------|
| P0 | High | Low | Create mock providers, remove BranchSwitcher duplicate |
| P1 | High | Medium | API client interface, browser abstraction |
| P2 | Medium | Medium | Extract custom hooks, add injection points |
| P3 | Low | Low | Add testids, export utilities |

---

## Detailed Refactoring Plan

### P0: Critical Infrastructure (Start Here)

#### P0.1: Create Mock Providers

**File:** `services/bernard-ui/src/test/providers/StreamProvider.tsx`

```typescript
import { createContext, useContext, ReactNode } from 'react';
import type { Message, Checkpoint } from '@langchain/langgraph-sdk';
import type { ToolProgressEvent } from '@/providers/StreamProvider';

export interface MockStreamContextType {
  messages: Message[];
  submit: vi.Mock;
  isLoading: boolean;
  stop: vi.Mock;
  latestProgress: ToolProgressEvent | null;
  getMessagesMetadata: (message: Message) => {
    branch?: string;
    branchOptions?: string[];
    firstSeenState?: { parent_checkpoint?: Checkpoint };
  };
  setBranch: vi.Mock;
}

const MockStreamContext = createContext<MockStreamContextType | undefined>(undefined);

export function createMockStreamContext(overrides: Partial<MockStreamContextType> = {}): MockStreamContextType {
  return {
    messages: [],
    submit: vi.fn(),
    isLoading: false,
    stop: vi.fn(),
    latestProgress: null,
    getMessagesMetadata: () => ({}),
    setBranch: vi.fn(),
    ...overrides,
  };
}

export function MockStreamProvider({ 
  children, 
  value = createMockStreamContext() 
}: { 
  children: ReactNode;
  value?: MockStreamContextType;
}) {
  return (
    <MockStreamContext.Provider value={value}>
      {children}
    </MockStreamContext.Provider>
  );
}

export function useMockStreamContext() {
  const context = useContext(MockStreamContext);
  if (!context) {
    throw new Error('useMockStreamContext must be used within MockStreamProvider');
  }
  return context;
}
```

**File:** `services/bernard-ui/src/test/providers/ThreadProvider.tsx`

```typescript
import { createContext, useContext, ReactNode } from 'react';
import type { ThreadListItem } from '@/services/api';

export interface MockThreadContextType {
  threads: ThreadListItem[];
  getThreads: vi.Mock<() => Promise<ThreadListItem[]>>;
  setThreads: vi.Mock<(threads: ThreadListItem[]) => void>;
  createThread: vi.Mock<(id: string) => void>;
  createNewThread: vi.Mock<() => Promise<string>>;
  updateThread: vi.Mock<(threadId: string, name: string) => Promise<void>>;
  deleteThread: vi.Mock<(threadId: string) => Promise<void>>;
  threadsLoading: boolean;
}

const MockThreadContext = createContext<MockThreadContextType | undefined>(undefined);

export function createMockThreadContext(overrides: Partial<MockThreadContextType> = {}): MockThreadContextType {
  return {
    threads: [],
    getThreads: vi.fn().mockResolvedValue([]),
    setThreads: vi.fn(),
    createThread: vi.fn(),
    createNewThread: vi.fn().mockResolvedValue('new-thread'),
    updateThread: vi.fn().mockResolvedValue(undefined),
    deleteThread: vi.fn().mockResolvedValue(undefined),
    threadsLoading: false,
    ...overrides,
  };
}

export function MockThreadProvider({ 
  children, 
  value = createMockThreadContext() 
}: { 
  children: ReactNode;
  value?: MockThreadContextType;
}) {
  return (
    <MockThreadContext.Provider value={value}>
      {children}
    </MockThreadContext.Provider>
  );
}

export function useMockThreadContext() {
  const context = useContext(MockThreadContext);
  if (!context) {
    throw new Error('useMockThreadContext must be used within MockThreadProvider');
  }
  return context;
}
```

**File:** `services/bernard-ui/src/test/providers/AuthProvider.tsx`

```typescript
import { createContext, useContext, ReactNode } from 'react';
import type { User } from '@/types/auth';

export interface MockAuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export interface MockAuthContextType {
  state: MockAuthState;
  login: vi.Mock;
  githubLogin: vi.Mock;
  googleLogin: vi.Mock;
  logout: vi.Mock;
  getCurrentUser: vi.Mock;
  updateProfile: vi.Mock;
  clearError: vi.Mock;
}

const MockAuthContext = createContext<MockAuthContextType | undefined>(undefined);

export function createMockAuthContext(overrides: Partial<MockAuthContextType> = {}): MockAuthContextType {
  return {
    state: { user: null, loading: false, error: null },
    login: vi.fn(),
    githubLogin: vi.fn(),
    googleLogin: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    getCurrentUser: vi.fn().mockResolvedValue(null),
    updateProfile: vi.fn().mockResolvedValue({} as User),
    clearError: vi.fn(),
    ...overrides,
  };
}

export function MockAuthProvider({ 
  children, 
  value = createMockAuthContext() 
}: { 
  children: ReactNode;
  value?: MockAuthContextType;
}) {
  return (
    <MockAuthContext.Provider value={value}>
      {children}
    </MockAuthContext.Provider>
  );
}

export function useMockAuthContext() {
  const context = useContext(MockAuthContext);
  if (!context) {
    throw new Error('useMockAuthContext must be used within MockAuthProvider');
  }
  return context;
}
```

---

#### P0.2: Remove BranchSwitcher Duplicate

**Problem:** BranchSwitcher exists in two locations:
1. `/components/chat/BranchSwitcher.tsx` (standalone)
2. Inline in `/components/chat/messages/human.tsx` (lines 10-67)

**Solution:** Update `human.tsx` to import from standalone file

**Current duplicate code in human.tsx (lines 10-67):**
```typescript
function BranchSwitcher({
  branch,
  branchOptions,
  onSelect,
  isLoading,
}: {
  branch: string | undefined;
  branchOptions: string[] | undefined;
  onSelect: (branch: string) => void;
  isLoading: boolean;
}) {
  if (!branchOptions || !branch || branchOptions.length <= 1) return null;
  const index = branchOptions.indexOf(branch);

  return (
    <div className="flex items-center justify-center w-full mt-2 mb-1 group">
      <div className="flex items-center justify-center w-full gap-6">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-900/30 to-blue-900/30 dark:via-blue-200/20 dark:to-blue-200/20 transition-all duration-300" />

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 p-1 transition-colors duration-300"
            onClick={() => {
              const prevBranch = branchOptions[index - 1];
              if (!prevBranch) return;
              onSelect(prevBranch);
            }}
            disabled={isLoading || index === 0}
          >
            <ChevronLeft className="h-4 w-4 text-blue-900/60 dark:text-blue-200/60 group-hover:text-foreground transition-colors duration-300" />
          </Button>

          <span className="text-sm min-w-[3.5rem] text-center text-blue-900/60 dark:text-blue-200/60 group-hover:text-foreground transition-colors duration-300 font-medium">
            {index + 1} / {branchOptions.length}
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="size-7 p-1 transition-colors duration-300"
            onClick={() => {
              const nextBranch = branchOptions[index + 1];
              if (!nextBranch) return;
              onSelect(nextBranch);
            }}
            disabled={isLoading || index === branchOptions.length - 1}
          >
            <ChevronRight className="h-4 w-4 text-blue-900/60 dark:text-blue-200/60 group-hover:text-foreground transition-colors duration-300" />
          </Button>
        </div>

        <div className="h-px flex-1 bg-gradient-to-r from-blue-900/30 via-blue-900/30 to-transparent dark:from-blue-200/20 dark:via-blue-200/20 dark:to-transparent transition-all duration-300" />
      </div>
    </div>
  );
}
```

**Refactored human.tsx:**
```typescript
// Remove the duplicate BranchSwitcher function
// Add import:
import { BranchSwitcher } from '../BranchSwitcher';

// Update usage (lines 113-120):
{hasBranches && (
  <BranchSwitcher
    branch={meta?.branch}
    branchOptions={meta?.branchOptions}
    onSelect={(branch) => thread.setBranch(branch)}
    isLoading={isLoading}
  />
)}
```

---

### P1: High-Impact Refactoring

#### P1.1: Create API Client Interface

**File:** `services/bernard-ui/src/lib/api/types.ts`

```typescript
import type { User } from '@/types/auth';
import type { ThreadListItem, ThreadDetail, ThreadListResponse } from '@/services/api';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
  email?: string;
}

export interface IAPIClient {
  // Auth
  login(credentials: LoginCredentials): Promise<LoginResponse>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<User | null>;
  githubLogin(): Promise<void>;
  googleLogin(): Promise<void>;
  updateProfile(data: UpdateProfileRequest): Promise<User>;
  
  // Threads
  listThreads(limit?: number): Promise<ThreadListResponse>;
  getThread(threadId: string): Promise<ThreadDetail>;
  createThread(): Promise<{ thread_id: string }>;
  updateThread(threadId: string, name: string): Promise<{ id: string; name: string; updated: boolean }>;
  deleteThread(threadId: string): Promise<{ id: string; deleted: boolean }>;
  autoRenameThread(
    threadId: string,
    firstMessage?: string,
    messages?: Array<{ type: string; content: unknown }>
  ): Promise<{ success: boolean; threadId: string; name: string }>;
  
  // Users
  listUsers(): Promise<User[]>;
  createUser(userData: { id: string; displayName: string; isAdmin: boolean }): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<User>;
  
  // Tasks
  getTasks(includeArchived?: boolean, limit?: number, offset?: number): Promise<any>;
  getTask(taskId: string): Promise<any>;
}
```

**File:** `services/bernard-ui/src/lib/api/client.ts`

```typescript
import type { IAPIClient, LoginCredentials, LoginResponse, UpdateProfileRequest } from './types';
import type { User } from '@/types/auth';
import type { ThreadListItem, ThreadDetail, ThreadListResponse } from '@/services/api';

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
    if (endpoint.startsWith('/auth/') && !baseUrl) {
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

    const response = await fetch(url, { ...defaultOptions, ...options });

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

  // Auth methods
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    return this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    }, this.authBaseUrl);
  }

  async logout(): Promise<void> {
    return this.request<void>('/auth/logout', { method: 'POST' }, this.authBaseUrl);
  }

  async getCurrentUser(): Promise<User | null> {
    const now = Date.now();
    const cacheTtlMs = 2000;

    if (this.currentUserCache && now - this.currentUserCache.cachedAtMs < cacheTtlMs) {
      return this.currentUserCache.user;
    }

    if (this.currentUserInFlight) return this.currentUserInFlight;

    this.currentUserInFlight = this.request<{ user: User | null }>('/auth/me', undefined, this.authBaseUrl)
      .then((response) => {
        this.currentUserCache = { user: response.user, cachedAtMs: Date.now() };
        return response.user;
      })
      .finally(() => { this.currentUserInFlight = null; });

    return this.currentUserInFlight;
  }

  async githubLogin(): Promise<void> {
    window.location.href = '/auth/login?provider=github';
  }

  async googleLogin(): Promise<void> {
    window.location.href = '/auth/login?provider=google';
  }

  async updateProfile(data: UpdateProfileRequest): Promise<User> {
    const response = await this.request<{ user: User }>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(data)
    }, this.authBaseUrl);
    return response.user;
  }

  // Thread methods
  async listThreads(limit: number = 50): Promise<ThreadListResponse> {
    const response = await fetch(`/threads/search`, {
      credentials: 'same-origin',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      body: JSON.stringify({ limit, order: 'desc', checkpoint_filters: [], thread_filters: [] })
    });

    if (!response.ok) throw new Error('Failed to fetch threads');

    const result = await response.json();
    const threads: ThreadListItem[] = Array.isArray(result) ? result.map((t: any) => ({
      id: t.thread_id, name: t.metadata?.name, createdAt: t.created_at,
      lastTouchedAt: t.updated_at, messageCount: t.metadata?.messageCount || 0
    })) : [];

    return { threads, total: threads.length, hasMore: false };
  }

  async getThread(threadId: string): Promise<ThreadDetail> {
    const response = await fetch(`/threads/${threadId}`, {
      credentials: 'same-origin',
      headers: this.getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch thread');
    return response.json();
  }

  async createThread(): Promise<{ thread_id: string }> {
    const response = await fetch(`/threads`, {
      credentials: 'same-origin',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      body: JSON.stringify({})
    });
    if (!response.ok) throw new Error('Failed to create thread');
    return response.json();
  }

  async updateThread(threadId: string, name: string): Promise<{ id: string; name: string; updated: boolean }> {
    const response = await fetch(`/threads/${threadId}`, {
      credentials: 'same-origin',
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      body: JSON.stringify({ name })
    });
    if (!response.ok) throw new Error('Failed to update thread');
    return response.json();
  }

  async deleteThread(threadId: string): Promise<{ id: string; deleted: boolean }> {
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
  ): Promise<{ success: boolean; threadId: string; name: string }> {
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

  // User methods
  async listUsers(): Promise<User[]> {
    const response = await this.request<{ users: User[] }>('/users');
    return response.users || [];
  }

  async createUser(userData: { id: string; displayName: string; isAdmin: boolean }): Promise<User> {
    const response = await this.request<{ user: User }>('/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
    return response.user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const response = await this.request<{ user: User }>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
    return response.user;
  }

  async deleteUser(id: string): Promise<User> {
    const response = await this.request<{ user: User }>(`/users/${id}`, { method: 'DELETE' });
    return response.user;
  }

  // Task methods
  async getTasks(includeArchived: boolean = false, limit: number = 50, offset: number = 0): Promise<any> {
    const params = new URLSearchParams({ includeArchived: String(includeArchived), limit: String(limit), offset: String(offset) });
    const response = await fetch(`${this.baseUrl}/tasks?${params}`, {
      credentials: 'same-origin',
      headers: this.getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch tasks');
    return response.json();
  }

  async getTask(taskId: string): Promise<any> {
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

// Default export for existing code
export const apiClient = getAPIClient();
```

**Update imports in dependent files:**
```typescript
// Before
import { apiClient } from '../services/api';

// After
import { apiClient } from '../lib/api/client';
// or for testing:
import { createAPIClient, setAPIClient } from '../lib/api/client';
import { createMockAPIClient } from '../test/mocks/api';
```

---

#### P1.2: Create Browser Abstraction Layer

**File:** `services/bernard-ui/src/lib/browser/index.ts`

```typescript
export interface BrowserStorageAPI {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

export interface BrowserLocationAPI {
  href: string;
  assign(url: string): void;
  replace(url: string): void;
  reload(): void;
}

export interface BrowserDocumentAPI {
  documentElement: {
    classList: {
      add(className: string): void;
      remove(className: string): void;
      toggle(className: string, force?: boolean): boolean;
      contains(className: string): boolean;
    };
  };
}

export interface BrowserClipboardAPI {
  writeText(text: string): Promise<void>;
  readText(): Promise<string>;
}

export interface BrowserURLAPI {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export interface BrowserAPI {
  localStorage: BrowserStorageAPI;
  sessionStorage: BrowserStorageAPI;
  location: BrowserLocationAPI;
  document: BrowserDocumentAPI;
  clipboard: BrowserClipboardAPI;
  URL: BrowserURLAPI;
  userAgent: string;
  onLine: boolean;
}

// Default implementation using window
export const browserAPI: BrowserAPI = {
  localStorage: {
    getItem: (key) => (typeof window !== 'undefined' ? window.localStorage.getItem(key) : null),
    setItem: (key, value) => { if (typeof window !== 'undefined') window.localStorage.setItem(key, value); },
    removeItem: (key) => { if (typeof window !== 'undefined') window.localStorage.removeItem(key); },
    clear: () => { if (typeof window !== 'undefined') window.localStorage.clear(); },
  },
  sessionStorage: {
    getItem: (key) => (typeof window !== 'undefined' ? window.sessionStorage.getItem(key) : null),
    setItem: (key, value) => { if (typeof window !== 'undefined') window.sessionStorage.setItem(key, value); },
    removeItem: (key) => { if (typeof window !== 'undefined') window.sessionStorage.removeItem(key); },
    clear: () => { if (typeof window !== 'undefined') window.sessionStorage.clear(); },
  },
  location: {
    get href() { return typeof window !== 'undefined' ? window.location.href : ''; },
    assign(url) { if (typeof window !== 'undefined') window.location.assign(url); },
    replace(url) { if (typeof window !== 'undefined' && window.location.replace) window.location.replace(url); },
    reload() { if (typeof window !== 'undefined') window.location.reload(); },
  },
  document: {
    get documentElement() {
      if (typeof document === 'undefined') return { classList: { add: () => {}, remove: () => {}, toggle: () => false, contains: () => false } };
      return {
        classList: {
          add: (cls) => document.documentElement.classList.add(cls),
          remove: (cls) => document.documentElement.classList.remove(cls),
          toggle: (cls, force) => document.documentElement.classList.toggle(cls, force),
          contains: (cls) => document.documentElement.classList.contains(cls),
        },
      };
    },
  },
  clipboard: {
    async writeText(text) {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    },
    async readText() {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        return navigator.clipboard.readText();
      }
      return '';
    },
  },
  URL: {
    createObjectURL(blob) {
      if (typeof URL !== 'undefined' && typeof window !== 'undefined') {
        return URL.createObjectURL(blob);
      }
      return '';
    },
    revokeObjectURL(url) {
      if (typeof URL !== 'undefined' && typeof window !== 'undefined') {
        URL.revokeObjectURL(url);
      }
    },
  },
  get userAgent() { return typeof navigator !== 'undefined' ? navigator.userAgent : ''; },
  get onLine() { return typeof navigator !== 'undefined' ? navigator.onLine : true; },
};

// Export for testing - allows replacement with mock
let _browserAPI: BrowserAPI = browserAPI;

export function setBrowserAPI(api: BrowserAPI): void {
  _browserAPI = api;
}

export function getBrowserAPI(): BrowserAPI {
  return _browserAPI;
}

// Reset to default (useful for test cleanup)
export function resetBrowserAPI(): void {
  _browserAPI = browserAPI;
}
```

---

### P2: Component-Level Refactoring

#### P2.1: Extract useAutoRename Hook

**File:** `services/bernard-ui/src/hooks/useAutoRename.ts`

```typescript
import { useEffect, useRef } from 'react';
import type { Message } from '@langchain/langgraph-sdk';
import { getAPIClient } from '../lib/api/client';
import type { IAPIClient } from '../lib/api/types';

interface UseAutoRenameOptions {
  threadId: string | null;
  messages: Message[];
  onRenameComplete?: () => void;
  apiClient?: IAPIClient;
}

interface UseAutoRenameResult {
  hasTriggeredAutoRename: boolean;
  triggerAutoRename: () => void;
  isAutoRenaming: boolean;
}

export function useAutoRename({
  threadId,
  messages,
  onRenameComplete,
  apiClient = getAPIClient(),
}: UseAutoRenameOptions): UseAutoRenameResult {
  const hasTriggeredAutoRename = useRef(false);
  const isAutoRenaming = useRef(false);

  useEffect(() => {
    hasTriggeredAutoRename.current = false;
  }, [threadId]);

  useEffect(() => {
    const shouldTrigger = 
      threadId && 
      !hasTriggeredAutoRename.current &&
      messages.length === 2;

    if (!shouldTrigger) return;

    const firstHumanMessage = messages.find(m => m.type === 'human');
    if (!firstHumanMessage) return;

    const messageContent = typeof firstHumanMessage.content === 'string'
      ? firstHumanMessage.content
      : JSON.stringify(firstHumanMessage.content);

    hasTriggeredAutoRename.current = true;
    isAutoRenaming.current = true;

    apiClient.autoRenameThread(threadId, messageContent)
      .then(() => {
        onRenameComplete?.();
      })
      .catch((err) => {
        console.error('Auto-rename failed:', err);
      })
      .finally(() => {
        isAutoRenaming.current = false;
      });
  }, [threadId, messages, apiClient, onRenameComplete]);

  const triggerAutoRename = () => {
    if (!threadId || isAutoRenaming.current) return;

    const firstHumanMessage = messages.find(m => m.type === 'human');
    if (!firstHumanMessage) return;

    const messageContent = typeof firstHumanMessage.content === 'string'
      ? firstHumanMessage.content
      : JSON.stringify(firstHumanMessage.content);

    isAutoRenaming.current = true;
    hasTriggeredAutoRename.current = true;

    apiClient.autoRenameThread(threadId, messageContent)
      .then(() => {
        onRenameComplete?.();
      })
      .catch((err) => {
        console.error('Auto-rename failed:', err);
      })
      .finally(() => {
        isAutoRenaming.current = false;
      });
  };

  return {
    hasTriggeredAutoRename: hasTriggeredAutoRename.current,
    triggerAutoRename,
    isAutoRenaming: isAutoRenaming.current,
  };
}
```

---

#### P2.2: Extract useChatInput Hook

**File:** `services/bernard-ui/src/hooks/useChatInput.ts`

```typescript
import { useState, useCallback, KeyboardEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Message } from '@langchain/langgraph-sdk';

interface UseChatInputOptions {
  onSubmit: (message: Message) => void;
  isLoading: boolean;
  existingMessages?: Message[];
  uuidGenerator?: () => string;
}

interface UseChatInputResult {
  input: string;
  setInput: (value: string) => void;
  handleSubmit: (e?: React.FormEvent) => void;
  handleKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  canSubmit: boolean;
}

export function useChatInput({
  onSubmit,
  isLoading,
  existingMessages = [],
  uuidGenerator = () => uuidv4(),
}: UseChatInputOptions): UseChatInputResult {
  const [input, setInput] = useState('');

  const canSubmit = input.trim().length > 0 && !isLoading;

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;

    const newMessage: Message = {
      id: uuidGenerator(),
      type: 'human',
      content: input.trim(),
    };

    onSubmit(newMessage);
    setInput('');
  }, [input, canSubmit, onSubmit, uuidGenerator]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }, []);

  return {
    input,
    setInput,
    handleSubmit,
    handleKeyDown,
    canSubmit,
  };
}
```

---

#### P2.3: Extract useChatHistoryExport Hook

**File:** `services/bernard-ui/src/hooks/useChatHistoryExport.ts`

```typescript
import { useCallback } from 'react';
import type { Message } from '@langchain/langgraph-sdk';
import { getBrowserAPI } from '../lib/browser';
import { toast } from 'sonner';

interface UseChatHistoryExportOptions {
  messages: Message[];
}

interface UseChatHistoryExportResult {
  copyToClipboard: () => Promise<void>;
  downloadAsJson: () => void;
  formatMessage: (msg: Message) => { role: 'user' | 'assistant'; content: string };
}

export function useChatHistoryExport({ messages }: UseChatHistoryExportOptions): UseChatHistoryExportResult {
  const browserAPI = getBrowserAPI();

  const formatMessage = useCallback((msg: Message) => ({
    role: msg.type === 'human' ? 'user' as const : 'assistant' as const,
    content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
  }), [messages]);

  const copyToClipboard = useCallback(async () => {
    const historyData = messages.map(formatMessage);
    await browserAPI.clipboard.writeText(JSON.stringify(historyData, null, 2));
    toast.success('Chat history copied to clipboard');
  }, [messages, formatMessage, browserAPI.clipboard]);

  const downloadAsJson = useCallback(() => {
    const historyData = messages.map(formatMessage);
    const blob = new Blob([JSON.stringify(historyData, null, 2)], { type: 'application/json' });
    const url = browserAPI.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bernard-chat-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    browserAPI.URL.revokeObjectURL(url);
    toast.success('Chat history downloaded');
  }, [messages, formatMessage, browserAPI.URL]);

  return {
    copyToClipboard,
    downloadAsJson,
    formatMessage,
  };
}
```

---

#### P2.4: Add Injection Points to Thread Component

**Refactored Thread.tsx:**

```typescript
import { useState, useEffect, FormEvent, useRef, memo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { useStreamContext } from '../../providers/StreamProvider';
import { useDarkMode } from '../../hooks/useDarkMode';
import { useThreads } from '../../providers/ThreadProvider';
import { ConversationHistory, useSidebarState } from './ConversationHistory';
import { HumanMessage } from './messages/human';
import { AssistantMessage, AssistantMessageLoading } from './messages/ai';
import { ProgressIndicator } from './messages/progress';
import { cn } from '../../lib/utils';
import { ensureToolCallsHaveResponses, DO_NOT_RENDER_ID_PREFIX } from '../../lib/ensure-tool-responses';
import { PanelRightOpen, PenSquare, MoreVertical, Ghost, Plus, Copy, Download, Sun, Moon, Send, StopCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { Message, Checkpoint } from '@langchain/langgraph-sdk';
import { apiClient } from '../../lib/api/client';

// NEW: Props interface for injection points
export interface ThreadProps {
  // For testing - provide mock stream context
  streamContext?: ReturnType<typeof useStreamContext>;
  // For testing - provide mock dark mode state
  darkModeState?: { isDarkMode: boolean; toggleDarkMode: () => void };
  // For testing - provide mock thread provider
  threadContext?: ReturnType<typeof useThreads>;
  // For testing - provide mock sidebar state
  sidebarState?: [boolean, (value: boolean) => void];
  // For testing - override auto-rename function
  onAutoRename?: (threadId: string, content: string) => Promise<void>;
  // For testing - override clipboard copy
  onCopyChatHistory?: () => Promise<void>;
  // For testing - override download
  onDownloadChatHistory?: () => void;
  // For testing - provide custom UUID generator
  uuidGenerator?: () => string;
}

export function Thread({
  streamContext: injectedStreamContext,
  darkModeState: injectedDarkModeState,
  threadContext: injectedThreadContext,
  sidebarState: injectedSidebarState,
  onAutoRename,
  onCopyChatHistory,
  onDownloadChatHistory,
  uuidGenerator = uuidv4,
}: ThreadProps = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const threadId = searchParams.get('threadId');

  // Use injected or real context
  const stream = injectedStreamContext ?? useStreamContext();
  const { messages, submit, isLoading, stop } = stream;
  const darkMode = injectedDarkModeState ?? useDarkMode();
  const { isDarkMode, toggleDarkMode } = darkMode;
  const sidebar = injectedSidebarState ?? useSidebarState();
  const [sidebarOpen, setSidebarOpen] = sidebar;
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [input, setInput] = useState('');
  const [isGhostMode, setIsGhostMode] = useState(false);
  const prevMessageLength = useRef(0);
  const { getThreads } = injectedThreadContext ?? useThreads();

  // Auto-rename hook with injection
  useEffect(() => {
    if (onAutoRename && threadId && messages.length === 2) {
      const firstHumanMessage = messages.find(m => m.type === 'human');
      if (firstHumanMessage) {
        const messageContent = typeof firstHumanMessage.content === 'string'
          ? firstHumanMessage.content
          : JSON.stringify(firstHumanMessage.content);
        
        onAutoRename(threadId, messageContent)
          .then(() => getThreads())
          .catch(err => console.error('Auto-rename failed:', err));
      }
    }
  }, [threadId, messages, onAutoRename, getThreads]);

  useEffect(() => {
    setInput('');
    prevMessageLength.current = 0;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [threadId]);

  useEffect(() => {
    prevMessageLength.current = messages.length;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const newHumanMessage: Message = {
      id: uuidGenerator(),
      type: 'human',
      content: input.trim(),
    };

    const toolMessages = ensureToolCallsHaveResponses(messages);
    submit(
      { messages: [...toolMessages, newHumanMessage] },
      {
        streamMode: ['values'],
        optimisticValues: (prev: any) => ({
          ...prev,
          messages: [
            ...(prev.messages ?? []),
            ...toolMessages,
            newHumanMessage,
          ],
        }),
      }
    );
    setInput('');
  };

  const handleNewChat = () => {
    setSearchParams({});
  };

  const handleRegenerate = (
    parentCheckpoint: Checkpoint | null | undefined,
  ) => {
    prevMessageLength.current = prevMessageLength.current - 1;
    stream.submit(undefined, {
      checkpoint: parentCheckpoint,
      streamMode: ['values'],
    });
  };

  const handleCopyChatHistory = onCopyChatHistory ?? async () => {
    const historyData = messages.map(msg => ({
      role: msg.type === 'human' ? 'user' : 'assistant',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    }));
    await navigator.clipboard.writeText(JSON.stringify(historyData, null, 2));
    toast.success('Chat history copied to clipboard');
  };

  const handleDownloadChatHistory = onDownloadChatHistory ?? () => {
    const historyData = messages.map(msg => ({
      role: msg.type === 'human' ? 'user' : 'assistant',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    }));
    const blob = new Blob([JSON.stringify(historyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bernard-chat-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Chat history downloaded');
  };

  const toggleSidebar = () => setSidebarOpen((prev: boolean) => !prev);
  const chatStarted = messages.length > 0;

  return (
    <div className="flex w-full h-screen overflow-hidden bg-background">
      <ConversationHistory />
      
      <motion.div
        className="flex-1 flex flex-col min-w-0"
        animate={{ marginLeft: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {/* Header - omitted for brevity */}
        <div className="flex items-center justify-between gap-3 p-2 border-b bg-background/95 backdrop-blur-sm shrink-0">
          {/* ... header content ... */}
        </div>

        {/* Messages - omitted for brevity */}
        <div className="flex-1 overflow-y-auto px-4">
          {/* ... messages content ... */}
        </div>

        {/* Input - omitted for brevity */}
        <div className="p-4 shrink-0">
          {/* ... input content ... */}
        </div>
      </motion.div>
    </div>
  );
}

export default memo(Thread);
```

---

### P3: Test Infrastructure Improvements

#### P3.1: Update Test Index Exports

**File:** `services/bernard-ui/src/test/index.ts`

```typescript
// Render utilities
export { renderWithProviders } from './render';

// Providers
export { MockStreamProvider, createMockStreamContext, useMockStreamContext } from './providers/StreamProvider';
export { MockThreadProvider, createMockThreadContext, useMockThreadContext } from './providers/ThreadProvider';
export { MockAuthProvider, createMockAuthContext, useMockAuthContext } from './providers/AuthProvider';

// Mocks
export { mockFetch } from './mocks/api';
export { createMockAPIClient } from './mocks/api';
export { mockRouter } from './mocks/router';
export { mockStream, createMockChunkedStream } from './mocks/stream';

// Fixtures
export { mockThread, mockThreads, mockMessage, mockBranch } from './fixtures/threads';
export { mockServices, mockServiceStatus } from './fixtures/services';

// Utilities
export * from '@testing-library/react';
export { userEvent } from '@testing-library/user-event';
```

---

#### P3.2: Create Mock API Client

**File:** `services/bernard-ui/src/test/mocks/api.ts`

```typescript
import { vi } from 'vitest';
import type { IAPIClient } from '@/lib/api/types';
import type { User } from '@/types/auth';
import type { ThreadListItem, ThreadListResponse } from '@/services/api';

export function createMockAPIClient(overrides: Partial<IAPIClient> = {}): IAPIClient {
  const mock: IAPIClient = {
    // Auth
    login: vi.fn().mockResolvedValue({
      user: { id: '1', email: 'test@example.com', displayName: 'Test User', isAdmin: false },
      accessToken: 'mock-token',
    }),
    logout: vi.fn().mockResolvedValue(undefined),
    getCurrentUser: vi.fn().mockResolvedValue(null),
    githubLogin: vi.fn().mockResolvedValue(undefined),
    googleLogin: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue({ id: '1', email: 'test@example.com', displayName: 'Updated', isAdmin: false }),
    
    // Threads
    listThreads: vi.fn().mockResolvedValue({ threads: [], total: 0, hasMore: false }),
    getThread: vi.fn().mockResolvedValue({ id: '1', checkpoints: [], checkpointCount: 0 }),
    createThread: vi.fn().mockResolvedValue({ thread_id: 'new-thread' }),
    updateThread: vi.fn().mockResolvedValue({ id: '1', name: 'Updated', updated: true }),
    deleteThread: vi.fn().mockResolvedValue({ id: '1', deleted: true }),
    autoRenameThread: vi.fn().mockResolvedValue({ success: true, threadId: '1', name: 'New Name' }),
    
    // Users
    listUsers: vi.fn().mockResolvedValue([]),
    createUser: vi.fn().mockResolvedValue({ id: '1', email: 'new@example.com', displayName: 'New User', isAdmin: false }),
    updateUser: vi.fn().mockResolvedValue({ id: '1', email: 'updated@example.com', displayName: 'Updated', isAdmin: false }),
    deleteUser: vi.fn().mockResolvedValue({ id: '1', email: 'deleted@example.com', displayName: 'Deleted', isAdmin: false }),
    
    // Tasks
    getTasks: vi.fn().mockResolvedValue({ tasks: [], total: 0, hasMore: false }),
    getTask: vi.fn().mockResolvedValue({ task: {}, events: [], sections: {}, messages: [] }),
    
    ...overrides,
  };
  
  return mock;
}

export function mockFetch() {
  const mock = vi.fn() as ReturnType<typeof vi.fn>;
  globalThis.fetch = mock as any;
  return {
    mock,
    mockResolvedResponse<T>(data: T, ok: boolean = true) {
      mock.mockResolvedValue({
        ok,
        status: ok ? 200 : 400,
        json: async () => data,
        body: new ReadableStream(),
      });
    },
    mockRejectedResponse(error: Error | string) {
      const err = typeof error === 'string' ? new Error(error) : error;
      mock.mockRejectedValue(err);
    },
    reset() {
      mock.mockClear();
    },
  };
}
```

---

## Implementation Order

### Week 1: P0 Critical Infrastructure

1. **Day 1-2**: Create mock providers (MockStreamProvider, MockThreadProvider, MockAuthProvider)
2. **Day 3-4**: Remove BranchSwitcher duplicate from human.tsx
3. **Day 5**: Update test index exports, verify existing tests still pass

### Week 2: P1 High-Impact Refactoring

1. **Day 1-2**: Create API client interface and refactor api.ts
2. **Day 3-4**: Create browser abstraction layer
3. **Day 5**: Update ThreadProvider to use injectable API client

### Week 3: P2 Component Refactoring

1. **Day 1-2**: Extract useAutoRename hook
2. **Day 2-3**: Extract useChatInput hook
3. **Day 4-5**: Add injection points to Thread component

### Week 4: P3 Testing & Verification

1. **Day 1-2**: Write initial unit tests for extracted hooks
2. **Day 3-4**: Test Thread component with mocks
3. **Day 5**: Verify all changes work together, fix any issues

---

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Thread.tsx testability score | 2/10 | 8/10 | Manual review |
| ConversationHistory.tsx testability | 3/10 | 8/10 | Manual review |
| Mock provider count | 0 | 3 | File count |
| Extracted hooks | 0 | 4 | Hook count |
| Unit test count | 0 | 20+ | Test files |
| Duplicate code (BranchSwitcher) | 62 lines | 0 | Lines removed |

---

## Rollback Plan

If any refactoring causes issues:

1. **API client**: Revert to importing from `services/api.ts`
2. **Browser abstraction**: Revert to direct window/localStorage usage
3. **Mock providers**: Keep as optional - existing tests don't need them
4. **Extracted hooks**: Can be inlined back if issues arise

All changes are backwards compatible except:
- Imports from `services/api.ts` need to be updated to `lib/api/client.ts`
- Direct `localStorage`/`window` access needs to be replaced with browser API

---

## Related Files

### Files to Create
- `services/bernard-ui/src/test/providers/StreamProvider.tsx`
- `services/bernard-ui/src/test/providers/ThreadProvider.tsx`
- `services/bernard-ui/src/test/providers/AuthProvider.tsx`
- `services/bernard-ui/src/lib/api/types.ts`
- `services/bernard-ui/src/lib/api/client.ts`
- `services/bernard-ui/src/lib/browser/index.ts`
- `services/bernard-ui/src/hooks/useAutoRename.ts`
- `services/bernard-ui/src/hooks/useChatInput.ts`
- `services/bernard-ui/src/hooks/useChatHistoryExport.ts`
- `services/bernard-ui/src/test/mocks/api.ts`

### Files to Modify
- `services/bernard-ui/src/test/index.ts` (update exports)
- `services/bernard-ui/src/components/chat/messages/human.tsx` (remove duplicate)
- `services/bernard-ui/src/components/chat/Thread.tsx` (add props)
- `services/bernard-ui/src/providers/ThreadProvider.tsx` (inject API client)
- `services/bernard-ui/src/hooks/useAuth.ts` (inject API client)

### Files to Delete (after verification)
- None - all changes are additive or backwards compatible

---

**Plan Created:** January 13, 2026  
**Last Updated:** January 13, 2026  
**Status:** Ready for Implementation
