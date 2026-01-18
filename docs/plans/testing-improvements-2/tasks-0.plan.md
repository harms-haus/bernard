# Bernard Testing Improvements - Tasks 0: Shared Infrastructure
**Generated:** 2026-01-18
**Purpose:** Centralized test infrastructure for all testing plans (A-F)

---

## Executive Summary

This plan defines **shared test infrastructure** that all other testing plans depend on. Creating this first ensures consistent mocking patterns across the codebase and prevents duplication.

### Why This Exists

| Problem | Solution |
|---------|----------|
| 5 plans define `mockUseAuth()` differently | Single auth mock in `core/src/test/mocks/` |
| SSE hooks need EventSource mocking | Centralized `createMockEventSource()` |
| Context providers require test wrappers | Unified wrapper components |
| Inconsistent mock patterns | Standardized mock factories |
| Duplicate mock code | Single source of truth |

### Files Created by This Plan

| File | Purpose | Used By |
|------|---------|---------|
| `core/src/test/mocks/index.ts` | Central mock exports | A, B, C, D, E, F |
| `core/src/test/mocks/auth.ts` | Auth client mocking | A, D, F |
| `core/src/test/mocks/providers.ts` | Context provider mocks | A, C, F |
| `core/src/test/mocks/hooks.ts` | Hook-specific mocks | C, D |
| `core/src/test/mocks/external.ts` | SSE, fetch, clipboard | C, D, E |
| `core/src/test/wrappers/index.ts` | Test wrapper exports | C, D, F |
| `core/src/test/wrappers/component-wrappers.tsx` | Component test wrappers | C, F |
| `core/src/test/wrappers/hook-wrappers.tsx` | Hook test wrappers | D, F |
| `core/src/test/helpers/index.ts` | Test helper exports | A, B, C, D, E, F |
| `core/src/test/helpers/render-helpers.ts` | Render utilities | C, F |
| `core/vitest.setup.ts` | Updated setup file | All |
| `core/src/test/README.md` | Documentation | All |

### Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                    tasks-0.plan.md                          │
│        (Shared Infrastructure - CREATE FIRST)              │
└────────────────────┬────────────────────────────────────────┘
                     │
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
┌─────────┐    ┌─────────┐    ┌─────────┐
│  A      │    │  B      │    │  C      │
│ Auth,   │    │  API     │    │ Components
│ Pages   │    │ Routes  │    │ Providers
└─────────┘    └─────────┘    └─────────┘
     │               │               │
     └───────────────┼───────────────┘
                     ▼
┌─────────┐    ┌─────────┐    ┌─────────┐
│  D      │    │  E      │    │  F      │
│ Hooks   │    │ Libraries│    │ Pages   │
└─────────┘    └─────────┘    └─────────┘
```

---

## Part A: Mock Infrastructure (from tasks-A, C, D, E, F)

### A.1 Existing Mocks (16 files already exist!)

The codebase already has comprehensive mocks in `core/src/test/mocks/`:

| File | Purpose | Factory Function |
|------|---------|------------------|
| `redis.ts` | Redis client | `createRedisMock()`, `createConnectedRedisMock()` |
| `bullmq.ts` | Queue/jobs | `createMockQueue()`, `createMockWorker()` |
| `fetch.ts` | HTTP fetch | `createMockFetch()`, `enableGlobalMockFetch()` |
| `child-process.ts` | Process spawn | `createSpawnMock()` |
| `axios.ts` | HTTP client | `createAxiosMock()` |
| `cookie-store.ts` | Auth cookies | `createCookieStoreForScenario()` |
| `health-checker.ts` | Health checks | `createMockHealthChecker()` |
| `service-manager.ts` | Service lifecycle | `createMockServiceManager()` |
| `stream.ts` | Readable streams | `createMockStream()` |
| `settings-store.ts` | Settings cache | `createMockSettingsStore()` |
| `api.ts` | API client | `createMockApiClient()` |
| `router.ts` | Next.js router | `createMockRouter()` |
| `redis-client.ts` | Redis connection | `createMockRedisClient()` |
| `crypto.ts` | Encryption | `createMockCrypto()` |

### A.2 Auth-Specific Mocks

Create `core/src/test/mocks/auth.ts`:

```typescript
// core/src/test/mocks/auth.ts
import { vi } from 'vitest';

// ============================================================================
// User Fixtures
// ============================================================================

export const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  role: 'user' as const,
  status: 'active' as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const mockAdminUser = {
  ...mockUser,
  role: 'admin' as const,
};

export const mockGuestUser = {
  ...mockUser,
  role: 'guest' as const,
};

// ============================================================================
// Mock Auth State
// ============================================================================

export interface MockAuthState {
  user: typeof mockUser | typeof mockAdminUser | typeof mockGuestUser | null;
  loading: boolean;
  error: string | null;
}

export const createMockAuthState = (overrides: Partial<MockAuthState> = {}): MockAuthState => ({
  user: mockUser,
  loading: false,
  error: null,
  ...overrides,
});

// ============================================================================
// Mock AuthClient (Better-Auth)
// ============================================================================

export const createMockAuthClient = () => ({
  useSession: vi.fn(),
  signIn: {
    email: vi.fn(),
  },
  signUp: {
    email: vi.fn(),
  },
  signOut: vi.fn(),
  signIn: {
    social: vi.fn(),
  },
  updateUser: vi.fn(),
});

// ============================================================================
// Mock Session Response
// ============================================================================

export const createMockSession = (user = mockUser) => ({
  session: {
    id: 'session-123',
    userId: user.id,
    expiresAt: new Date(Date.now() + 3600000),
  },
  user: {
    id: user.id,
    email: user.email,
    name: user.displayName,
    role: user.role,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});

// ============================================================================
// Mock Auth Error
// ============================================================================

export const createMockAuthError = (message: string) => ({
  error: {
    message,
    code: 'AUTH_ERROR',
  },
});

// ============================================================================
// Mock useAuth Hook
// ============================================================================

export const mockUseAuth = (overrides: Record<string, unknown> = {}) => ({
  state: createMockAuthState(overrides.state as Partial<MockAuthState>),
  login: vi.fn().mockResolvedValue(undefined),
  githubLogin: vi.fn().mockResolvedValue(undefined),
  googleLogin: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn().mockResolvedValue({}),
  clearError: vi.fn(),
  ...overrides,
});

export const mockUseAuthAsAdmin = () => mockUseAuth({
  state: { user: mockAdminUser, loading: false, error: null },
});

export const mockUseAuthAsGuest = () => mockUseAuth({
  state: { user: mockGuestUser, loading: false, error: null },
});

export const mockUseAuthLoading = () => mockUseAuth({
  state: { user: null, loading: true, error: null },
});

export const mockUseAuthUnauthenticated = () => mockUseAuth({
  state: { user: null, loading: false, error: null },
});

// ============================================================================
// Mock useAdminAuth Hook
// ============================================================================

export const mockUseAdminAuth = (overrides: Record<string, unknown> = {}) => ({
  isAdmin: false,
  isAdminLoading: false,
  user: null,
  error: null,
  loading: false,
  ...overrides,
});

export const mockUseAdminAuthAsAdmin = () => mockUseAdminAuth({
  isAdmin: true,
  isAdminLoading: false,
  user: mockAdminUser,
  loading: false,
  error: null,
});

export const mockUseAdminAuthLoading = () => mockUseAdminAuth({
  isAdmin: false,
  isAdminLoading: true,
  user: null,
  loading: true,
  error: null,
});
```

### A.3 Context Provider Mocks (from tasks-C)

Create `core/src/test/mocks/providers.ts`:

```typescript
// core/src/test/mocks/providers.ts
import { vi } from 'vitest';
import type { ReactNode } from 'react';

// ============================================================================
// Mock AuthProvider
// ============================================================================

interface MockAuthProviderProps {
  children: ReactNode;
  value?: {
    state: {
      user: Record<string, unknown> | null;
      loading: boolean;
      error: string | null;
    };
    login?: () => Promise<void>;
    logout?: () => Promise<void>;
    updateProfile?: () => Promise<Record<string, unknown>>;
    clearError?: () => void;
  };
}

export const MockAuthProvider = ({ children, value }: MockAuthProviderProps) => (
  <div data-testid="auth-provider">{children}</div>
);

export const createMockAuthProviderValue = (overrides: Record<string, unknown> = {}) => ({
  state: {
    user: null,
    loading: false,
    error: null,
    ...overrides.state,
  },
  login: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn().mockResolvedValue({}),
  clearError: vi.fn(),
  ...overrides,
});

// ============================================================================
// Mock DarkModeProvider
// ============================================================================

export const MockDarkModeProvider = ({ children }: { children: ReactNode }) => (
  <div data-testid="dark-mode-provider">{children}</div>
);

export const createMockDarkModeValue = (isDarkMode = false) => ({
  isDarkMode,
  toggleDarkMode: vi.fn(),
  setDarkMode: vi.fn(),
});

// ============================================================================
// Mock ToastManagerProvider
// ============================================================================

export const MockToastManagerProvider = ({ children }: { children: ReactNode }) => (
  <div data-testid="toast-manager-provider">{children}</div>
);

export const createMockToastManagerValue = () => ({
  toasts: [],
  showToast: vi.fn().mockReturnValue('toast-1'),
  hideToast: vi.fn(),
  clearToasts: vi.fn(),
});

// ============================================================================
// Mock DialogManagerProvider
// ============================================================================

export const MockDialogManagerProvider = ({ children }: { children: ReactNode }) => (
  <div data-testid="dialog-manager-provider">{children}</div>
);

export const createMockDialogManagerValue = () => ({
  dialogs: [],
  openDialog: vi.fn().mockReturnValue('dialog-1'),
  closeDialog: vi.fn(),
  closeAllDialogs: vi.fn(),
});

// ============================================================================
// Mock StreamProvider
// ============================================================================

export const MockStreamProvider = ({ children }: { children: ReactNode }) => (
  <div data-testid="stream-provider">{children}</div>
);

export const createMockStreamContextValue = (overrides: Record<string, unknown> = {}) => ({
  messages: [],
  isLoading: false,
  submit: vi.fn(),
  stop: vi.fn(),
  ...overrides,
});

// ============================================================================
// Mock ThreadProvider
// ============================================================================

export const MockThreadProvider = ({ children }: { children: ReactNode }) => (
  <div data-testid="thread-provider">{children}</div>
);

export const createMockThreadContextValue = (overrides: Record<string, unknown> = {}) => ({
  threads: [],
  createThread: vi.fn(),
  deleteThread: vi.fn(),
  updateThread: vi.fn(),
  ...overrides,
});

// ============================================================================
// Mock Sidebar Provider
// ============================================================================

export const MockSidebarProvider = ({ children }: { children: ReactNode }) => (
  <div data-testid="sidebar-provider">{children}</div>
);

export const createMockSidebarValue = (overrides: Record<string, unknown> = {}) => ({
  isOpen: true,
  header: null,
  menuItems: [],
  footerItems: [],
  setHeader: vi.fn(),
  setMenuItems: vi.fn(),
  addMenuItem: vi.fn(),
  removeMenuItem: vi.fn(),
  updateMenuItem: vi.fn(),
  addFooterItem: vi.fn(),
  clearFooterItems: vi.fn(),
  setIsOpen: vi.fn(),
  toggle: vi.fn(),
  reset: vi.fn(),
  ...overrides,
});

// ============================================================================
// Mock Header Provider
// ============================================================================

export const MockHeaderProvider = ({ children }: { children: ReactNode }) => (
  <div data-testid="header-provider">{children}</div>
);

export const createMockHeaderValue = (overrides: Record<string, unknown> = {}) => ({
  title: 'Bernard',
  subtitle: null,
  actions: [],
  setTitle: vi.fn(),
  setSubtitle: vi.fn(),
  setActions: vi.fn(),
  reset: vi.fn(),
  ...overrides,
});
```

### A.4 Hook-Specific Mocks (from tasks-C, D)

Create `core/src/test/mocks/hooks.ts`:

```typescript
// core/src/test/mocks/hooks.ts
import { vi } from 'vitest';

// ============================================================================
// Mock useHealthStream
// ============================================================================

export const mockUseHealthStream = (overrides: Record<string, unknown> = {}) => ({
  services: {},
  serviceList: [
    {
      service: 'redis',
      name: 'Redis',
      status: 'up' as const,
      timestamp: new Date().toISOString(),
      isChange: false,
    },
    {
      service: 'whisper',
      name: 'Whisper',
      status: 'up' as const,
      timestamp: new Date().toISOString(),
      isChange: false,
    },
    {
      service: 'kokoro',
      name: 'Kokoro',
      status: 'down' as const,
      timestamp: new Date().toISOString(),
      isChange: true,
    },
    {
      service: 'bernard-agent',
      name: 'Bernard Agent',
      status: 'up' as const,
      timestamp: new Date().toISOString(),
      isChange: false,
    },
  ],
  getService: vi.fn().mockReturnValue(null),
  isConnected: true,
  error: null,
  refresh: vi.fn(),
  ...overrides,
});

export const mockUseHealthStreamConnected = () => mockUseHealthStream({
  isConnected: true,
  error: null,
});

export const mockUseHealthStreamDisconnected = () => mockUseHealthStream({
  isConnected: false,
  error: 'Connection lost',
});

export const mockUseHealthStreamLoading = () => mockUseHealthStream({
  isConnected: false,
  error: null,
});

// ============================================================================
// Mock useLogStream
// ============================================================================

export const mockUseLogStream = (overrides: Record<string, unknown> = {}) => ({
  logs: [],
  isConnected: false,
  error: null,
  clearLogs: vi.fn(),
  containerRef: { current: null },
  ...overrides,
});

export const mockUseLogStreamWithLogs = () => mockUseLogStream({
  logs: [
    {
      timestamp: '2024-01-01T00:00:00Z',
      level: 'info',
      service: 'core',
      message: 'Started',
      raw: '2024-01-01T00:00:00Z [info] Started',
    },
    {
      timestamp: '2024-01-01T00:00:01Z',
      level: 'error',
      service: 'core',
      message: 'Failed',
      raw: '2024-01-01T00:00:01Z [error] Failed',
    },
  ],
  isConnected: true,
  error: null,
});

// ============================================================================
// Mock useServiceStatus
// ============================================================================

export const mockUseServiceStatus = (overrides: Record<string, unknown> = {}) => ({
  services: [
    {
      id: 'whisper',
      name: 'Whisper',
      port: 8870,
      status: 'running' as const,
      health: 'healthy' as const,
      uptime: 3600,
    },
    {
      id: 'kokoro',
      name: 'Kokoro',
      port: 8880,
      status: 'stopped' as const,
      health: 'unknown' as const,
    },
  ],
  loading: false,
  error: null,
  refresh: vi.fn(),
  startService: vi.fn().mockResolvedValue(undefined),
  stopService: vi.fn().mockResolvedValue(undefined),
  restartService: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

// ============================================================================
// Mock useDarkMode
// ============================================================================

export const mockUseDarkMode = (overrides: Record<string, unknown> = {}) => ({
  isDarkMode: false,
  toggleDarkMode: vi.fn(),
  setDarkMode: vi.fn(),
  ...overrides,
});

export const mockUseDarkModeEnabled = () => mockUseDarkMode({ isDarkMode: true });

// ============================================================================
// Mock useRouter / useSearchParams
// ============================================================================

export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

export const mockUseRouter = () => mockRouter;

export const mockUseSearchParams = (params: Record<string, string> = {}) => {
  const get = (key: string) => params[key] || null;
  const getAll = (key: string) => params[key] ? [params[key]] : [];
  const has = (key: string) => key in params;
  const entries = () => Object.entries(params);
  const keys = () => Object.keys(params);
  const values = () => Object.values(params);
  const toString = () => new URLSearchParams(params).toString();

  return {
    get,
    getAll,
    has,
    entries,
    keys,
    values,
    toString,
  };
};
```

### A.5 External Dependencies Mocks (from tasks-C, D, E)

Create `core/src/test/mocks/external.ts`:

```typescript
// core/src/test/mocks/external.ts
import { vi } from 'vitest';

// ============================================================================
// Mock EventSource (for SSE hooks)
// ============================================================================

export interface MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onopen: ((event: Event) => void) | null;
  close: () => void;
}

export const createMockEventSource = (): MockEventSource => ({
  onmessage: null,
  onerror: null,
  onopen: null,
  close: vi.fn(),
});

// ============================================================================
// Mock Fetch
// ============================================================================

export type MockFetchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

export const createMockFetch = (response: MockFetchResponse) => {
  return vi.fn().mockResolvedValue(response);
};

export const createMockFetchJson = (data: unknown, status = 200) =>
  createMockFetch({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });

export const createMockFetchError = (message: string, status = 500) =>
  createMockFetch({
    ok: false,
    status,
    statusText: 'Error',
    json: () => Promise.reject(new Error(message)),
    text: () => Promise.reject(new Error(message)),
  });

// ============================================================================
// Mock Navigator Clipboard
// ============================================================================

export const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue(''),
};

// ============================================================================
// Mock URL.createObjectURL
// ============================================================================

export const mockURL = {
  createObjectURL: vi.fn().mockReturnValue('blob:test'),
  revokeObjectURL: vi.fn(),
};

// ============================================================================
// Mock window.matchMedia
// ============================================================================

export const createMockMatchMedia = (matches: boolean) => ({
  matches,
  media: '',
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
});

// ============================================================================
// Mock LocalStorage
// ============================================================================

export const createMockLocalStorage = () => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] || null,
  };
};
```

### A.6 Barrel Export for Mocks

Create `core/src/test/mocks/index.ts`:

```typescript
// core/src/test/mocks/index.ts
export * from './auth';
export * from './providers';
export * from './hooks';
export * from './external';
```

---

## Part B: Test Wrappers (from tasks-C, D)

### B.1 Component Test Wrappers

Create `core/src/test/wrappers/component-wrappers.tsx`:

```typescript
// core/src/test/wrappers/component-wrappers.tsx
import { ReactNode } from 'react';
import { vi, type Mock } from 'vitest';

// Import from mocks (created in Part A)
import type { MockAuthState } from '@/test/mocks/auth';
import type { MockStreamContextValue } from '@/test/mocks/providers';

// ============================================================================
// Auth Wrapper
// ============================================================================

interface AuthWrapperProps {
  children: ReactNode;
  authState?: MockAuthState;
}

export const AuthWrapper = ({ children, authState }: AuthWrapperProps) => {
  const mockState = authState || {
    user: null,
    loading: false,
    error: null,
  };

  vi.doMock('@/hooks/useAuth', () => ({
    useAuth: () => mockState,
  }));

  return <>{children}</>;
};

// ============================================================================
// Admin Wrapper
// ============================================================================

interface AdminWrapperProps {
  children: ReactNode;
  isAdmin?: boolean;
}

export const AdminWrapper = ({ children, isAdmin = false }: AdminWrapperProps) => {
  const mockState = {
    user: isAdmin
      ? { id: 'admin', role: 'admin' }
      : { id: 'user', role: 'user' },
    loading: false,
    error: null,
  };

  vi.doMock('@/hooks/useAdminAuth', () => ({
    useAdminAuth: () => ({
      isAdmin,
      isAdminLoading: false,
      user: mockState.user,
      loading: false,
      error: null,
    }),
  }));

  return <>{children}</>;
};

// ============================================================================
// Stream Wrapper
// ============================================================================

interface StreamWrapperProps {
  children: ReactNode;
  contextValue?: MockStreamContextValue;
}

export const StreamWrapper = ({ children, contextValue }: StreamWrapperProps) => {
  const mockContext = contextValue || {
    messages: [],
    isLoading: false,
    submit: vi.fn(),
    stop: vi.fn(),
  };

  vi.doMock('@/providers/StreamProvider', async () => {
    const actual = await vi.importActual('@/providers/StreamProvider');
    return {
      ...actual,
      useStreamContext: () => mockContext,
    };
  });

  return <>{children}</>;
};

// ============================================================================
// Dark Mode Wrapper
// ============================================================================

interface DarkModeWrapperProps {
  children: ReactNode;
  isDarkMode?: boolean;
}

export const DarkModeWrapper = ({ children, isDarkMode = false }: DarkModeWrapperProps) => {
  vi.doMock('@/hooks/useDarkMode', () => ({
    useDarkMode: () => ({
      isDarkMode,
      toggleDarkMode: vi.fn(),
      setDarkMode: vi.fn(),
    }),
  }));

  return <>{children}</>;
};

// ============================================================================
// Health Stream Wrapper
// ============================================================================

interface HealthStreamWrapperProps {
  children: ReactNode;
  isConnected?: boolean;
  error?: string | null;
}

export const HealthStreamWrapper = ({
  children,
  isConnected = true,
  error = null,
}: HealthStreamWrapperProps) => {
  vi.doMock('@/hooks/useHealthStream', () => ({
    useHealthStream: () => ({
      services: {},
      serviceList: [],
      isConnected,
      error,
      refresh: vi.fn(),
    }),
  }));

  return <>{children}</>;
};

// ============================================================================
// Router Wrapper
// ============================================================================

interface RouterWrapperProps {
  children: ReactNode;
  router?: {
    push?: Mock;
    replace?: Mock;
    back?: Mock;
  };
}

export const RouterWrapper = ({ children, router = {} }: RouterWrapperProps) => {
  vi.doMock('next/navigation', () => ({
    useRouter: () => ({
      push: router.push || vi.fn(),
      replace: router.replace || vi.fn(),
      back: router.back || vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    }),
    useSearchParams: () => mockUseSearchParams(),
  }));

  return <>{children}</>;
};

// Helper
import { mockUseSearchParams } from '@/test/mocks/hooks';
```

### B.2 Hook Test Wrappers

Create `core/src/test/wrappers/hook-wrappers.tsx`:

```typescript
// core/src/test/wrappers/hook-wrappers.tsx
import { ReactNode } from 'react';
import { renderHook, type RenderHookOptions, type RenderHookResult } from '@testing-library/react';
import { vi } from 'vitest';

// ============================================================================
// Auth Provider Wrapper (for useAuth, useAdminAuth)
// ============================================================================

interface AuthProviderWrapperProps {
  children: ReactNode;
  value?: {
    state: {
      user: Record<string, unknown> | null;
      loading: boolean;
      error: string | null;
    };
    login?: () => Promise<void>;
    logout?: () => Promise<void>;
    updateProfile?: () => Promise<Record<string, unknown>>;
    clearError?: () => void;
  };
}

export const AuthProviderWrapper = ({ children, value }: AuthProviderWrapperProps) => {
  const mockValue = value || {
    state: { user: null, loading: false, error: null },
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue({}),
    clearError: vi.fn(),
  };

  vi.doMock('@/hooks/useAuth', () => ({
    useAuth: () => mockValue,
  }));

  return <>{children}</>;
};

export function renderWithAuth<T>(
  callback: () => T,
  options?: Omit<RenderHookOptions<T>, 'wrapper'>
): RenderHookResult<T, T> {
  return renderHook(callback, {
    wrapper: AuthProviderWrapper,
    ...options,
  });
}

// ============================================================================
// Dark Mode Provider Wrapper (for useDarkMode)
// ============================================================================

interface DarkModeProviderWrapperProps {
  children: ReactNode;
  initialValue?: { isDarkMode: boolean };
}

export const DarkModeProviderWrapper = ({
  children,
  initialValue = { isDarkMode: false },
}: DarkModeProviderWrapperProps) => {
  vi.doMock('@/hooks/useDarkMode', () => ({
    useDarkMode: () => ({
      ...initialValue,
      toggleDarkMode: vi.fn(),
      setDarkMode: vi.fn(),
    }),
  }));

  return <>{children}</>;
};

export function renderWithDarkMode<T>(
  callback: () => T,
  options?: Omit<RenderHookOptions<T>, 'wrapper'>
): RenderHookResult<T, T> {
  return renderHook(callback, {
    wrapper: DarkModeProviderWrapper,
    ...options,
  });
}

// ============================================================================
// Toast Manager Wrapper (for useToast, useToastManager)
// ============================================================================

interface ToastManagerWrapperProps {
  children: ReactNode;
}

export const ToastManagerWrapper = ({ children }: ToastManagerWrapperProps) => {
  vi.doMock('@/components/ToastManager', () => ({
    useToastManager: () => ({
      toasts: [],
      showToast: vi.fn().mockReturnValue('toast-1'),
      hideToast: vi.fn(),
      clearToasts: vi.fn(),
    }),
    useToast: () => ({
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    }),
  }));

  return <>{children}</>;
};

// ============================================================================
// Dialog Manager Wrapper (for useDialogManager, useConfirmDialog)
// ============================================================================

interface DialogManagerWrapperProps {
  children: ReactNode;
}

export const DialogManagerWrapper = ({ children }: DialogManagerWrapperProps) => {
  vi.doMock('@/components/DialogManager', () => ({
    useDialogManager: () => ({
      dialogs: [],
      openDialog: vi.fn().mockReturnValue('dialog-1'),
      closeDialog: vi.fn(),
      closeAllDialogs: vi.fn(),
    }),
    useConfirmDialog: () => vi.fn(),
    useAlertDialog: () => vi.fn(),
  }));

  return <>{children}</>;
};

// ============================================================================
// Sidebar Provider Wrapper (for useDynamicSidebar)
// ============================================================================

interface SidebarProviderWrapperProps {
  children: ReactNode;
  initialValue?: {
    isOpen?: boolean;
    menuItems?: unknown[];
    header?: unknown;
  };
}

export const SidebarProviderWrapper = ({
  children,
  initialValue = {},
}: SidebarProviderWrapperProps) => {
  vi.doMock('@/components/dynamic-sidebar/DynamicSidebarProvider', () => ({
    useDynamicSidebar: () => ({
      isOpen: true,
      header: null,
      menuItems: [],
      footerItems: [],
      setHeader: vi.fn(),
      setMenuItems: vi.fn(),
      addMenuItem: vi.fn(),
      removeMenuItem: vi.fn(),
      updateMenuItem: vi.fn(),
      addFooterItem: vi.fn(),
      clearFooterItems: vi.fn(),
      setIsOpen: vi.fn(),
      toggle: vi.fn(),
      reset: vi.fn(),
      ...initialValue,
    }),
  }));

  return <>{children}</>;
};

// ============================================================================
// Header Provider Wrapper (for useDynamicHeader)
// ============================================================================

interface HeaderProviderWrapperProps {
  children: ReactNode;
  initialValue?: {
    title?: string;
    subtitle?: string | null;
    actions?: unknown[];
  };
}

export const HeaderProviderWrapper = ({
  children,
  initialValue = {},
}: HeaderProviderWrapperProps) => {
  vi.doMock('@/components/dynamic-header/DynamicHeaderProvider', () => ({
    useDynamicHeader: () => ({
      title: 'Bernard',
      subtitle: null,
      actions: [],
      setTitle: vi.fn(),
      setSubtitle: vi.fn(),
      setActions: vi.fn(),
      reset: vi.fn(),
      ...initialValue,
    }),
  }));

  return <>{children}</>;
};
```

### B.3 Barrel Export for Wrappers

Create `core/src/test/wrappers/index.ts`:

```typescript
// core/src/test/wrappers/index.ts
export * from './component-wrappers';
export * from './hook-wrappers';
```

---

## Part C: Test Helpers (from tasks-C, D, F)

### C.1 Render Helpers

Create `core/src/test/helpers/render-helpers.ts`:

```typescript
// core/src/test/helpers/render-helpers.ts
import { render, type RenderResult, screen, waitFor } from '@testing-library/react';
import type { Mock } from 'vitest';

// ============================================================================
// Render with Auth
// ============================================================================

export function renderWithAuth(
  ui: React.ReactElement,
  authState?: {
    user: Record<string, unknown> | null;
    loading: boolean;
    error: string | null;
  }
): RenderResult {
  vi.doMock('@/hooks/useAuth', () => ({
    useAuth: () => authState || { user: null, loading: false, error: null },
  }));

  return render(ui);
}

// ============================================================================
// Render with Admin
// ============================================================================

export function renderWithAdmin(ui: React.ReactElement): RenderResult {
  vi.doMock('@/hooks/useAuth', () => ({
    useAuth: () => ({
      user: { id: 'admin', role: 'admin' },
      loading: false,
      error: null,
    }),
  }));

  vi.doMock('@/hooks/useAdminAuth', () => ({
    useAdminAuth: () => ({
      isAdmin: true,
      isAdminLoading: false,
      user: { id: 'admin', role: 'admin' },
      loading: false,
      error: null,
    }),
  }));

  return render(ui);
}

// ============================================================================
// Render with Health Stream
// ============================================================================

export function renderWithHealthStream(
  ui: React.ReactElement,
  healthState?: {
    isConnected: boolean;
    error: string | null;
    serviceList?: unknown[];
  }
): RenderResult {
  vi.doMock('@/hooks/useHealthStream', () => ({
    useHealthStream: () => ({
      services: {},
      serviceList: healthState?.serviceList || [],
      isConnected: healthState?.isConnected ?? true,
      error: healthState?.error ?? null,
      refresh: vi.fn(),
    }),
  }));

  return render(ui);
}

// ============================================================================
// Render with Router
// ============================================================================

export function renderWithRouter(
  ui: React.ReactElement,
  router?: {
    push?: Mock;
    replace?: Mock;
    back?: Mock;
  }
): RenderResult {
  vi.doMock('next/navigation', () => ({
    useRouter: () => ({
      push: router?.push || vi.fn(),
      replace: router?.replace || vi.fn(),
      back: router?.back || vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    }),
    useSearchParams: () => mockUseSearchParams(),
  }));

  return render(ui);
}

// Helper
import { mockUseSearchParams } from '@/test/mocks/hooks';

// ============================================================================
// Async Helpers
// ============================================================================

export async function waitForLoadingComplete(timeout = 5000): Promise<void> {
  await waitFor(
    () => {
      expect(screen.queryByText(/loading/i, { exact: false })).not.toBeInTheDocument();
    },
    { timeout }
  );
}

export async function waitForAsyncOperation(ms = 100): Promise<void> {
  await waitFor(
    () => {},
    { timeout: ms }
  );
}
```

### C.2 Mock Factories

Create `core/src/test/helpers/mock-factories.ts`:

```typescript
// core/src/test/helpers/mock-factories.ts
import { vi, type Mock, SpyInstance } from 'vitest';

// ============================================================================
// Async Mock Factory
// ============================================================================

export function createAsyncMock<T extends (...args: unknown[]) => Promise<unknown>>(
  implementation?: (...args: Parameters<T>) => ReturnType<T>
): Mock<Parameters<T>, ReturnType<T>> {
  return vi.fn(implementation) as Mock<Parameters<T>, ReturnType<T>>;
}

// ============================================================================
// Resolved Value Mock Factory
// ============================================================================

export function mockResolvedValue<T>(value: T): () => Promise<T> {
  return () => Promise.resolve(value);
}

// ============================================================================
// Rejected Value Mock Factory
// ============================================================================

export function mockRejectedValue(error: Error): () => Promise<never> {
  return () => Promise.reject(error);
}

// ============================================================================
// Spy Factory
// ============================================================================

export function createSpy<T extends (...args: unknown[]) => unknown>(
  implementation?: (...args: Parameters<T>) => ReturnType<T>
): SpyInstance<Parameters<T>, ReturnType<T>> {
  return vi.spyOn({ [Math.random()]: () => {} }, Math.random().toString()).mockImplementation(
    implementation as (...args: unknown[]) => unknown
  ) as SpyInstance<Parameters<T>, ReturnType<T>>;
}

// ============================================================================
// Mock Function Factory
// ============================================================================

export function createMockFn<T extends (...args: unknown[]) => unknown>(): Mock<
  Parameters<T>,
  ReturnType<T>
> {
  return vi.fn() as Mock<Parameters<T>, ReturnType<T>>;
}

// ============================================================================
// Once Call Mock Factory
// ============================================================================

export function mockOnce<T>(value: T): () => Promise<T> {
  let called = false;
  return async () => {
    if (called) return value;
    called = true;
    return value;
  };
}

// ============================================================================
// Timeout Mock Factory
// ============================================================================

export function mockWithTimeout<T>(
  value: T,
  delayMs = 100
): () => Promise<T> {
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return value;
  };
}
```

### C.3 Barrel Export for Helpers

Create `core/src/test/helpers/index.ts`:

```typescript
// core/src/test/helpers/index.ts
export * from './render-helpers';
export * from './mock-factories';
```

---

## Part D: Test Setup (from tasks-A, C, F)

Update `core/vitest.setup.ts`:

```typescript
// core/src/vitest.setup.ts
import { vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// ============================================================================
// Global Mocks (loaded for all tests)
// ============================================================================

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: '',
    pathname: '/',
    search: '',
    hash: '',
    protocol: 'http:',
    host: 'localhost',
  },
  writable: true,
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
  writable: true,
});

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(''),
  },
  writable: true,
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock RequestAnimationFrame
global.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16));
global.cancelAnimationFrame = vi.fn((id) => clearTimeout(id));

// ============================================================================
// Cleanup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

afterEach(() => {
  // Clean up any timers
  vi.useRealTimers();
});

// ============================================================================
// Import Shared Mock Infrastructure
// ============================================================================

// These will be available to all tests
import '@/test/mocks';
import '@/test/wrappers';
import '@/test/helpers';
```

---

## Part E: Documentation (from tasks-C)

Create `core/src/test/README.md`:

```markdown
# Test Infrastructure

This directory contains shared test infrastructure used across all test files.

## Structure

```
test/
├── mocks/              # Mock factories and fixtures
│   ├── index.ts        # Barrel export
│   ├── auth.ts         # Auth mocking (useAuth, authClient)
│   ├── providers.ts    # Context provider mocks
│   ├── hooks.ts        # Hook-specific mocks
│   └── external.ts     # External dependencies (EventSource, fetch)
├── wrappers/           # React wrapper components
│   ├── index.ts        # Barrel export
│   ├── component-wrappers.tsx  # Component test wrappers
│   └── hook-wrappers.tsx       # Hook test wrappers
└── helpers/            # Test helper utilities
    ├── index.ts        # Barrel export
    ├── render-helpers.ts      # Rendering utilities
    └── mock-factories.ts      # Mock factories
```

## Usage

### Using Mocks

```typescript
import { mockUseAuth, mockUseAdminAuth, mockUseHealthStream } from '@/test/mocks';
import { createMockAuthClient, createMockEventSource } from '@/test/mocks';
```

### Using Wrappers

```typescript
import { renderWithAuth, renderWithAdmin, renderWithRouter } from '@/test/helpers';
import { AuthProviderWrapper, DarkModeProviderWrapper } from '@/test/wrappers';
```

### Using Helpers

```typescript
import { createMockFetch, createMockEventSource } from '@/test/mocks';
import { waitForLoadingComplete } from '@/test/helpers';
```

## Mock Patterns

### Auth Mock Pattern

```typescript
// Use pre-built mocks
const mockAuth = mockUseAuth();
const mockAdmin = mockUseAdminAuthAsAdmin();

// Or customize
const customMock = mockUseAuth({
  state: { user: { id: '1', role: 'user' }, loading: true, error: null },
});
```

### SSE Mock Pattern

```typescript
import { createMockEventSource } from '@/test/mocks/external';

const mockEventSource = createMockEventSource();
mockEventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle message
};
```

## Best Practices

1. **Import from `@/test/mocks`** for consistency
2. **Use wrappers** for context-dependent hooks
3. **Prefer existing mocks** over creating new ones
4. **Document custom mocks** if needed
5. **Clean up in `afterEach`** (handled automatically)
```

---

## Execution Order

### Phase 1: Create Mocks (Blocking for others)
1. Create `core/src/test/mocks/index.ts`
2. Create `core/src/test/mocks/auth.ts`
3. Create `core/src/test/mocks/providers.ts`
4. Create `core/src/test/mocks/hooks.ts`
5. Create `core/src/test/mocks/external.ts`

### Phase 2: Create Wrappers
1. Create `core/src/test/wrappers/index.ts`
2. Create `core/src/test/wrappers/component-wrappers.tsx`
3. Create `core/src/test/wrappers/hook-wrappers.tsx`

### Phase 3: Create Helpers
1. Create `core/src/test/helpers/index.ts`
2. Create `core/src/test/helpers/render-helpers.ts`
3. Create `core/src/test/helpers/mock-factories.ts`

### Phase 4: Update Setup
1. Update `core/vitest.setup.ts`
2. Create `core/src/test/README.md`

### Phase 5: Update References
1. Update tasks-A.plan.md to reference tasks-0
2. Update tasks-B.plan.md to reference tasks-0
3. Update tasks-C.plan.md to reference tasks-0
4. Update tasks-D.plan.md to reference tasks-0
5. Update tasks-E.plan.md to reference tasks-0
6. Update tasks-F.plan.md to reference tasks-0

---

## Files to Remove from Other Plans

After creating tasks-0.plan.md, remove these sections from the respective plan files:

| Plan | Removed Section | Location |
|------|-----------------|----------|
| A | "Test Infrastructure Requirements" + Auth mocks + Setup | Lines 01383-01533 |
| C | "Mock Infrastructure" | Lines 01452-01542 |
| C | "Existing Test Pattern" | Lines 01454-01481 |
| C | "Component Test Wrappers" | Lines 01483-01542 |
| D | "Mock Infrastructure" | Lines 01078-01129 |
| D | "Hook Test Utilities" | Lines 01091-01129 |
| E | "Mock Infrastructure" | Lines 01172-01227 |
| F | "Test Infrastructure Requirements" + "Required Mocks" + "Test Utilities" | Lines 00059-00206 |

---

## Success Criteria

### File Creation

| File | Status | Evidence |
|------|--------|----------|
| `core/src/test/mocks/index.ts` | ⬜ | Created, exports all mocks |
| `core/src/test/mocks/auth.ts` | ⬜ | Created, exports auth mocks |
| `core/src/test/mocks/providers.ts` | ⬜ | Created, exports provider mocks |
| `core/src/test/mocks/hooks.ts` | ⬜ | Created, exports hook mocks |
| `core/src/test/mocks/external.ts` | ⬜ | Created, exports external mocks |
| `core/src/test/wrappers/index.ts` | ⬜ | Created |
| `core/src/test/wrappers/component-wrappers.tsx` | ⬜ | Created |
| `core/src/test/wrappers/hook-wrappers.tsx` | ⬜ | Created |
| `core/src/test/helpers/index.ts` | ⬜ | Created |
| `core/src/test/helpers/render-helpers.ts` | ⬜ | Created |
| `core/src/test/helpers/mock-factories.ts` | ⬜ | Created |
| `core/vitest.setup.ts` | ⬜ | Updated |
| `core/src/test/README.md` | ⬜ | Created |

### Usage Verification

All other plans should be able to import from shared infrastructure:

```typescript
// These imports should work
import { mockUseAuth, mockUseHealthStream } from '@/test/mocks';
import { AuthProviderWrapper } from '@/test/wrappers';
import { renderWithAuth } from '@/test/helpers';
```

---

**End of Tasks 0**
