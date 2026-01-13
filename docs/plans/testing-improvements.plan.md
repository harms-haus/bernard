# Test Organization & Coverage Improvement Plan

**Target Coverage:** 80%+ across all modules
**Test Framework:** Vitest (not Jest)
**Timeline:** 6-8 weeks
**Test File Naming:** `*.test.{ts,tsx}`

---

## Executive Summary

| Project | Current Coverage | Target | Gap |
|---------|-----------------|--------|-----|
| bernard-ui | 5.72% | 80% | ~100 tests |
| core | 6.54% | 80% | ~400 tests |

**Total:** 166 tests → ~600 tests

---

## Decisions & Constraints

1. **Coverage Target:** 80%+ minimum across all modules
2. **E2E Testing:** No Playwright (unit + integration only)
3. **File Naming:** `*.test.{ts,tsx}` (consistent)
4. **Priority:** Libraries first, then API routes, then components
5. **Snapshot Testing:** Not used (explicit assertions only)

---

## Phase 1: Standardization (Week 1)

### 1.1 Unified Test Directory Structure

**Standard pattern:** Co-located tests (`*.test.ts` alongside source files)

```
core/src/
├── lib/
│   ├── services/
│   │   ├── ServiceManager.ts
│   │   └── ServiceManager.test.ts
│   └── checkpoint/
│       ├── redis-saver.ts
│       └── redis-saver.test.ts
└── tests/integration/          # Integration tests in separate directory
    ├── startup-sequence.test.ts
    └── service-commands.test.ts
```

**Action Items:**
- [ ] Move `core/src/lib/checkpoint/__tests__/` → co-located `*.test.ts`
- [ ] Keep `core/tests/integration/` (separate integration test directory)
- [ ] Update `vitest.config.ts` patterns to `['**/*.test.{ts,tsx}']`
- [ ] Create `core/src/test/` directory for shared utilities
- [ ] Create `services/bernard-ui/src/test/` directory for shared utilities

### 1.2 Shared Test Utilities

**Core (`core/src/test/`):**
```
core/src/test/
├── index.ts                    # Export all utilities
├── mocks/
│   ├── redis.ts               # Redis client mock factory
│   ├── child-process.ts        # spawn/exec mock factory
│   ├── axios.ts               # HTTP client mocks
│   └── redis-client.ts        # Pre-configured redis mock
├── fixtures/
│   ├── services.ts            # ServiceManager test data
│   ├── checkpoints.ts         # Checkpoint data factories
│   └── auth.ts               # Auth session fixtures
└── helpers/
    ├── async-helpers.ts       # waitFor, retry utilities
    ├── test-dir.ts            # Temp directory management
    └── mock-factories.ts      # Generic mock factories
```

**Bernard UI (`services/bernard-ui/src/test/`):**
```
services/bernard-ui/src/test/
├── index.ts
├── mocks/
│   ├── api.ts                # Fetch API mock factory
│   ├── stream.ts             # ReadableStream mock helpers
│   └── router.ts             # React Router mocks
├── fixtures/
│   ├── threads.ts            # Thread data factories
│   ├── messages.ts           # Message factories
│   └── services.ts          # Service status fixtures
└── render.tsx               # Custom render with providers
```

### 1.3 Enhanced Setup Files

**Core (`core/vitest.setup.ts`):**
```typescript
import { beforeEach, afterEach, vi } from 'vitest'

// Global mock for process.kill (used in ProcessManager tests)
const originalKill = process.kill
beforeEach(() => {
  process.kill = vi.fn().mockReturnValue(true)
})
afterEach(() => {
  process.kill = originalKill
})

// Global mock for child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn().mockReturnValue({
    pid: 12345,
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    kill: vi.fn(),
  }),
  execSync: vi.fn().mockReturnValue(''),
}))

// Common test utilities
global.TEST_DIR = path.join(process.cwd(), 'test-temp')
global.LOGS_DIR = path.join(TEST_DIR, 'logs')
global.PIDS_DIR = path.join(TEST_DIR, 'pids')
```

**UI (`services/bernard-ui/src/test/setup.ts`):**
```typescript
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
});
```

### 1.4 Update Vitest Configurations

**Core (`core/vitest.config.ts`):**
```typescript
export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      lines: 80,               // NEW: Enforce 80% minimum
      functions: 80,
      branches: 80,
      statements: 80,
    },
  },
})
```

**Bernard UI (`services/bernard-ui/vitest.config.ts`):**
```typescript
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: 'v8',
      lines: 80,               // NEW: Enforce 80% minimum
      functions: 80,
      branches: 80,
      statements: 80,
    },
  },
})
```

---

## Phase 2: Library Testing (Week 2-3)

**Priority:** Libraries first (foundation for other tests)

### 2.1 Authentication Libraries (Week 2)

**Target:** 100% coverage for auth modules

| Module | Tests Needed | Priority |
|--------|--------------|----------|
| `core/src/lib/auth/session.ts` | 8-10 tests | Critical |
| `core/src/lib/auth/oauth.ts` | 10-12 tests | Critical |
| `core/src/lib/auth/oauthCore.ts` | 8-10 tests | High |
| `core/src/lib/auth/sessionStore.ts` | 8-10 tests | High |
| `core/src/lib/auth/tokenStore.ts` | 6-8 tests | High |
| `core/src/lib/auth/userStore.ts` | 6-8 tests | High |
| `core/src/lib/auth/adminAuth.ts` | 5-7 tests | High |

**Test Strategy:**
```typescript
// session.test.ts
describe('SessionManager', () => {
  beforeEach(() => {
    // Mock Redis client
    vi.mock('@/lib/infra/redis')
    sessionManager = new SessionManager()
  })

  describe('createSession', () => {
    it('should create session with valid user data')
    it('should set TTL on session key')
    it('should return session ID')
    it('should handle Redis connection errors')
    it('should validate user structure')
  })

  describe('getSession', () => {
    it('should return null for expired session')
    it('should return session data for valid ID')
    it('should handle malformed session data')
  })

  describe('deleteSession', () => {
    it('should remove session from Redis')
    it('should return true for successful deletion')
    it('should return false for non-existent session')
  })
})
```

### 2.2 Configuration Libraries (Week 2)

| Module | Tests Needed | Priority |
|--------|--------------|----------|
| `core/src/lib/config/settingsCache.ts` | 8-10 tests | High |
| `core/src/lib/config/appSettings.ts` | 10-12 tests | High |
| `core/src/lib/config/models.ts` | 8-10 tests | High |
| `core/src/lib/config/settingsStore.ts` | 6-8 tests | Medium |

### 2.3 Service Libraries (Week 2-3)

| Module | Tests Needed | Priority |
|--------|--------------|----------|
| `core/src/lib/services/ServiceManager.ts` | 10-12 tests | High |
| `core/src/lib/services/ProcessManager.ts` | 8-10 tests | High |
| `core/src/lib/services/HealthChecker.ts` | 6-8 tests | High |
| `core/src/lib/services/HealthMonitor.ts` | 8-10 tests | Medium |
| `core/src/lib/services/LogStreamer.ts` | 6-8 tests | Medium |

**Test Strategy (ServiceManager):**
```typescript
describe('ServiceManager', () => {
  describe('start', () => {
    it('should start services in dependency order')
    it('should wait for services to become healthy')
    it('should handle service startup failures')
    it('should respect startup timeout')
    it('should emit status events during startup')
  })

  describe('stop', () => {
    it('should stop services in reverse dependency order')
    it('should force kill services that do not stop gracefully')
    it('should handle already-stopped services')
    it('should emit status events during shutdown')
  })

  describe('getStatus', () => {
    it('should return current status for all services')
    it('should include health check results')
    it('should include uptime information')
    it('should handle unknown services gracefully')
  })
})
```

### 2.4 Infrastructure Libraries (Week 3)

| Module | Tests Needed | Priority |
|--------|--------------|----------|
| `core/src/lib/infra/queue.ts` | 10-12 tests | High |
| `core/src/lib/infra/redis.ts` | 8-10 tests | High |
| `core/src/lib/infra/taskKeeper.ts` | 6-8 tests | Medium |
| `core/src/lib/infra/service-queue/` | 8-10 tests | Medium |
| `core/src/lib/infra/thread-naming-job.ts` | 6-8 tests | Medium |
| `core/src/lib/infra/timeouts.ts` | 4-6 tests | Low |

### 2.5 Integration Libraries (Week 3)

| Module | Tests Needed | Priority |
|--------|--------------|----------|
| `core/src/lib/home-assistant/rest-client.ts` | 8-10 tests | Medium |
| `core/src/lib/home-assistant/websocket-client.ts` | 6-8 tests | Medium |
| `core/src/lib/home-assistant/entities.ts` | 4-6 tests | Low |
| `core/src/lib/plex/client.ts` | 6-8 tests | Medium |
| `core/src/lib/plex/media-search.ts` | 6-8 tests | Medium |
| `core/src/lib/plex/actions.ts` | 8-10 tests | Medium |
| `core/src/lib/overseerr/client.ts` | 6-8 tests | Medium |
| `core/src/lib/weather/common.ts` | 6-8 tests | Low |
| `core/src/lib/searxng/index.ts` | 6-8 tests | Medium |
| `core/src/lib/website/content-cache.ts` | 4-6 tests | Low |
| `core/src/lib/logging/logger.ts` | 6-8 tests | Low |

### 2.6 Checkpoint Library (Week 3)

| Module | Tests Needed | Priority |
|--------|--------------|----------|
| `core/src/lib/checkpoint/redis-saver.ts` | 10-12 tests | High |
| `core/src/lib/checkpoint/serde.ts` | 8-10 tests | High |
| `core/src/lib/checkpoint/redis-key.ts` | 6-8 tests | High |

---

## Phase 3: Agent Tool Testing (Week 3-4)

**Target:** 100% coverage for all 12 tool factories

### 3.1 Tool Registry & Validation

| File | Tests Needed | Priority |
|------|--------------|----------|
| `core/src/agents/bernard/tools/index.ts` | 6-8 tests | High |
| `core/src/agents/bernard/tools/validation.ts` | 8-10 tests | High |

**Test Strategy:**
```typescript
describe('toolRegistry', () => {
  describe('getAllTools', () => {
    it('should return all registered tools')
    it('should include tool metadata')
    it('should filter disabled tools')
  })

  describe('getToolByName', () => {
    it('should return tool by name')
    it('should return undefined for unknown tool')
  })
})

describe('validateTools', () => {
  it('should validate tool configurations')
  it('should return list of disabled tools with reasons')
  it('should handle missing API keys')
  it('should validate required environment variables')
})
```

### 3.2 Individual Tool Tests

| Tool | Tests Needed | Priority |
|------|--------------|----------|
| `web-search.tool.ts` | 8-10 tests | High |
| `wikipedia-search.tool.ts` | 6-8 tests | High |
| `wikipedia-entry.tool.ts` | 6-8 tests | Medium |
| `get-weather-data.tool.ts` | 8-10 tests | Medium |
| `search_media.tool.ts` | 8-10 tests | High |
| `play_media_tv.tool.ts` | 10-12 tests | High |
| `home-assistant-list-entities.tool.ts` | 6-8 tests | Medium |
| `home-assistant-toggle-light.tool.ts` | 8-10 tests | Medium |
| `home-assistant-execute-services.tool.ts` | 8-10 tests | Medium |
| `home-assistant-historical-state.tool.ts` | 6-8 tests | Medium |
| `overseerr-find-media.tool.ts` | 6-8 tests | Medium |
| `overseerr-request-media.tool.ts` | 6-8 tests | Medium |
| `overseerr-cancel-request.tool.ts` | 4-6 tests | Medium |
| `overseerr-report-issue.tool.ts` | 4-6 tests | Low |
| `overseerr-list-requests.tool.ts` | 4-6 tests | Low |
| `website-content.tool.ts` | 8-10 tests | Medium |
| `timer.tool.ts` | 8-10 tests | Medium |

**Test Strategy (Tool Factory):**
```typescript
describe('webSearchTool factory', () => {
  describe('with valid API key', () => {
    it('should return ok=true with configured tool')
    it('should tool should call search API')
    it('should handle search errors gracefully')
    it('should parse search results')
    it('should return formatted results')
  })

  describe('without API key', () => {
    it('should return ok=false with reason')
    it('should include tool name in error')
  })

  describe('tool execution', () => {
    it('should handle network errors')
    it('should handle rate limiting')
    it('should validate input parameters')
    it('should respect timeout')
  })
})
```

### 3.3 Agent Orchestration

| File | Tests Needed | Priority |
|------|--------------|----------|
| `core/src/agents/bernard/bernard.agent.ts` | 10-12 tests | High |
| `core/src/agents/bernard/state.ts` | 6-8 tests | Medium |
| `core/src/agents/bernard/utils.ts` | 4-6 tests | Low |
| `core/src/agents/bernard/updates.ts` | 4-6 tests | Low |

**Test Strategy (Agent):**
```typescript
describe('BernardAgent', () => {
  describe('creation', () => {
    it('should create agent with LangGraph')
    it('should configure Redis checkpoint')
    it('should register all enabled tools')
    it('should apply middleware')
  })

  describe('invocation', () => {
    it('should process user messages')
    it('should call tools when needed')
    it('should return tool outputs')
    it('should handle errors gracefully')
  })

  describe('thread management', () => {
    it('should create new threads')
    it('should resume existing threads')
    it('should maintain thread state')
  })
})
```

---

## Phase 4: API Route Testing (Week 4-5)

**Target:** 80%+ coverage for all 50+ API routes

### 4.1 Priority Routes (Week 4)

**Authentication Routes:**
| Route | Tests Needed | Priority |
|-------|--------------|----------|
| `/api/auth/route.ts` | 8-10 tests | Critical |
| `/api/auth/login/route.ts` | 6-8 tests | Critical |
| `/api/auth/logout/route.ts` | 4-6 tests | Critical |
| `/api/auth/[...provider]/route.ts` | 8-10 tests | Critical |
| `/api/auth/me/route.ts` | 4-6 tests | High |
| `/api/auth/github/callback/route.ts` | 6-8 tests | High |
| `/api/auth/google/callback/route.ts` | 6-8 tests | High |

**Health Check Routes:**
| Route | Tests Needed | Priority |
|-------|--------------|----------|
| `/api/health/route.ts` | 4-6 tests | High |
| `/api/health/ok/route.ts` | 4-6 tests | High |
| `/api/health/ready/route.ts` | 4-6 tests | High |
| `/api/health/stream/route.ts` | 6-8 tests | Medium |

**Service Routes:**
| Route | Tests Needed | Priority |
|-------|--------------|----------|
| `/api/services/route.ts` | 6-8 tests | High |
| `/api/services/[service]/route.ts` | 8-10 tests | High |
| `/api/admin/services/route.ts` | 6-8 tests | High |

**Settings Routes:**
| Route | Tests Needed | Priority |
|-------|--------------|----------|
| `/api/settings/route.ts` | 6-8 tests | High |
| `/api/settings/services/route.ts` | 4-6 tests | Medium |
| `/api/settings/models/route.ts` | 4-6 tests | Medium |
| `/api/settings/backups/route.ts` | 4-6 tests | Medium |

### 4.2 Secondary Routes (Week 5)

**Bernard Routes:**
| Route | Tests Needed | Priority |
|-------|--------------|----------|
| `/api/bernard/[...path]/route.ts` | 8-10 tests | High |
| `/app/bernard/[...path]/route.ts` | 6-8 tests | Medium |

**Token Management:**
| Route | Tests Needed | Priority |
|-------|--------------|----------|
| `/api/tokens/route.ts` | 6-8 tests | Medium |
| `/api/tokens/[id]/route.ts` | 8-10 tests | Medium |

**User Management:**
| Route | Tests Needed | Priority |
|-------|----------|------|
| `/api/users/route.ts` | 6-8 tests | Medium |
| `/api/users/[id]/route.ts` | 8-10 tests | Medium |
| `/api/users/[id]/reset/route.ts` | 4-6 tests | Low |

**Other Routes:**
| Route | Tests Needed | Priority |
|-------|--------------|----------|
| `/api/tasks/route.ts` | 6-8 tests | Medium |
| `/api/tasks/[id]/route.ts` | 6-8 tests | Medium |
| `/api/threads/[threadId]/auto-rename/route.ts` | 6-8 tests | Medium |
| `/api/v1/[...path]/route.ts` | 6-8 tests | Low |
| `/api/providers/route.ts` | 4-6 tests | Low |
| `/api/providers/[id]/route.ts` | 6-8 tests | Low |
| `/api/logs/stream/route.ts` | 6-8 tests | Medium |
| `/api/proxy-stream/[...path]/route.ts` | 8-10 tests | Medium |

**Test Strategy (API Routes):**
```typescript
// api/auth/login/route.test.ts
import { POST } from './route'

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.mock('@/lib/auth/sessionStore')
  })

  it('should create session on valid credentials', async () => {
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com', password: 'password' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.sessionId).toBeDefined()
  })

  it('should return 401 on invalid credentials', async () => {
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com', password: 'wrong' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(401)
  })

  it('should validate request body', async () => {
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'invalid' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })
})
```

---

## Phase 5: Component Testing (Week 5-6)

**Target:** 80%+ coverage for UI components

### 5.1 Critical Chat Components

| Component | Tests Needed | Priority |
|-----------|--------------|----------|
| `Thread.tsx` | 10-12 tests | Critical |
| `messages/ai.tsx` | 8-10 tests | Critical |
| `messages/human.tsx` | 6-8 tests | Critical |
| `messages/tool-calls.tsx` | 8-10 tests | Critical |
| `messages/progress.tsx` | 6-8 tests | High |
| `ConversationHistory.tsx` | 10-12 tests | Critical |
| `BranchSwitcher.tsx` | 6-8 tests | Medium |

### 5.2 Admin Components

| Component | Tests Needed | Priority |
|-----------|--------------|----------|
| `Services.tsx` | 12-15 tests | High |
| `Models.tsx` | 10-12 tests | High |
| `Users.tsx` | 10-12 tests | Medium |
| `Tasks.tsx` | 8-10 tests | Medium |
| `TaskDetail.tsx` | 8-10 tests | Medium |
| `StatusDashboard.tsx` | 8-10 tests | High |
| `ServiceCard.tsx` | 6-8 tests | Medium |
| `LogViewer.tsx` | 6-8 tests | Medium |

### 5.3 UI Primitive Components

| Component | Tests Needed | Priority |
|-----------|--------------|----------|
| `button.tsx` | 10-12 tests | High |
| `dialog.tsx` | 12-15 tests | High |
| `dropdown-menu.tsx` | 10-12 tests | Medium |
| `input.tsx` | 8-10 tests | Medium |
| `textarea.tsx` | 6-8 tests | Medium |
| `switch.tsx` | 6-8 tests | Medium |
| `avatar.tsx` | 6-8 tests | Low |
| `badge.tsx` | 6-8 tests | Low |
| `alert.tsx` | 6-8 tests | Low |
| `card.tsx` | 6-8 tests | Low |
| `toast.tsx` | 8-10 tests | Medium |
| `sheet.tsx` | 8-10 tests | Medium |

**Test Strategy (Components):**
```typescript
// Thread.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Thread } from './Thread'

describe('Thread', () => {
  const mockThread = {
    id: 'thread-1',
    title: 'Test Thread',
    messages: [],
    branches: [],
    currentBranch: 'main',
  }

  it('should render thread title', () => {
    render(<Thread thread={mockThread} />)
    expect(screen.getByText('Test Thread')).toBeInTheDocument()
  })

  it('should display messages in order', () => {
    const threadWithMessages = {
      ...mockThread,
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ],
    }

    render(<Thread thread={threadWithMessages} />)

    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Hi there!')).toBeInTheDocument()
  })

  it('should handle message submission', async () => {
    const user = userEvent.setup()
    const onSendMessage = vi.fn()

    render(<Thread thread={mockThread} onSendMessage={onSendMessage} />)

    const input = screen.getByRole('textbox')
    await user.type(input, 'Test message')
    await user.click(screen.getByRole('button', { name: /send/i }))

    expect(onSendMessage).toHaveBeenCalledWith('Test message')
  })

  it('should handle branch switching', async () => {
    const user = userEvent.setup()
    const onBranchSwitch = vi.fn()

    render(<Thread thread={mockThread} onBranchSwitch={onBranchSwitch} />)

    await user.click(screen.getByRole('button', { name: /branches/i }))

    expect(onBranchSwitch).toHaveBeenCalled()
  })
})
```

### 5.4 Hook Testing

| Hook | Tests Needed | Priority |
|------|--------------|----------|
| `useAuth.ts` | 10-12 tests | High |
| `useAdminAuth.ts` | 8-10 tests | High |
| `useDarkMode.ts` | 6-8 tests | Medium |
| `useStream.ts` | 8-10 tests | High |
| `useServices.ts` | 8-10 tests | High |

**Test Strategy (Hooks):**
```typescript
// useAuth.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { useAuth } from './useAuth'

describe('useAuth', () => {
  beforeEach(() => {
    vi.mock('@/services/auth')
  })

  it('should return null user when not authenticated', () => {
    const { result } = renderHook(() => useAuth())

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('should return user after successful login', async () => {
    const { result } = renderHook(() => useAuth())

    await act(async () => {
      await result.current.login('test@example.com', 'password')
    })

    await waitFor(() => {
      expect(result.current.user).toBeDefined()
      expect(result.current.isAuthenticated).toBe(true)
    })
  })

  it('should clear user after logout', async () => {
    const { result } = renderHook(() => useAuth())

    await act(async () => {
      await result.current.login('test@example.com', 'password')
    })

    await waitFor(() => {
      expect(result.current.user).toBeDefined()
    })

    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })
})
```

---

## Phase 6: Integration Testing (Week 6-7)

**Target:** 15-20 integration tests covering critical flows

### 6.1 Service Integration Tests

| Test | Description | Priority |
|------|-------------|----------|
| `auth-flow.test.ts` | Full OAuth flow (login → session → logout) | Critical |
| `service-health.test.ts` | Service health check orchestration | High |
| `checkpoint-redis.test.ts` | Redis checkpoint persistence | High |
| `tool-execution.test.ts` | Agent tool invocation flow | High |
| `thread-management.test.ts` | Thread creation, updates, branching | High |

### 6.2 Existing Integration Tests (Enhance)

| Test | Current State | Enhancement |
|------|---------------|-------------|
| `startup-sequence.test.ts` | 10 tests, 171 lines | Add failure scenarios |
| `service-commands.test.ts` | 15 tests, 154 lines | Add concurrent operations |
| `log-streaming.test.ts` | 16 tests, 240 lines | Add error handling |

**Test Strategy (Integration):**
```typescript
// auth-flow.test.ts
describe('Integration: Auth Flow', () => {
  let serviceManager: ServiceManager
  let authClient: AuthClient

  beforeEach(async () => {
    serviceManager = new ServiceManager()
    await serviceManager.startAll()
    authClient = new AuthClient()
  })

  afterEach(async () => {
    await serviceManager.stopAll()
  })

  it('should complete full OAuth flow', async () => {
    // Step 1: Initiate login
    const loginUrl = await authClient.getLoginUrl('github')
    expect(loginUrl).toContain('github.com')

    // Step 2: Simulate callback
    const authCode = 'mock-auth-code'
    const session = await authClient.handleCallback('github', authCode)

    expect(session.userId).toBeDefined()
    expect(session.token).toBeDefined()

    // Step 3: Verify session
    const verifiedSession = await authClient.getSession(session.token)
    expect(verifiedSession).toEqual(session)

    // Step 4: Logout
    await authClient.logout(session.token)
    const expiredSession = await authClient.getSession(session.token)
    expect(expiredSession).toBeNull()
  })
})
```

---

## Phase 7: Coverage Enforcement & CI (Week 7-8)

### 7.1 Update Root Package Scripts

```json
{
  "scripts": {
    "test": "cd core && npm run test && cd ../services/bernard-ui && npm run tests",
    "test:coverage": "cd core && npm run test:coverage && cd ../services/bernard-ui && npm run tests:coverage",
    "test:ci": "cd core && npm run test:coverage && cd ../services/bernard-ui && npm run tests:coverage",
    "test:watch": "cd core && npm run test:watch",
    "test:ui": "cd core && npm run test:ui"
  }
}
```

### 7.2 CI/CD Integration

Create `.github/workflows/test.yml`:
```yaml
name: Tests
on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20.x]

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}

      - name: Install dependencies
        run: npm ci

      - name: Run tests with coverage
        run: npm run test:ci

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          files: ./core/coverage/coverage-final.json,./services/bernard-ui/coverage/coverage-final.json
          flags: unittests
          name: codecov-umbrella

      - name: Check coverage thresholds
        run: |
          CORE_LINES=$(cd core && npx vitest run --coverage 2>&1 | grep "lines" | awk '{print $4}' | tr -d '%')
          UI_LINES=$(cd services/bernard-ui && npx vitest run --coverage 2>&1 | grep "lines" | awk '{print $4}' | tr -d '%')

          echo "Core lines coverage: $CORE_LINES%"
          echo "UI lines coverage: $UI_LINES%"

          if [ $(echo "$CORE_LINES < 80" | bc -l) -eq 1 ]; then
            echo "Core coverage below 80%: $CORE_LINES%"
            exit 1
          fi

          if [ $(echo "$UI_LINES < 80" | bc -l) -eq 1 ]; then
            echo "UI coverage below 80%: $UI_LINES%"
            exit 1
          fi
```

### 7.3 Pre-Commit Hooks (Optional)

Add to `.husky/pre-commit`:
```bash
#!/bin/bash
npm run test:ci -- --changed
```

---

## Phase 8: Documentation (Week 8)

### 8.1 Create Testing Guide

Create `core/TESTING.md`:
```markdown
# Testing Guide - Core

## Overview
This project uses Vitest for unit and integration testing. Tests are co-located with source files.

## Running Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests in UI mode
npm run test:ui
```

## Test Organization

### Unit Tests
- Location: Co-located with source: `ServiceManager.test.ts` next to `ServiceManager.ts`
- Purpose: Test individual functions, classes, and modules
- Environment: Node.js

### Integration Tests
- Location: `src/tests/integration/`
- Purpose: Test interactions between multiple components
- Environment: Node.js with mocked external services

## Writing Tests

### Unit Test Template

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ClassName } from './ClassName'

describe('ClassName', () => {
  let instance: ClassName

  beforeEach(() => {
    instance = new ClassName()
  })

  describe('methodName', () => {
    it('should do X when Y', () => {
      // Arrange
      const input = { ... }

      // Act
      const result = instance.methodName(input)

      // Assert
      expect(result).toEqual(expected)
    })

    it('should handle error case', async () => {
      // Arrange
      vi.spyOn(dependency, 'method').mockRejectedValue(new Error('Test error'))

      // Act & Assert
      await expect(instance.methodName()).rejects.toThrow('Test error')
    })
  })
})
```

### Integration Test Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ServiceManager } from '@/lib/services/ServiceManager'

describe('Integration: Service Lifecycle', () => {
  let serviceManager: ServiceManager

  beforeEach(async () => {
    serviceManager = new ServiceManager()
  })

  afterEach(async () => {
    await serviceManager.stopAll()
  })

  it('should start services in dependency order', async () => {
    await serviceManager.startAll()

    const statuses = await serviceManager.getAllStatus()
    const runningStatuses = statuses.filter(s => s.status === 'running')

    expect(runningStatuses).toHaveLength(Object.keys(SERVICES).length)
  })
})
```

## Mock Patterns

### Module Mocking
```typescript
// Mock entire module
vi.mock('@/lib/infra/redis', () => ({
  getRedisClient: vi.fn().mockReturnValue(mockClient),
}))

// Mock individual function
vi.spyOn(someClass, 'someMethod').mockReturnValue('test')
```

### Async Helpers
```typescript
import { testHelpers } from '@/test/helpers'

await testHelpers.waitFor(() => expect(condition).toBe(true))
await testHelpers.retry(() => someAsyncOperation(), { maxAttempts: 3 })
```

## Coverage Requirements

- **Minimum:** 80% lines, functions, branches, statements
- **Target:** 90%+ for critical modules
- **Enforced:** CI will fail if coverage below 80%

## Best Practices

1. **Test behavior, not implementation**
   - Test public APIs, not private methods
   - Focus on what the component does, not how

2. **Arrange, Act, Assert**
   - Organize tests into clear sections
   - Make tests readable and maintainable

3. **One assertion per test**
   - Keep tests focused and simple
   - Multiple tests for multiple scenarios

4. **Use descriptive test names**
   - `should return null for invalid input`
   - `should throw error when connection fails`

5. **Mock external dependencies**
   - Don't test network calls, APIs, databases
   - Mock all external services

6. **Clean up after tests**
   - Use `afterEach` to reset state
   - Ensure tests don't affect each other
```

Create `services/bernard-ui/TESTING.md`:
```markdown
# Testing Guide - Bernard UI

## Overview
This project uses Vitest with jsdom for component testing. Tests are co-located with source files.

## Running Tests

```bash
npm run test          # Run all tests
npm run test:watch   # Watch mode
npm run tests:coverage # Coverage report
```

## Test Organization

### Component Tests
- Location: Co-located: `Component.test.tsx` next to `Component.tsx`
- Purpose: Test React components in isolation
- Environment: jsdom (browser simulation)

### Hook Tests
- Location: Co-located: `useHook.test.ts` next to `useHook.ts`
- Purpose: Test custom React hooks
- Environment: jsdom

## Writing Tests

### Component Test Template

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ComponentName } from './ComponentName'

describe('ComponentName', () => {
  it('should render correctly', () => {
    render(<ComponentName prop="value" />)

    expect(screen.getByText('expected text')).toBeInTheDocument()
  })

  it('should handle user interaction', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()

    render(<ComponentName onAction={onAction} />)

    await user.click(screen.getByRole('button'))

    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('should display loading state', async () => {
    render(<ComponentName isLoading={true} />)

    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
```

### Hook Test Template

```typescript
import { renderHook, waitFor, act } from '@testing-library/react'
import { useHook } from './useHook'

describe('useHook', () => {
  it('should return initial state', () => {
    const { result } = renderHook(() => useHook())

    expect(result.current.state).toBe('initial')
  })

  it('should update state after action', async () => {
    const { result } = renderHook(() => useHook())

    await act(async () => {
      await result.current.doSomething()
    })

    expect(result.current.state).toBe('updated')
  })
})
```

## Testing With Providers

```typescript
import { renderWithProviders } from '@/test/render'

describe('ComponentWithProviders', () => {
  it('should render with auth context', () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    })

    expect(result.current.isAuthenticated).toBe(false)
  })
})
```

## Mock Patterns

### API Mocking
```typescript
import { mockFetch } from '@/test/mocks/api'

beforeEach(() => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ data: 'test' }),
  })
})
```

### Router Mocking
```typescript
import { mockRouter } from '@/test/mocks/router'

beforeEach(() => {
  mockRouter.push.mockResolvedValue(true)
})
```

## Coverage Requirements

- **Minimum:** 80% lines, functions, branches, statements
- **Target:** 90%+ for critical components
- **Enforced:** CI will fail if coverage below 80%

## Best Practices

1. **Test user behavior, not implementation**
   - Test what users see and do
   - Don't test internal state changes

2. **Use semantic queries**
   - `getByRole('button')` instead of `getByText('Submit')`
   - More accessible and robust

3. **Test async operations**
   - Use `waitFor` for async updates
   - Use `act` for state changes

4. **Clean up after tests**
   - Use `afterEach` for cleanup
   - Reset mocks between tests

5. **Avoid snapshot testing**
   - Use explicit assertions
   - Snapshots become maintenance burden
```

---

## Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| **Core Coverage** | 80%+ | 6.54% |
| **UI Coverage** | 80%+ | 5.72% |
| **Core Tests** | 400+ | 149 |
| **UI Tests** | 200+ | 17 |
| **Integration Tests** | 20+ | 3 |
| **CI Pass Rate** | 100% | N/A |

---

## Implementation Timeline

| Week | Phase | Deliverable |
|------|-------|-------------|
| 1 | Standardization | Test structure, utilities, configs |
| 2 | Libraries (Auth, Config, Services) | 100% coverage |
| 3 | Libraries (Infra, Integrations) + Agent Tools | 100% coverage |
| 4 | API Routes (Priority) | 80%+ coverage |
| 5 | API Routes (Secondary) + Components (Critical) | 80%+ coverage |
| 6 | Components (Secondary) + Integration | 80%+ coverage |
| 7 | CI/CD Enforcement | Automated coverage checks |
| 8 | Documentation | Testing guides complete |

---

## Next Steps

1. **Phase 1.1:** Standardize test directory structure
2. **Phase 1.2:** Create shared test utilities
3. **Phase 2.1:** Write auth library tests
4. **Phase 2.2:** Write config library tests
5. **Phase 2.3:** Write service library tests

**Recommended:** Start with Phase 2 (libraries) as it provides the foundation for all other tests.

---

## Phase 2 Progress (Week 2-3)

### Completed: 266 tests (+32 from baseline of 234)

| Module | Tests | Status |
|--------|-------|--------|
| **Auth Types** `types.test.ts` | 17 | ✅ NEW |
| **Models** `models.test.ts` | 22 (+6) | ✅ Extended |
| **Redis** `redis.test.ts` | 10 (+5) | ✅ Extended |
| **User Store** `userStore.test.ts` | 8 | ✅ Existing |
| **Session Store** `sessionStore.test.ts` | 8 | ✅ Existing |
| **Admin Auth** `adminAuth.test.ts` | 8 | ✅ Existing |
| **Settings Cache** `settingsCache.test.ts` | 7 | ✅ Existing |
| **Service Manager** `ServiceManager.test.ts` | 14 | ✅ Existing |
| **Process Manager** `ProcessManager.test.ts` | 7 | ✅ Existing |
| **Health Checker** `HealthChecker.test.ts` | 7 | ✅ Existing |
| **Health Monitor** `HealthMonitor.test.ts` | 18 | ✅ Existing |
| **Log Streamer** `LogStreamer.test.ts` | 22 | ✅ Existing |
| **Task Keeper** `taskKeeper.test.ts` | 13 | ✅ Existing |
| **Timeouts** `timeouts.test.ts` | 10 | ✅ Existing |
| **Serde** `serde.test.ts` | 16 | ✅ Existing |
| **Redis Key** `redis-key.test.ts` | 19 | ✅ Existing |
| **Redis Saver** `redis-saver.test.ts` | 15 | ✅ Existing |
| **Integration Tests** | 41 | ✅ Existing |

### Not Completed (Requires Complex ESM Mocking)

| Module | Tests Needed | Reason |
|--------|--------------|--------|
| `appSettings.ts` | 10-12 | **Singleton with Redis + fs dependencies** - Complex ESM mocking required |
| `settingsStore.ts` | 6-8 | **Wrapper around appSettings** - Depends on singleton behavior |
| `env.ts` | 8-10 | **Module-level process.env access** - Requires vi.stubEnv before import |
| `tokenStore.ts` | 6-8 | **Redis + crypto dependencies** - Complex mock pattern needed |
| `authCore.ts` | 8-10 | **buildStores factory** - Circular dependencies with stores |
| `oauthCore.ts` | 8-10 | **PKCE + fetch mocking** - Requires global fetch mock |
| `oauth.ts` | 10-12 | **OAuth state + Redis** - Multi-layer mocking required |
| `session.ts` | 8-10 | **Cookie + Redis + Next.js** - Browser APIs not available in Node |
| `helpers.ts` | 4-6 | **Next.js Request/Response** - Requires actual Next.js context |

### Technical Challenges Encountered

1. **ESM Module System**: TypeScript's ESM modules don't support `require()` for reloading with fresh mocks
2. **Singleton Pattern**: `appSettings` singleton caches state on first load, making isolation difficult
3. **Redis Mock Complexity**: Creating chainable transaction mocks (`multi().hset().sadd().exec()`) is error-prone
4. **Next.js Dependencies**: `session.ts` and `helpers.ts` import from `next/headers` and `next/server`
5. **Global State**: `process.env` is read at module evaluation time, before tests can stub values

### Recommended Solutions for Remaining Tests

1. **Integration Tests with Testcontainers**:
   ```yaml
   # Use testcontainers-node for Redis
   services:
     redis:
       image: redis:7-alpine
       ports: ["6379:6379"]
   ```

2. **Module Overrides with re-import**:
   ```typescript
   // Delete from require cache before each test
   delete require.cache[require.resolve('./module')]
   ```

3. **vi.doMock() for ESM**:
   ```typescript
   vi.doMock('@/lib/infra/redis', () => ({
     getRedis: vi.fn(() => mockRedis),
   }))
   ```

4. **Node.js Test Environment**: Run problematic tests with `vm` context

### Updated Timeline

| Week | Phase | Original Target | Updated Target |
|------|-------|-----------------|----------------|
| 1 | Standardization | ✅ Complete | ✅ Complete |
| 2-3 | Libraries | 266/400 tests | **66%** - Gaps require integration tests |
| 4-5 | API Routes | Pending | Pending |
| 5-6 | Components | Pending | Pending |
| 7 | CI/CD | Pending | Pending |
| 8 | Documentation | Pending | Pending |

### Next Actions

1. **Immediate**: Create integration test suite with real Redis using testcontainers
2. **Short-term**: Add `vi.doMock()` patterns for ESM modules
3. **Medium-term**: Consider refactoring singletons for testability (e.g., dependency injection)

---

**Generated:** Phase 2 progress update - Tests increased from 234 to 266 (+32, +14%)
