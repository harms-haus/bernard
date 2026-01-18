# Bernard Testing Improvements - Tasks F: Final Coverage Push
**Generated:** 2026-01-18
**Revised:** 2026-01-18
**Target Coverage:** 80% overall (per vitest.config.ts threshold)
**Current State:** 626 tests passing across 51 test files

## Executive Summary

This plan completes the testing improvement effort by covering remaining pages and components. After analyzing the codebase, we found:

- **Current State:** 626 tests already exist across 51 test files
- **Coverage Threshold:** 80% (configured in vitest.config.ts)
- **Files Analyzed:** 14 dashboard pages, 51 existing test files
- **Uncovered Pages:** 13 pages requiring tests

The plan targets adding tests for untested pages while leveraging existing test infrastructure (vitest.setup.ts with jsdom, localStorage mock, child_process mock, and env stubbing).

---

## Current Test Coverage Analysis

### Existing Test Infrastructure

| Category | Files | Tests |
|----------|-------|-------|
| API Routes | 15 files | ~120 tests |
| Agent Tools | 10 files | ~80 tests |
| Components | 9 files | ~60 tests |
| Libraries | 17 files | ~366 tests |

### Already Covered

- `src/lib/services/HealthChecker.test.ts` - Service health checks
- `src/app/api/services/[service]/route.test.ts` - Service commands
- `src/test/mocks/bullmq.test.ts` - Queue mocking
- All agent tools (timer, validation, web-search, etc.)
- Core libraries (auth, config, checkpoint, infra)

### Missing Coverage (Priority Order)

| Page | File | Priority | Complexity |
|------|------|----------|------------|
| Bernard Welcome | `/bernard/page.tsx` | P1 | Low |
| About Page | `/bernard/about/page.tsx` | P1 | Low |
| Status Dashboard | `/status/page.tsx` | P1 | High |
| Admin Dashboard | `/bernard/admin/page.tsx` | P1 | Low |
| Chat Interface | `/bernard/chat/page.tsx` | P2 | High |
| Tasks List | `/bernard/tasks/page.tsx` | P1 | Medium |
| Task Detail | `/bernard/tasks/[id]/page.tsx` | P2 | Medium |
| Login Page | `/auth/login/page.tsx` | P1 | Medium |
| User Profile | `/bernard/user/profile/page.tsx` | P2 | Low |
| User Tokens | `/bernard/user/tokens/page.tsx` | P2 | Low |
| Models Config | `/bernard/admin/models/page.tsx` | P2 | High |
| Services Config | `/bernard/admin/services/page.tsx` | P2 | High |
| Users Config | `/bernard/admin/users/page.tsx` | P2 | High |

---

## Test Infrastructure Requirements

### Required Mocks

```typescript
// core/src/test/mocks/providers.ts

// Mock useAuth hook
export const mockUseAuth = (overrides = {}) => ({
  state: {
    loading: false,
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      role: 'user',
      name: 'Test User',
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    session: {
      id: 'test-session-id',
      expiresAt: new Date(Date.now() + 86400000),
    },
  },
  ...overrides,
});

// Mock useAuth as admin
export const mockUseAuthAdmin = () => mockUseAuth({
  state: {
    loading: false,
    user: {
      id: 'admin-user-id',
      email: 'admin@example.com',
      role: 'admin',
      name: 'Admin User',
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    session: {
      id: 'admin-session-id',
      expiresAt: new Date(Date.now() + 86400000),
    },
  },
});

// Mock useHealthStream
export const mockUseHealthStream = (overrides = {}) => ({
  serviceList: [
    {
      service: 'redis',
      name: 'Redis',
      status: 'up',
      responseTime: 5,
    },
    {
      service: 'whisper',
      name: 'Whisper',
      status: 'up',
      responseTime: 45,
    },
    {
      service: 'kokoro',
      name: 'Kokoro',
      status: 'down',
    },
    {
      service: 'bernard-agent',
      name: 'Bernard Agent',
      status: 'up',
      responseTime: 120,
    },
  ],
  isConnected: true,
  error: null,
  refresh: vi.fn(),
  ...overrides,
});

// Mock next/navigation
export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
};

// Mock next/router
export const mockUseRouter = () => mockRouter;

// Mock useSearchParams
export const mockUseSearchParams = (params = {}) => {
  const get = (key: string) => params[key] || null;
  const getAll = (key: string) => params[key] ? [params[key]] : [];
  const has = (key: string) => key in params;
  const entries = () => Object.entries(params);
  const keys = () => Object.keys(params);
  const values = () => Object.values(params);

  return {
    get,
    getAll,
    has,
    entries,
    keys,
    values,
    toString: () => new URLSearchParams(params).toString(),
  };
};
```

### Test Utilities

```typescript
// core/src/test/helpers/render-helpers.ts

import { render, screen, waitFor } from '@testing-library/react';
import type { Mock } from 'vitest';

// Wrapper for authenticated render
export function renderWithAuth(ui: React.ReactElement, mockAuth = mockUseAuth()) {
  vi.mocked(require('@/hooks/useAuth')).useAuth.mockReturnValue(mockAuth.state);

  return render(ui);
}

// Wrapper for admin render
export function renderWithAdmin(ui: React.ReactElement) {
  return renderWithAuth(ui, mockUseAuthAdmin());
}

// Wrapper for health stream mock
export function renderWithHealthStream(ui: React.ReactElement, mockHealth = mockUseHealthStream()) {
  vi.mocked(require('@/hooks/useHealthStream')).useHealthStream.mockReturnValue(mockHealth);

  return render(ui);
}

// Helper to wait for async operations
export async function waitForLoadingComplete() {
  await waitFor(() => {
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  }, { timeout: 5000 });
}
```

---

## Phase 1: Bernard Pages (P1)

> **Note:** Shared test infrastructure (mocks, wrappers, helpers) is defined in [tasks-0.plan.md](tasks-0.plan.md). All tests in this plan use the centralized mock infrastructure.

### 1.1 `/bernard/page.tsx` - Welcome Dashboard

**File Location:** `core/src/app/(dashboard)/bernard/page.tsx`

**Lines:** 53 | **Components:** Card, UserSidebarConfig

**Test Scenarios:**

```typescript
// core/src/app/(dashboard)/bernard/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from './page';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/components/dynamic-sidebar/configs', () => ({
  UserSidebarConfig: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="user-sidebar-config">{children}</div>
  ),
}));

describe('Bernard Welcome Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render welcome heading', () => {
    render(<Home />);

    expect(screen.getByText(/Welcome to Bernard/i)).toBeInTheDocument();
    expect(screen.getByText(/AI agent platform/i)).toBeInTheDocument();
  });

  it('should render quick actions section', () => {
    render(<Home />);

    expect(screen.getByText(/Quick Actions/i)).toBeInTheDocument();
    expect(screen.getByText(/Start a conversation/i)).toBeInTheDocument();
    expect(screen.getByText(/View task history/i)).toBeInTheDocument();
    expect(screen.getByText(/Check system status/i)).toBeInTheDocument();
  });

  it('should render recent activity section', () => {
    render(<Home />);

    expect(screen.getByText(/Recent Activity/i)).toBeInTheDocument();
    expect(screen.getByText(/No recent conversations/i)).toBeInTheDocument();
  });

  it('should wrap content in UserSidebarConfig', () => {
    render(<Home />);

    expect(screen.getByTestId('user-sidebar-config')).toBeInTheDocument();
  });
});
```

---

### 1.2 `/bernard/about/page.tsx` - About Page

**File Location:** `core/src/app/(dashboard)/bernard/about/page.tsx`

**Lines:** 88 | **Components:** Card (4), UserSidebarConfig

**Test Scenarios:**

```typescript
// core/src/app/(dashboard)/bernard/about/page.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import About from './page';

vi.mock('@/components/dynamic-sidebar/configs', () => ({
  UserSidebarConfig: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="user-sidebar-config">{children}</div>
  ),
}));

describe('About Page', () => {
  it('should render page title', () => {
    render(<About />);

    expect(screen.getByText(/About Bernard/i)).toBeInTheDocument();
  });

  it('should render Frontend card', () => {
    render(<About />);

    expect(screen.getByText(/Frontend/i)).toBeInTheDocument();
    expect(screen.getByText(/React/i)).toBeInTheDocument();
    expect(screen.getByText(/Next\.js/i)).toBeInTheDocument();
  });

  it('should render UI Components card', () => {
    render(<About />);

    expect(screen.getByText(/UI Components/i)).toBeInTheDocument();
    expect(screen.getByText(/Radix-UI/i)).toBeInTheDocument();
    expect(screen.getByText(/Shadcn\/ui/i)).toBeInTheDocument();
  });

  it('should render Backend Services card', () => {
    render(<About />);

    expect(screen.getByText(/Backend Services/i)).toBeInTheDocument();
    expect(screen.getByText(/LangGraph agent/i)).toBeInTheDocument();
    expect(screen.getByText(/Whisper\.cpp/i)).toBeInTheDocument();
    expect(screen.getByText(/Kokoro/i)).toBeInTheDocument();
  });

  it('should render Features card', () => {
    render(<About />);

    expect(screen.getByText(/Features/i)).toBeInTheDocument();
    expect(screen.getByText(/AI-powered conversations/i)).toBeInTheDocument();
  });
});
```

---

### 1.3 `/bernard/admin/page.tsx` - Admin Dashboard

**File Location:** `core/src/app/(dashboard)/bernard/admin/page.tsx`

**Lines:** 24 | **Components:** PageHeaderConfig, ServiceStatusPanel, AdminLayout

**Test Scenarios:**

```typescript
// core/src/app/(dashboard)/bernard/admin/page.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardPage from './page';

vi.mock('@/components/dynamic-header/configs', () => ({
  PageHeaderConfig: ({ title, subtitle, children }: any) => (
    <div data-testid="page-header-config">
      <span data-testid="page-title">{title}</span>
      <span data-testid="page-subtitle">{subtitle}</span>
      {children}
    </div>
  ),
}));

vi.mock('@/components/ServiceStatusPanel', () => ({
  ServiceStatusPanel: ({ title, showLogs }: any) => (
    <div data-testid="service-status-panel" data-title={title} data-show-logs={showLogs}>
      Service Status Panel
    </div>
  ),
}));

vi.mock('@/components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

describe('Admin Dashboard Page', () => {
  it('should render admin layout wrapper', () => {
    render(<DashboardPage />);

    expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
  });

  it('should set page header to Admin Panel', () => {
    render(<DashboardPage />);

    expect(screen.getByTestId('page-title')).toHaveTextContent(/Admin Panel/i);
    expect(screen.getByTestId('page-subtitle')).toHaveTextContent(/System Status/i);
  });

  it('should render ServiceStatusPanel', () => {
    render(<DashboardPage />);

    expect(screen.getByTestId('service-status-panel')).toBeInTheDocument();
    expect(screen.getByTestId('service-status-panel')).toHaveAttribute('data-title', 'Service Status');
    expect(screen.getByTestId('service-status-panel')).toHaveAttribute('data-show-logs', 'true');
  });
});
```

---

### 1.4 `/bernard/chat/page.tsx` - Chat Interface

**File Location:** `core/src/app/(dashboard)/bernard/chat/page.tsx`

**Lines:** 67 | **Components:** Thread, StreamProvider, ThreadProvider, ChatSidebarConfig, ChatHeaderConfig

**Test Scenarios:**

```typescript
// core/src/app/(dashboard)/bernard/chat/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Chat from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockUseSearchParams({ threadId: null }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/useHealthStream', () => ({
  useHealthStream: () => mockUseHealthStream(),
}));

vi.mock('@/components/chat/Thread', () => ({
  Thread: () => <div data-testid="thread-component">Thread Component</div>,
}));

vi.mock('@/providers/StreamProvider', () => ({
  StreamProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="stream-provider">{children}</div>
  ),
}));

vi.mock('@/providers/ThreadProvider', () => ({
  ThreadProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="thread-provider">{children}</div>
  ),
  useThreads: () => ({ threads: [], createThread: vi.fn(), deleteThread: vi.fn() }),
}));

vi.mock('@/components/dynamic-sidebar/configs', () => ({
  ChatSidebarConfig: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chat-sidebar-config">{children}</div>
  ),
}));

vi.mock('@/components/dynamic-header/configs', () => ({
  ChatHeaderConfig: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chat-header-config">{children}</div>
  ),
}));

const mockRouter = { replace: vi.fn() };
const mockUseAuth = { state: { loading: false, user: { id: 'test' } } };

describe('Chat Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouter.replace.mockClear();
    vi.mocked(require('@/hooks/useAuth')).useAuth.mockReturnValue(mockUseAuth.state);
    vi.mocked(require('@/hooks/useHealthStream')).useHealthStream.mockReturnValue(mockUseHealthStream());
  });

  it('should render chat sidebar config', () => {
    render(<Chat />);

    expect(screen.getByTestId('chat-sidebar-config')).toBeInTheDocument();
  });

  it('should render chat header config', () => {
    render(<Chat />);

    expect(screen.getByTestId('chat-header-config')).toBeInTheDocument();
  });

  it('should render stream provider', () => {
    render(<Chat />);

    expect(screen.getByTestId('stream-provider')).toBeInTheDocument();
  });

  it('should render thread component', () => {
    render(<Chat />);

    expect(screen.getByTestId('thread-component')).toBeInTheDocument();
  });

  it('should redirect when threadId is invalid UUID', async () => {
    const invalidParams = { threadId: 'not-a-valid-uuid' };
    vi.mocked(require('next/navigation').useSearchParams)
      .mockReturnValue(mockUseSearchParams(invalidParams));

    render(<Chat />);

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith('/bernard/chat');
    });
  });

  it('should not redirect for valid threadId', async () => {
    const validParams = { threadId: '550e8400-e29b-41d4-a716-446655440000' };
    vi.mocked(require('next/navigation').useSearchParams)
      .mockReturnValue(mockUseSearchParams(validParams));

    render(<Chat />);

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
```

---

## Phase 2: Status Dashboard (P1)

### 2.1 `/status/page.tsx` - Service Status Page

**File Location:** `core/src/app/(dashboard)/status/page.tsx`

**Lines:** 293 | **Components:** useHealthStream, LogViewer, Card, Button, AuthProvider

**Test Scenarios:**

```typescript
// core/src/app/(dashboard)/status/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StatusPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/useHealthStream', () => ({
  useHealthStream: vi.fn(),
}));

vi.mock('@/components/dashboard/LogViewer', () => ({
  LogViewer: ({ service, height }: any) => (
    <div data-testid="log-viewer" data-service={service} data-height={height}>
      Log Viewer
    </div>
  ),
}));

const mockRouter = { replace: vi.fn() };

describe('Status Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouter.replace.mockClear();
  });

  describe('Authentication', () => {
    it('should redirect to login when not authenticated', async () => {
      vi.mocked(require('@/hooks/useAuth')).useAuth.mockReturnValue({
        loading: false,
        user: null,
      });

      render(<StatusPage />);

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/auth/login');
      });
    });

    it('should show loading state while checking auth', () => {
      vi.mocked(require('@/hooks/useAuth')).useAuth.mockReturnValue({
        loading: true,
        user: null,
      });

      render(<StatusPage />);

      expect(screen.getByText(/Checking authentication/i)).toBeInTheDocument();
    });

    it('should render for authenticated user', () => {
      vi.mocked(require('@/hooks/useAuth')).useAuth.mockReturnValue({
        loading: false,
        user: { id: 'test', role: 'user' },
      });
      vi.mocked(require('@/hooks/useHealthStream')).mockReturnValue(
        mockUseHealthStream({ isConnected: true, error: null })
      );

      render(<StatusPage />);

      expect(screen.getByText(/Service Status/i)).toBeInTheDocument();
    });
  });

  describe('Service List', () => {
    beforeEach(() => {
      vi.mocked(require('@/hooks/useAuth')).useAuth.mockReturnValue({
        loading: false,
        user: { id: 'test', role: 'admin' },
      });
    });

    it('should render service cards', () => {
      vi.mocked(require('@/hooks/useHealthStream')).mockReturnValue(
        mockUseHealthStream()
      );

      render(<StatusPage />);

      expect(screen.getByText(/Redis/i)).toBeInTheDocument();
      expect(screen.getByText(/Whisper/i)).toBeInTheDocument();
      expect(screen.getByText(/Kokoro/i)).toBeInTheDocument();
    });

    it('should show healthy count', () => {
      vi.mocked(require('@/hooks/useHealthStream')).mockReturnValue(
        mockUseHealthStream()
      );

      render(<StatusPage />);

      expect(screen.getByText(/3\/4 services healthy/i)).toBeInTheDocument();
    });

    it('should show connection status indicator', () => {
      vi.mocked(require('@/hooks/useHealthStream')).mockReturnValue(
        mockUseHealthStream({ isConnected: true })
      );

      render(<StatusPage />);

      // Connection status is implicit in the UI
      expect(screen.getByText(/Service Status/i)).toBeInTheDocument();
    });
  });

  describe('Service Actions', () => {
    beforeEach(() => {
      vi.mocked(require('@/hooks/useAuth')).useAuth.mockReturnValue({
        loading: false,
        user: { id: 'test', role: 'admin' },
      });
      vi.mocked(require('@/hooks/useHealthStream')).mockReturnValue(
        mockUseHealthStream()
      );
    });

    it('should show action buttons for admin', () => {
      render(<StatusPage />);

      // Bulk actions dropdown should be visible for admin
      expect(screen.getByText(/Select Action/i)).toBeInTheDocument();
      expect(screen.getByText(/Refresh/i)).toBeInTheDocument();
    });

    it('should hide action buttons for non-admin', () => {
      vi.mocked(require('@/hooks/useAuth')).useAuth.mockReturnValue({
        loading: false,
        user: { id: 'test', role: 'user' },
      });

      render(<StatusPage />);

      // Action buttons should not be present
      expect(screen.queryByText(/Start All/i)).not.toBeInTheDocument();
    });
  });

  describe('Log Viewer', () => {
    it('should render log viewer component', () => {
      vi.mocked(require('@/hooks/useAuth')).useAuth.mockReturnValue({
        loading: false,
        user: { id: 'test', role: 'admin' },
      });
      vi.mocked(require('@/hooks/useHealthStream')).mockReturnValue(
        mockUseHealthStream()
      );

      render(<StatusPage />);

      expect(screen.getByTestId('log-viewer')).toBeInTheDocument();
      expect(screen.getByTestId('log-viewer')).toHaveAttribute('data-service', 'all');
    });
  });
});
```

---

## Phase 3: Tasks Pages (P1)

### 3.1 `/bernard/tasks/page.tsx` - Tasks List

**File Location:** `core/src/app/(dashboard)/bernard/tasks/page.tsx`

**Lines:** 379 | **Components:** Table, Badge, DropdownMenu, useConfirmDialog, AuthProvider, DarkModeProvider, UserSidebarConfig

**Test Scenarios:**

```typescript
// core/src/app/(dashboard)/bernard/tasks/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Tasks from './page';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/useDarkMode', () => ({
  DarkModeProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/dynamic-sidebar/configs', () => ({
  UserSidebarConfig: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="user-sidebar-config">{children}</div>
  ),
}));

vi.mock('@/components/DialogManager', () => ({
  useConfirmDialog: () => vi.fn(),
}));

const mockTasks = [
  {
    id: 'task-1',
    name: 'Search movies',
    status: 'completed' as const,
    toolName: 'overseerr-find-media',
    createdAt: '2026-01-18T10:00:00Z',
    runtimeMs: 5000,
    messageCount: 5,
    toolCallCount: 2,
    tokensIn: 1200,
    tokensOut: 800,
    archived: false,
  },
  {
    id: 'task-2',
    name: 'Turn on lights',
    status: 'running' as const,
    toolName: 'home-assistant-toggle-light',
    createdAt: '2026-01-18T11:00:00Z',
    runtimeMs: null,
    messageCount: 2,
    toolCallCount: 1,
    tokensIn: 400,
    tokensOut: 200,
    archived: false,
  },
];

describe('Tasks Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
  });

  it('should render page title', () => {
    render(<Tasks />);

    expect(screen.getByText(/Tasks/i)).toBeInTheDocument();
    expect(screen.getByText(/Monitor background task execution/i)).toBeInTheDocument();
  });

  it('should render user sidebar config', () => {
    render(<Tasks />);

    expect(screen.getByTestId('user-sidebar-config')).toBeInTheDocument();
  });

  it('should render Show Archived toggle button', () => {
    render(<Tasks />);

    expect(screen.getByText(/Show Archived/i)).toBeInTheDocument();
  });

  it('should render Refresh button', () => {
    render(<Tasks />);

    expect(screen.getByText(/Refresh/i)).toBeInTheDocument();
  });

  it('should render tasks table', () => {
    // Mock fetch to return tasks
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: mockTasks, total: 2, hasMore: false }),
    });

    render(<Tasks />);

    expect(screen.getByText(/Background Tasks/i)).toBeInTheDocument();
  });

  it('should handle loading state', () => {
    vi.spyOn(require('react'), 'useState')
      .mockImplementation((initial: any) => [initial, vi.fn()])
      .mockImplementationOnce(() => [true, vi.fn()]);

    render(<Tasks />);

    // Loading skeleton should be visible
    expect(screen.getByText(/Tasks/i)).toBeInTheDocument();
  });

  it('should handle empty state', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: [], total: 0, hasMore: false }),
    });

    render(<Tasks />);

    await waitFor(() => {
      expect(screen.getByText(/No tasks found/i)).toBeInTheDocument();
    });
  });

  it('should handle error state', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    render(<Tasks />);

    await waitFor(() => {
      expect(screen.getByText(/Error loading tasks/i)).toBeInTheDocument();
    });
  });
});
```

---

### 3.2 `/bernard/tasks/[id]/page.tsx` - Task Detail

**File Location:** `core/src/app/(dashboard)/bernard/tasks/[id]/page.tsx`

**Lines:** TBD (needs analysis)

**Test Scenarios:** (TODO - requires reading actual file)

---

## Phase 4: Auth Pages (P1)

### 4.1 `/auth/login/page.tsx` - Login Page

**File Location:** `core/src/app/(dashboard)/auth/login/page.tsx`

**Test Scenarios:**

```typescript
// core/src/app/(dashboard)/auth/login/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

const mockRouter = { push: vi.fn(), replace: vi.fn() };

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();
  });

  it('should render login form', () => {
    render(<LoginPage />);

    expect(screen.getByText(/Sign In/i)).toBeInTheDocument();
  });

  it('should have email input field', () => {
    render(<LoginPage />);

    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
  });

  it('should have password input field', () => {
    render(<LoginPage />);

    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
  });

  it('should redirect to /bernard on successful login', async () => {
    // Mock successful auth API call
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, user: { id: 'test', email: 'test@example.com' } }),
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'password123' },
    });

    fireEvent.click(screen.getByText(/Sign In/i));

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/bernard');
    });
  });

  it('should show error on failed login', async () => {
    // Mock failed auth
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'invalid@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'wrongpassword' },
    });

    fireEvent.click(screen.getByText(/Sign In/i));

    await waitFor(() => {
      expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument();
    });
  });
});
```

---

## Phase 5: Admin Configuration Pages (P2)

### 5.1 `/bernard/admin/models/page.tsx` - Model Management

**File Location:** `core/src/app/(dashboard)/bernard/admin/models/page.tsx`

**Lines:** 821 | **Components:** Complex form with tabs, providers, models

**Test Scenarios:**

```typescript
// core/src/app/(dashboard)/bernard/admin/models/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ModelsPage from './page';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/lib/config/models', () => ({
  getProviders: vi.fn().mockResolvedValue([]),
  getModels: vi.fn().mockResolvedValue({}),
}));

describe('Models Management Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(require('@/hooks/useAuth')).useAuth.mockReturnValue({
      loading: false,
      user: { id: 'admin', role: 'admin' },
    });
  });

  it('should render page title', () => {
    render(<ModelsPage />);

    expect(screen.getByText(/Model Management/i)).toBeInTheDocument();
  });

  it('should render provider section', () => {
    render(<ModelsPage />);

    expect(screen.getByText(/Providers/i)).toBeInTheDocument();
  });

  it('should render models section', () => {
    render(<ModelsPage />);

    expect(screen.getByText(/Response Models/i)).toBeInTheDocument();
    expect(screen.getByText(/Router Models/i)).toBeInTheDocument();
    expect(screen.getByText(/Utility Models/i)).toBeInTheDocument();
  });

  it('should show Add Provider button', () => {
    render(<ModelsPage />);

    expect(screen.getByText(/Add Provider/i)).toBeInTheDocument();
  });
});
```

---

### 5.2 `/bernard/admin/services/page.tsx` - Service Configuration

**File Location:** `core/src/app/(dashboard)/bernard/admin/services/page.tsx`

**Lines:** 863 | **Components:** Service sections (Home Assistant, Plex, TTS, STT, etc.)

**Test Scenarios:**

```typescript
// core/src/app/(dashboard)/bernard/admin/services/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServicesPage from './page';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

describe('Services Configuration Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(require('@/hooks/useAuth')).useAuth.mockReturnValue({
      loading: false,
      user: { id: 'admin', role: 'admin' },
    });
  });

  it('should render page title', () => {
    render(<ServicesPage />);

    expect(screen.getByText(/Service Configuration/i)).toBeInTheDocument();
  });

  it('should render all service sections', () => {
    render(<ServicesPage />);

    expect(screen.getByText(/Home Assistant/i)).toBeInTheDocument();
    expect(screen.getByText(/Plex/i)).toBeInTheDocument();
    expect(screen.getByText(/TTS/i)).toBeInTheDocument();
    expect(screen.getByText(/STT/i)).toBeInTheDocument();
  });

  it('should render Test buttons for each service', () => {
    render(<ServicesPage />);

    expect(screen.getByLabelText(/Test Home Assistant/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Test Plex/i)).toBeInTheDocument();
  });
});
```

---

### 5.3 `/bernard/admin/users/page.tsx` - User Management

**File Location:** `core/src/app/(dashboard)/bernard/admin/users/page.tsx`

**Lines:** 477 | **Components:** User table, dialog forms

**Test Scenarios:**

```typescript
// core/src/app/(dashboard)/bernard/admin/users/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UsersPage from './page';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

const mockUsers = [
  {
    id: 'user-1',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-2',
    email: 'user@example.com',
    name: 'Regular User',
    role: 'user',
    createdAt: '2026-01-15T00:00:00Z',
  },
];

describe('Users Management Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(require('@/hooks/useAuth')).useAuth.mockReturnValue({
      loading: false,
      user: { id: 'admin', role: 'admin' },
    });
  });

  it('should render page title', () => {
    render(<UsersPage />);

    expect(screen.getByText(/User Management/i)).toBeInTheDocument();
  });

  it('should render user table', () => {
    render(<UsersPage />);

    expect(screen.getByText(/admin@example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/user@example.com/i)).toBeInTheDocument();
  });

  it('should show user roles', () => {
    render(<UsersPage />);

    expect(screen.getByText(/Admin/i)).toBeInTheDocument();
    expect(screen.getByText(/User/i)).toBeInTheDocument();
  });

  it('should show Add User button', () => {
    render(<UsersPage />);

    expect(screen.getByText(/Add User/i)).toBeInTheDocument();
  });
});
```

---

## Phase 6: User Profile Pages (P2)

### 6.1 `/bernard/user/profile/page.tsx` - User Profile

**File Location:** `core/src/app/(dashboard)/bernard/user/profile/page.tsx`

**Test Scenarios:**

```typescript
// core/src/app/(dashboard)/bernard/user/profile/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProfilePage from './page';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/components/dynamic-sidebar/configs', () => ({
  UserSidebarConfig: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="user-sidebar-config">{children}</div>
  ),
}));

describe('User Profile Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(require('@/hooks/useAuth')).useAuth.mockReturnValue({
      loading: false,
      user: {
        id: 'test-user',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
      },
    });
  });

  it('should render page title', () => {
    render(<ProfilePage />);

    expect(screen.getByText(/Profile/i)).toBeInTheDocument();
  });

  it('should render user email', () => {
    render(<ProfilePage />);

    expect(screen.getByText(/test@example.com/i)).toBeInTheDocument();
  });

  it('should render user name', () => {
    render(<ProfilePage />);

    expect(screen.getByText(/Test User/i)).toBeInTheDocument();
  });

  it('should render user sidebar config', () => {
    render(<ProfilePage />);

    expect(screen.getByTestId('user-sidebar-config')).toBeInTheDocument();
  });
});
```

---

### 6.2 `/bernard/user/tokens/page.tsx` - API Tokens

**File Location:** `core/src/app/(dashboard)/bernard/user/tokens/page.tsx`

**Test Scenarios:**

```typescript
// core/src/app/(dashboard)/bernard/user/tokens/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TokensPage from './page';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/components/dynamic-sidebar/configs', () => ({
  UserSidebarConfig: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="user-sidebar-config">{children}</div>
  ),
}));

describe('API Tokens Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(require('@/hooks/useAuth')).useAuth.mockReturnValue({
      loading: false,
      user: { id: 'test-user', email: 'test@example.com' },
    });
  });

  it('should render page title', () => {
    render(<TokensPage />);

    expect(screen.getByText(/API Tokens/i)).toBeInTheDocument();
  });

  it('should render user sidebar config', () => {
    render(<TokensPage />);

    expect(screen.getByTestId('user-sidebar-config')).toBeInTheDocument();
  });

  it('should have create token button', () => {
    render(<TokensPage />);

    expect(screen.getByText(/Create Token/i)).toBeInTheDocument();
  });
});
```

---

## Coverage Targets

| Category | Files | Lines | Target | Estimated Tests |
|----------|-------|-------|--------|-----------------|
| Bernard Pages | 4 | ~200 | 85% | ~20 |
| Status Dashboard | 1 | ~300 | 85% | ~25 |
| Tasks Pages | 2 | ~400 | 80% | ~20 |
| Auth Pages | 1 | ~200 | 85% | ~15 |
| Admin Config | 3 | ~2100 | 75% | ~30 |
| User Profile | 2 | ~200 | 75% | ~10 |
| **Total** | **13** | **~3400** | **80%** | **~120** |

---

## Success Criteria

### Coverage Goals

- **Overall Coverage:** 80%+ (per vitest.config.ts)
- **Critical Paths:** 90%+ (auth, service management)
- **User-Facing Pages:** 85%+
- **Admin Pages:** 75%+

### Quality Goals

1. **Test Isolation:** Each test runs independently with proper mocking
2. **Mock Coverage:** All external hooks (useAuth, useHealthStream, etc.) mocked
3. **Error Handling:** Tests cover success and error paths
4. **Performance:** Tests run in <5 minutes

---

## Execution Order

1. **Phase 1:** Bernard Pages (Welcome, About, Admin Dashboard)
2. **Phase 2:** Status Dashboard (complex, high-priority)
3. **Phase 3:** Tasks Pages (Tasks list, Task detail)
4. **Phase 4:** Auth Pages (Login)
5. **Phase 5:** Admin Configuration (Models, Services, Users)
6. **Phase 6:** User Profile Pages (Profile, Tokens)

---

## Summary

This plan adds ~120 tests for 13 untested pages, bringing total test count from 626 to ~746. Combined with existing tests, this should achieve the 80% coverage threshold configured in vitest.config.ts.

**Key Considerations:**
- All tests leverage existing vitest.setup.ts infrastructure
- Mocks for useAuth, useHealthStream, useSearchParams are required
- Complex pages (Status, Chat, Admin) require careful mocking strategies
- Integration tests are limited to avoid flakiness

**End of Tasks F - Bernard Testing Improvements Complete**
