# Bernard Testing Improvements - Tasks D: Hook Coverage
**Generated:** 2026-01-18  
**Last Updated:** 2026-01-18 (Plan Revision - Corrected Coverage Status)  
**Target Coverage:** 70% overall (currently ~15% for hooks)  
**Focus Areas:** Real-time Data Hooks, Service Hooks, Chat Hooks, Auth Hooks

## Plan Review Summary

**Status:** Needs Revision

**Key Findings:**
1. **EXISTING TESTS FOUND**: `hooks.test.tsx` contains partial coverage:
   - `useServiceStatus`: 5 tests (~67% coverage)
   - `useDarkMode`: 4 tests (~60% coverage)
2. Hooks with 0% dedicated test coverage: useHealthStream, useLogStream, useThreadData, useAssistantMessageData, useConfirmDialogPromise, useAuth, useAdminAuth
3. Context-based hooks (useAuth, useDarkMode) require Provider wrappers for testing
4. All interface definitions in this plan match actual implementations (CORRECTED)

---

## Executive Summary

This plan addresses the **7 hook files** with 0% dedicated coverage plus **2 hooks with partial coverage**. Hooks are critical for state management, API integration, and real-time data streaming throughout the application.

### Files Covered in This Plan

| Hook | Current Coverage | Complexity | Priority | Pattern |
|------|-----------------|------------|----------|---------|
| useHealthStream | 0% | Medium | P0 | SSE Stream |
| useLogStream | 0% | Medium | P0 | SSE Stream |
| useServiceStatus | ~67% (5 tests) | Medium | P0 | Polling + Actions |
| useThreadData | 0% | High | P1 | Aggregator |
| useAssistantMessageData | 0% | Low | P2 | Pure Function |
| useAutoRename | 0% | Medium | P1 | Side Effect |
| useChatInput | 0% | Low | P2 | State Management |
| useConfirmDialogPromise | 0% | Medium | P2 | Promise Safety |
| useDarkMode | ~60% (4 tests) | Medium | P1 | Context Provider |
| useAuth | 0% | High | P0 | Context Provider |
| useAdminAuth | 0% | Low | P2 | Derived State |

---

## Phase 1: Real-time Data Stream Hooks (P0)

### 1.1 useHealthStream (`hooks/useHealthStream.ts`)

**File Location:** `core/src/hooks/useHealthStream.ts`

#### Implementation Analysis

**Purpose:** SSE client for real-time service health monitoring with automatic reconnection

**Options:**
```typescript
interface UseHealthStreamOptions {
  enabled?: boolean; // default: true
}
```

**Returns:**
```typescript
interface UseHealthStreamReturn {
  services: Record<string, HealthStreamUpdate>;
  serviceList: HealthStreamUpdate[];
  getService: (serviceId: string) => HealthStreamUpdate | null;
  isConnected: boolean;
  error: string | null;
  refresh: () => void;
}
```

**HealthStreamUpdate Interface (CORRECTED):**
```typescript
{
  service: string;        // NOT 'id'
  name: string;
  status: HealthStreamStatus;  // 'up' | 'down' | 'starting' | 'degraded'
  timestamp: string;
  isChange: boolean;
  previousStatus?: HealthStreamStatus;
  responseTime?: number;
  error?: string;
}
```

#### Test Scenarios

**Test 1.1.1: Initial State**
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useHealthStream } from './useHealthStream';
import type { HealthStreamUpdate } from './useHealthStream';

// Mock EventSource using vi.hoisted (per codebase pattern)
const mockEventSourceInstance = {
  onmessage: null,
  onerror: null,
  onopen: null,
  close: vi.fn(),
};

const mockEventSource = vi.hoisted(() => {
  return vi.fn().mockImplementation(() => mockEventSourceInstance);
});

vi.mock('global.EventSource', () => ({
  default: mockEventSource,
}));

describe('useHealthStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventSourceInstance.onmessage = null;
    mockEventSourceInstance.onerror = null;
    mockEventSourceInstance.onopen = null;
  });

  describe('Initial State', () => {
    it('should initialize with empty services', () => {
      const { result } = renderHook(() => useHealthStream());

      expect(result.current.services).toEqual({});
      expect(result.current.serviceList).toEqual([]);
      expect(result.current.getService('test')).toBeNull();
      expect(result.current.isConnected).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should accept enabled option', () => {
      const { result } = renderHook(() => useHealthStream({ enabled: false }));

      expect(result.current.isConnected).toBe(false);
    });
  });
});
```

**Test 1.1.2: SSE Connection**
```typescript
describe('SSE Connection', () => {
  it('should establish SSE connection on mount', () => {
    const eventSourceSpy = vi.spyOn(global, 'EventSource');

    renderHook(() => useHealthStream());

    expect(eventSourceSpy).toHaveBeenCalledWith('/api/health/stream');
  });

  it('should update services on message', () => {
    const mockUpdate: HealthStreamUpdate = {
      service: 'whisper',
      name: 'Whisper',
      status: 'up',
      timestamp: new Date().toISOString(),
      isChange: false,
    };

    const { result } = renderHook(() => useHealthStream());

    // Simulate SSE message - note: 'service' key, not 'id' or 'whisper' as key
    mockEventSourceInstance.onmessage!({
      data: JSON.stringify(mockUpdate),
    } as MessageEvent);

    expect(result.current.services.whisper).toEqual(mockUpdate);
    expect(result.current.serviceList).toHaveLength(1);
  });

  it('should parse multiple service updates', () => {
    const updates: HealthStreamUpdate[] = [
      { service: 'whisper', name: 'Whisper', status: 'up', timestamp: new Date().toISOString(), isChange: false },
      { service: 'kokoro', name: 'Kokoro', status: 'down', timestamp: new Date().toISOString(), isChange: true },
    ];

    const { result } = renderHook(() => useHealthStream());

    updates.forEach(update => {
      mockEventSourceInstance.onmessage!({
        data: JSON.stringify(update),
      } as MessageEvent);
    });

    expect(result.current.services).toHaveProperty('whisper');
    expect(result.current.services).toHaveProperty('kokoro');
    expect(result.current.serviceList).toHaveLength(2);
  });
});
```

**Test 1.1.3: Connection Status**
```typescript
describe('Connection Status', () => {
  it('should set isConnected to true on open', () => {
    const { result } = renderHook(() => useHealthStream());

    mockEventSourceInstance.onopen!({} as Event);

    expect(result.current.isConnected).toBe(true);
  });

  it('should set error on connection error', () => {
    const { result } = renderHook(() => useHealthStream());

    mockEventSourceInstance.onerror!({} as Event);

    expect(result.current.error).toBe('Connection lost. Reconnecting...');
    expect(result.current.isConnected).toBe(false);
  });

  it('should attempt reconnection on error', () => {
    vi.useFakeTimers();
    const eventSourceSpy = vi.spyOn(global, 'EventSource');

    renderHook(() => useHealthStream());

    // Trigger error
    mockEventSourceInstance.onerror!({} as Event);

    // Advance timer past reconnection delay (3 seconds)
    vi.advanceTimersByTime(3000);

    expect(eventSourceSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
```

**Test 1.1.4: getStatusList Helper**
```typescript
describe('getStatusList', () => {
  it('should sort services alphabetically by name', () => {
    const { result } = renderHook(() => useHealthStream());

    // Add services in non-alphabetical order
    mockEventSourceInstance.onmessage!({
      data: JSON.stringify({ service: 'zebra', name: 'Zebra', status: 'up', timestamp: '', isChange: false }),
    } as MessageEvent);

    mockEventSourceInstance.onmessage!({
      data: JSON.stringify({ service: 'alpha', name: 'Alpha', status: 'up', timestamp: '', isChange: false }),
    } as MessageEvent);

    const serviceList = result.current.serviceList;
    expect(serviceList[0].name).toBe('Alpha');
    expect(serviceList[1].name).toBe('Zebra');
  });
});
```

**Test 1.1.5: Cleanup**
```typescript
describe('Cleanup', () => {
  it('should close SSE connection on unmount', () => {
    const { unmount } = renderHook(() => useHealthStream());

    unmount();

    expect(mockEventSourceInstance.close).toHaveBeenCalled();
  });
});
```

---

### 1.2 useLogStream (`hooks/useLogStream.ts`)

**File Location:** `core/src/hooks/useLogStream.ts`

#### Implementation Analysis

**Purpose:** SSE client for real-time log streaming with buffer management

**Options:**
```typescript
interface UseLogStreamOptions {
  service: string;
  enabled?: boolean;
  maxEntries?: number; // default: 1000
  autoScroll?: boolean; // default: true
}
```

**Returns:**
```typescript
interface UseLogStreamReturn {
  logs: LogEntry[];
  isConnected: boolean;
  error: string | null;
  clearLogs: () => void;
  containerRef: Ref<HTMLDivElement>;
}
```

**LogEntry Interface (CORRECTED - includes raw and additional properties):**
```typescript
{
  timestamp: string;
  level: string;
  service: string;
  message: string;
  raw: string;
  [key: string]: unknown;  // Additional properties allowed
}
```

#### Test Scenarios

**Test 1.2.1: Initial State**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLogStream } from './useLogStream';
import type { LogEntry } from './useLogStream';

const mockEventSourceInstance = {
  onmessage: null,
  onerror: null,
  onopen: null,
  close: vi.fn(),
};

const mockEventSource = vi.hoisted(() => {
  return vi.fn().mockImplementation(() => mockEventSourceInstance);
});

vi.mock('global.EventSource', () => ({
  default: mockEventSource,
}));

describe('useLogStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventSourceInstance.onmessage = null;
    mockEventSourceInstance.onerror = null;
    mockEventSourceInstance.onopen = null;
  });

  it('should initialize with empty logs', () => {
    const { result } = renderHook(() => useLogStream({ service: 'core' }));

    expect(result.current.logs).toEqual([]);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should accept all options', () => {
    const { result } = renderHook(() =>
      useLogStream({
        service: 'core',
        maxEntries: 500,
        autoScroll: false,
        enabled: true,
      })
    );

    expect(result.current.logs).toEqual([]);
  });
});
```

**Test 1.2.2: SSE Connection**
```typescript
describe('SSE Connection', () => {
  it('should establish connection with service param in query', () => {
    const eventSourceSpy = vi.spyOn(global, 'EventSource');

    renderHook(() => useLogStream({ service: 'core' }));

    expect(eventSourceSpy).toHaveBeenCalledWith('/api/logs/stream?service=core');
  });

  it('should add log entries on message', () => {
    const { result } = renderHook(() => useLogStream({ service: 'core' }));

    const logEntry: LogEntry = {
      timestamp: '2024-01-01T00:00:00Z',
      level: 'info',
      service: 'core',
      message: 'Test message',
      raw: 'raw log line',
    };

    mockEventSourceInstance.onmessage!({
      data: JSON.stringify(logEntry),
    } as MessageEvent);

    expect(result.current.logs).toHaveLength(1);
    expect(result.current.logs[0].message).toBe('Test message');
    expect(result.current.logs[0].raw).toBe('raw log line');
  });
});
```

**Test 1.2.3: Max Entries**
```typescript
describe('Max Entries', () => {
  it('should limit log entries to maxEntries (FIFO)', () => {
    const { result } = renderHook(() => useLogStream({
      service: 'core',
      maxEntries: 3,
    }));

    // Add 5 entries
    for (let i = 0; i < 5; i++) {
      mockEventSourceInstance.onmessage!({
        data: JSON.stringify({
          timestamp: `2024-01-01T00:00:0${i}Z`,
          level: 'info',
          service: 'core',
          message: `Message ${i}`,
          raw: '',
        }),
      } as MessageEvent);
    }

    // Should only have 3 entries (FIFO - first 2 dropped, last 3 kept)
    expect(result.current.logs).toHaveLength(3);
    expect(result.current.logs[0].message).toBe('Message 2');
    expect(result.current.logs[2].message).toBe('Message 4');
  });
});
```

---

### 1.3 useServiceStatus (`hooks/useServiceStatus.ts`)

**File Location:** `core/src/hooks/useServiceStatus.ts`

#### Implementation Analysis

**Purpose:** Service lifecycle management with polling and action methods

**Options:**
```typescript
interface UseServiceStatusOptions {
  autoRefresh?: boolean; // default: true
  interval?: number; // default: 3000
}
```

**Returns:**
```typescript
interface UseServiceStatusReturn {
  services: ServiceStatus[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  startService: (serviceId: string) => Promise<void>;
  stopService: (serviceId: string) => Promise<void>;
  restartService: (serviceId: string) => Promise<void>;
}
```

**ServiceStatus Interface (CORRECTED):**
```typescript
{
  id: string;
  name: string;
  port: number;  // Required field
  status: 'running' | 'stopped' | 'starting' | 'failed';
  uptime?: number;
  health: 'healthy' | 'unhealthy' | 'unknown';
}
```

#### Test Scenarios

**Test 1.3.1: Initial Fetch**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useServiceStatus, useService } from './useServiceStatus';
import type { ServiceStatus } from './useServiceStatus';

describe('useServiceStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('should fetch services on mount', async () => {
    const mockServices: ServiceStatus[] = [
      { id: 'whisper', name: 'Whisper', port: 8870, status: 'running', health: 'healthy' },
      { id: 'kokoro', name: 'Kokoro', port: 8880, status: 'stopped', health: 'unknown' },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(mockServices),
    });

    const { result } = renderHook(() => useServiceStatus());

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.services).toEqual(mockServices);
  });

  it('should handle fetch error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed'));

    const { result } = renderHook(() => useServiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed');
    expect(result.current.services).toEqual([]);
  });
});
```

**Test 1.3.2: Service Actions**
```typescript
describe('Service Actions', () => {
  beforeEach(async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve([]),
    });
  });

  it('should call correct endpoint for startService', async () => {
    const { result, waitFor } = renderHook(() => useServiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    result.current.startService('whisper');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/services/whisper/start',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('should call correct endpoint for stopService', async () => {
    const { result, waitFor } = renderHook(() => useServiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    result.current.stopService('whisper');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/services/whisper/stop',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('should call correct endpoint for restartService', async () => {
    const { result, waitFor } = renderHook(() => useServiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    result.current.restartService('whisper');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/services/whisper/restart',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
```

---

## Phase 2: Chat & Thread Hooks (P1)

### 2.1 useThreadData (`hooks/useThreadData.ts`)

**File Location:** `core/src/hooks/useThreadData.ts`

#### Implementation Analysis

**Purpose:** Aggregates chat thread state from multiple sources (stream, theme, threads)

**Inputs:**
- URL params: `threadId` from `useSearchParams()`
- Dependencies: `useStreamContext()`, `useDarkMode()`, `useThreads()`

**Returns:**
```typescript
interface UseThreadDataReturn {
  threadId: string | null;
  messages: Message[];
  isLoading: boolean;
  isDarkMode: boolean;
  latestProgress: ToolProgressEvent | null;
  input: string;
  isGhostMode: boolean;
  chatStarted: boolean;
  setInput: (input: string) => void;
  setIsGhostMode: (ghost: boolean) => void;
  handleSubmit: (e: FormEvent) => void;
  handleNewChat: () => void;
  handleRegenerate: (parentCheckpoint: Checkpoint | null | undefined) => Promise<void>;
  handleCopyChatHistory: () => Promise<void>;
  handleDownloadChatHistory: () => void;
  toggleDarkMode: () => void;
}
```

#### Test Requirements

This hook requires complex mocking of:
- `useSearchParams()` from `next/navigation`
- `useStreamContext()` provider
- `useDarkMode()` context provider
- `useThreads()` provider
- Router `replace()` method

**Recommended Wrapper Pattern:**
```typescript
// Create wrapper similar to existing ThreadTestWrapper
function createThreadDataWrapper(overrides = {}) {
  return ({ children }: { children: ReactNode }) => (
    <MockStreamProvider {...overrides.stream}>
      <MockDarkModeProvider isDarkMode={overrides.isDarkMode ?? false}>
        <MockThreadProvider threads={overrides.threads ?? []}>
          <MockRouterProvider>
            {children}
          </MockRouterProvider>
        </MockThreadProvider>
      </MockDarkModeProvider>
    </MockStreamProvider>
  );
}
```

#### Test Scenarios

**Test 2.1.1: State Initialization**
```typescript
describe('useThreadData', () => {
  it('should initialize with default state', () => {
    // Mock all dependencies
    const { result } = renderHook(() => useThreadData(), {
      wrapper: createThreadDataWrapper(),
    });

    expect(result.current.threadId).toBeNull();
    expect(result.current.messages).toEqual([]);
    expect(result.current.input).toBe('');
    expect(result.current.isGhostMode).toBe(false);
    expect(result.current.chatStarted).toBe(false);
  });
});
```

**Test 2.1.2: Input Management**
```typescript
describe('Input Management', () => {
  it('should update input state', () => {
    const { result } = renderHook(() => useThreadData(), {
      wrapper: createThreadDataWrapper(),
    });

    result.current.setInput('Hello, Bernard!');

    expect(result.current.input).toBe('Hello, Bernard!');
  });
});
```

**Test 2.1.3: Ghost Mode**
```typescript
describe('Ghost Mode', () => {
  it('should toggle ghost mode', () => {
    const { result } = renderHook(() => useThreadData(), {
      wrapper: createThreadDataWrapper(),
    });

    expect(result.current.isGhostMode).toBe(false);

    result.current.setIsGhostMode(true);

    expect(result.current.isGhostMode).toBe(true);
  });
});
```

---

### 2.2 useAssistantMessageData (`hooks/useAssistantMessageData.ts`)

**File Location:** `core/src/hooks/useAssistantMessageData.ts`

#### Implementation Analysis

**Purpose:** Parses and extracts metadata from assistant messages (tool calls, branches, content)

**Note:** This is NOT a hook factory pattern. It's a pure function-like hook that accepts message params directly.

**Inputs:**
- `message: Message` (required)
- `nextMessages: Message[]` (optional, default: [])
- `deps: Partial<UseAssistantMessageDataDependencies>` (optional)

**Returns:**
```typescript
{
  meta: {
    branch?: string;
    branchOptions?: string[];
    parentCheckpoint?: unknown;
  };
  hasBranches: boolean;
  toolResults: ToolMessage[];
  hasToolCalls: boolean;
  toolCallsHaveContents: boolean;
  contentString: string;
  isToolResult: boolean;
}
```

#### Test Scenarios

**Test 2.2.1: Content Parsing**
```typescript
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAssistantMessageData } from './useAssistantMessageData';

describe('useAssistantMessageData', () => {
  it('should parse string content', () => {
    const message = { content: 'Hello, world!', role: 'assistant' } as Message;

    const { result } = renderHook(() =>
      useAssistantMessageData(message)
    );

    expect(result.current.contentString).toBe('Hello, world!');
  });

  it('should parse array content', () => {
    const message = {
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world!' },
      ],
      role: 'assistant',
    } as Message;

    const { result } = renderHook(() =>
      useAssistantMessageData(message)
    );

    expect(result.current.contentString).toBe('Hello world!');
  });
});
```

**Test 2.2.2: Tool Call Detection**
```typescript
describe('Tool Calls', () => {
  it('should detect tool calls', () => {
    const message = {
      content: 'Let me search for you',
      tool_calls: [
        { id: 'call-1', type: 'function', function: { name: 'search', arguments: '{}' } },
      ],
      role: 'assistant',
    } as Message;

    const { result } = renderHook(() =>
      useAssistantMessageData(message)
    );

    expect(result.current.hasToolCalls).toBe(true);
  });
});
```

---

## Phase 3: Theme Hook (P1)

### 3.1 useDarkMode (`hooks/useDarkMode.ts`)

**Current Coverage:** ~60% (4 tests exist in hooks.test.tsx)

#### Important Note

This is a **Context Consumer** hook, not a standalone hook. It MUST be wrapped in `DarkModeProvider` for testing. The existing plan incorrectly listed 8.51% coverage - this was a confusion with a different metric. Actual coverage is ~60% with 4 tests.

#### Test Scenarios

**Test 3.1.1: Context Requirement**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDarkMode, DarkModeProvider } from './useDarkMode';

describe('useDarkMode', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should throw error when used outside DarkModeProvider', () => {
    expect(() => renderHook(() => useDarkMode())).toThrow(
      'useDarkMode must be used within a DarkModeProvider'
    );
  });

  it('should work correctly within provider', () => {
    const { result } = renderHook(() => useDarkMode(), {
      wrapper: DarkModeProvider,
    });

    // Should have context value
    expect(result.current.isDarkMode).toBeDefined();
    expect(result.current.toggleDarkMode).toBeDefined();
  });
});
```

**Test 3.1.2: Toggle**
```typescript
describe('Within Provider', () => {
  it('should toggle state', () => {
    const { result } = renderHook(() => useDarkMode(), {
      wrapper: DarkModeProvider,
    });

    const initialValue = result.current.isDarkMode;

    result.current.toggleDarkMode();

    expect(result.current.isDarkMode).toBe(!initialValue);
  });
});
```

---

## Phase 4: Auth Hooks (P0)

### 4.1 useAuth (`hooks/useAuth.ts`)

**File Location:** `core/src/hooks/useAuth.ts`

**Complexity:** High (Context Provider + Better Auth integration)

#### Implementation Analysis

**Purpose:** Primary authentication hook with Better Auth integration

**Note:** This is a **Context Consumer** hook, MUST be wrapped in `AuthProvider` for testing.

**Returns:**
```typescript
{
  state: AuthState;
  login: (credentials: LoginCredentials) => Promise<void>;
  githubLogin: () => Promise<void>;
  googleLogin: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: { displayName?: string; email?: string }) => Promise<User>;
  clearError: () => void;
}
```

#### Test Scenarios

**Test 4.1.1: Context Requirement**
```typescript
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuth, AuthProvider } from './useAuth';

describe('useAuth', () => {
  it('should throw error when used outside AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used within an AuthProvider'
    );
  });
});
```

**Test 4.1.2: Provider Integration**
```typescript
// Use existing MockAuthProvider from test utilities
import { MockAuthProvider, createMockUser } from '@/test/providers/AuthProvider';

describe('Within Provider', () => {
  it('should provide auth state', () => {
    const mockUser = createMockUser({ role: 'user' });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <MockAuthProvider value={{ state: { user: mockUser, loading: false, error: null } }}>
          {children}
        </MockAuthProvider>
      ),
    });

    expect(result.current.state.user).toBeDefined();
    expect(result.current.state.user?.role).toBe('user');
  });
});
```

---

### 4.2 useAdminAuth (`hooks/useAdminAuth.ts`)

**File Location:** `core/src/hooks/useAdminAuth.ts`

#### Implementation Analysis

**Purpose:** Derived admin state from useAuth

**Returns:**
```typescript
{
  isAdmin: boolean;
  isAdminLoading: boolean;
  user: User | null;
  error: string | null;
  loading: boolean;
}
```

#### Test Scenarios

**Test 4.2.1: Admin Detection**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAdminAuth } from './useAdminAuth';
import { MockAuthProvider, createMockUser, createMockAdminUser } from '@/test/providers/AuthProvider';

describe('useAdminAuth', () => {
  it('should return isAdmin: false for regular user', () => {
    const mockUser = createMockUser({ role: 'user' });

    const { result } = renderHook(() => useAdminAuth(), {
      wrapper: ({ children }) => (
        <MockAuthProvider value={{ state: { user: mockUser, loading: false, error: null } }}>
          {children}
        </MockAuthProvider>
      ),
    });

    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isAdminLoading).toBe(false);
  });

  it('should return isAdmin: true for admin user', () => {
    const mockUser = createMockAdminUser();

    const { result } = renderHook(() => useAdminAuth(), {
      wrapper: ({ children }) => (
        <MockAuthProvider value={{ state: { user: mockUser, loading: false, error: null } }}>
          {children}
        </MockAuthProvider>
      ),
    });

    expect(result.current.isAdmin).toBe(true);
  });
});
```

---

## Phase 5: Dialog Hook (P2)

### 5.1 useConfirmDialogPromise (`hooks/useConfirmDialogPromise.ts`)

**File Location:** `core/src/hooks/useConfirmDialogPromise.ts`

#### Implementation Analysis

**Purpose:** Promise-based confirm dialog wrapper with lifecycle safety

**Returns:**
```typescript
{
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
}
```

#### Test Scenarios

**Test 5.1.1: Promise Resolution**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConfirmDialogPromise } from './useConfirmDialogPromise';

// Mock useConfirmDialog
const mockConfirmDialog = vi.fn();

vi.mock('@/components/DialogManager', () => ({
  useConfirmDialog: () => mockConfirmDialog,
}));

describe('useConfirmDialogPromise', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve true on confirm', async () => {
    let resolveDialog: (value: boolean) => void;
    const dialogPromise = new Promise<boolean>((resolve) => {
      resolveDialog = resolve;
    });

    mockConfirmDialog.mockReturnValue(() => {});

    const { result } = renderHook(() => useConfirmDialogPromise());

    const promise = result.current.confirm({ title: 'Test?' });

    // Simulate confirm
    resolveDialog!(true);

    await expect(promise).resolves.toBe(true);
  });

  it('should resolve false on cancel', async () => {
    let resolveDialog: (value: boolean) => void;

    mockConfirmDialog.mockReturnValue(() => {});

    const { result } = renderHook(() => useConfirmDialogPromise());

    const promise = result.current.confirm({ title: 'Test?' });

    resolveDialog!(false);

    await expect(promise).resolves.toBe(false);
  });

  it('should resolve false on timeout', async () => {
    vi.useFakeTimers();

    mockConfirmDialog.mockReturnValue(() => {});

    const { result } = renderHook(() => useConfirmDialogPromise());

    const promise = result.current.confirm({ title: 'Test?' });

    // Advance timer past 30 second timeout
    vi.advanceTimersByTime(30000);

    await expect(promise).resolves.toBe(false);

    vi.useRealTimers();
  });
});
```

**Test 5.1.2: Lifecycle Safety**
```typescript
describe('Lifecycle Safety', () => {
  it('should not resolve if component unmounted', async () => {
    const { result, unmount } = renderHook(() => useConfirmDialogPromise());

    const promise = result.current.confirm({ title: 'Test?' });

    unmount();

    // Should not throw
    await expect(promise).resolves.toBe(false);
  });
});
```

---

## Phase 6: Chat Input Hooks (P1-P2)

### 6.1 useAutoRename (`hooks/useAutoRename.ts`)

**File Location:** `core/src/hooks/useAutoRename.ts`

#### Implementation Analysis

**Purpose:** Automatically renames chat threads based on the first human message content

**Inputs:**
- `threadId: string | null` - Current thread ID
- `messages: Message[]` - Thread messages
- `onRenameComplete?: () => void` - Callback after successful rename
- `apiClient?: IAPIClient` - API client for the rename operation

**Returns:**
```typescript
interface UseAutoRenameResult {
  hasTriggeredAutoRename: boolean;
  triggerAutoRename: () => void;
  isAutoRenaming: boolean;
}
```

**Key Behaviors:**
- Triggers only when `messages.length === 2` (1 human + 1 AI response)
- Prevents duplicate renames using refs
- Extracts first human message content
- Calls `apiClient.autoRenameThread(threadId, content)`

#### Test Scenarios

**Test 6.1.1: Initial State**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAutoRename } from './useAutoRename';
import type { Message } from '@langchain/langgraph-sdk';

describe('useAutoRename', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with hasTriggeredAutoRename: false', () => {
    const { result } = renderHook(() =>
      useAutoRename({ threadId: null, messages: [] })
    );

    expect(result.current.hasTriggeredAutoRename).toBe(false);
    expect(result.current.isAutoRenaming).toBe(false);
  });

  it('should handle null threadId', () => {
    const { result } = renderHook(() =>
      useAutoRename({ threadId: null, messages: [{ id: '1', type: 'human', content: 'Hello' }] })
    );

    expect(result.current.hasTriggeredAutoRename).toBe(false);
  });
});
```

**Test 6.1.2: Auto Rename Trigger**
```typescript
describe('Auto Rename Trigger', () => {
  it('should trigger rename when messages.length === 2', async () => {
    const mockAutoRenameThread = vi.fn().mockResolvedValue(undefined);
    const mockApiClient = { autoRenameThread: mockAutoRenameThread };

    const messages: Message[] = [
      { id: '1', type: 'human', content: 'Hello, Bernard!' },
      { id: '2', type: 'ai', content: 'Hello! How can I help?' },
    ];

    const { result, waitFor } = renderHook(() =>
      useAutoRename({
        threadId: 'thread-123',
        messages,
        apiClient: mockApiClient as any,
      })
    );

    await waitFor(() => {
      expect(mockAutoRenameThread).toHaveBeenCalledWith(
        'thread-123',
        'Hello, Bernard!'
      );
    });

    expect(result.current.hasTriggeredAutoRename).toBe(true);
    expect(result.current.isAutoRenaming).toBe(false);
  });

  it('should NOT trigger when messages.length !== 2', () => {
    const mockAutoRenameThread = vi.fn();
    const mockApiClient = { autoRenameThread: mockAutoRenameThread };

    const messages: Message[] = [
      { id: '1', type: 'human', content: 'Hello' },
    ];

    const { result } = renderHook(() =>
      useAutoRename({
        threadId: 'thread-123',
        messages,
        apiClient: mockApiClient as any,
      })
    );

    expect(mockAutoRenameThread).not.toHaveBeenCalled();
    expect(result.current.hasTriggeredAutoRename).toBe(false);
  });

  it('should prevent duplicate renames', async () => {
    const mockAutoRenameThread = vi.fn().mockResolvedValue(undefined);
    const mockApiClient = { autoRenameThread: mockAutoRenameThread };

    const messages: Message[] = [
      { id: '1', type: 'human', content: 'Hello' },
      { id: '2', type: 'ai', content: 'Hi there!' },
    ];

    const { rerender } = renderHook(({ messages, threadId }) =>
      useAutoRename({
        threadId,
        messages,
        apiClient: mockApiClient as any,
      }),
      {
        initialProps: {
          messages: [{ id: '1', type: 'human', content: 'Hello' }],
          threadId: 'thread-123',
        },
      }
    );

    // First render with 1 message
    expect(mockAutoRenameThread).not.toHaveBeenCalled();

    // Rerender with 2 messages - should trigger
    rerender({
      messages,
      threadId: 'thread-123',
    });

    await waitFor(() => {
      expect(mockAutoRenameThread).toHaveBeenCalledTimes(1);
    });
  });
});

**Test 6.1.3: Thread Changes**
```typescript
describe('Thread Changes', () => {
  it('should reset state when threadId changes', async () => {
    const mockAutoRenameThread = vi.fn().mockResolvedValue(undefined);
    const mockApiClient = { autoRenameThread: mockAutoRenameThread };

    const thread1Messages: Message[] = [
      { id: '1', type: 'human', content: 'Hello' },
      { id: '2', type: 'ai', content: 'Hi!' },
    ];

    const { rerender, result } = renderHook(({ threadId, messages }) =>
      useAutoRename({
        threadId,
        messages,
        apiClient: mockApiClient as any,
      }),
      {
        initialProps: {
          threadId: 'thread-1',
          messages: thread1Messages,
        },
      }
    );

    await waitFor(() => {
      expect(result.current.hasTriggeredAutoRename).toBe(true);
    });

    // Switch to different thread
    rerender({
      threadId: 'thread-2',
      messages: thread1Messages,
    });

    expect(result.current.hasTriggeredAutoRename).toBe(false);
  });
});
```

---

### 6.2 useChatInput (`hooks/useChatInput.ts`)

**File Location:** `core/src/hooks/useChatInput.ts`

#### Implementation Analysis

**Purpose:** Manages chat input state, submission, and keyboard interactions

**Inputs:**
- `onSubmit: (message: Message) => void` - Submit callback
- `isLoading: boolean` - Loading state
- `uuidGenerator?: () => string` - Custom UUID generator (default: uuidv4)

**Returns:**
```typescript
interface UseChatInputResult {
  input: string;
  setInput: (value: string) => void;
  handleSubmit: (e?: React.FormEvent) => void;
  handleKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  canSubmit: boolean;
}
```

#### Test Scenarios

**Test 6.2.1: State Management**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatInput } from './useChatInput';
import type { Message } from '@langchain/langgraph-sdk';

describe('useChatInput', () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty input', () => {
    const { result } = renderHook(() =>
      useChatInput({ onSubmit: mockOnSubmit, isLoading: false })
    );

    expect(result.current.input).toBe('');
    expect(result.current.canSubmit).toBe(false);
  });

  it('should update input state', () => {
    const { result } = renderHook(() =>
      useChatInput({ onSubmit: mockOnSubmit, isLoading: false })
    );

    act(() => {
      result.current.setInput('Hello, Bernard!');
    });

    expect(result.current.input).toBe('Hello, Bernard!');
    expect(result.current.canSubmit).toBe(true);
  });

  it('should clear input after setInput with whitespace only', () => {
    const { result } = renderHook(() =>
      useChatInput({ onSubmit: mockOnSubmit, isLoading: false })
    );

    act(() => {
      result.current.setInput('  ');
    });

    expect(result.current.input).toBe('  ');
    expect(result.current.canSubmit).toBe(false);
  });
});
```

**Test 6.2.2: Submit Handling**
```typescript
describe('Submit Handling', () => {
  it('should call onSubmit with message when canSubmit is true', () => {
    const uuidGenerator = vi.fn().mockReturnValue('mock-uuid-123');
    const { result } = renderHook(() =>
      useChatInput({
        onSubmit: mockOnSubmit,
        isLoading: false,
        uuidGenerator,
      })
    );

    act(() => {
      result.current.setInput('Hello!');
    });

    act(() => {
      result.current.handleSubmit();
    });

    expect(mockOnSubmit).toHaveBeenCalledWith({
      id: 'mock-uuid-123',
      type: 'human',
      content: 'Hello!',
    });

    expect(result.current.input).toBe('');
  });

  it('should NOT submit when input is empty', () => {
    const { result } = renderHook(() =>
      useChatInput({ onSubmit: mockOnSubmit, isLoading: false })
    );

    act(() => {
      result.current.handleSubmit();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('should NOT submit when isLoading is true', () => {
    const { result } = renderHook(() =>
      useChatInput({ onSubmit: mockOnSubmit, isLoading: true })
    );

    act(() => {
      result.current.setInput('Hello!');
    });

    expect(result.current.canSubmit).toBe(false);

    act(() => {
      result.current.handleSubmit();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });
});
```

**Test 6.2.3: Keyboard Handling**
```typescript
describe('Keyboard Handling', () => {
  it('should prevent default on Enter without modifiers', () => {
    const { result } = renderHook(() =>
      useChatInput({ onSubmit: mockOnSubmit, isLoading: false })
    );

    act(() => {
      result.current.setInput('Hello!');
    });

    const mockEvent = {
      key: 'Enter',
      preventDefault: vi.fn(),
      currentTarget: { form: { requestSubmit: vi.fn() } },
      shiftKey: false,
      metaKey: false,
      nativeEvent: { isComposing: false },
    };

    result.current.handleKeyDown(mockEvent as any);

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.currentTarget.form.requestSubmit).toHaveBeenCalled();
  });

  it('should NOT prevent default on Enter with Shift', () => {
    const { result } = renderHook(() =>
      useChatInput({ onSubmit: mockOnSubmit, isLoading: false })
    );

    const mockEvent = {
      key: 'Enter',
      preventDefault: vi.fn(),
      shiftKey: true,
      metaKey: false,
      nativeEvent: { isComposing: false },
    };

    result.current.handleKeyDown(mockEvent as any);

    expect(mockEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('should NOT prevent default on Enter with Meta (Cmd)', () => {
    const { result } = renderHook(() =>
      useChatInput({ onSubmit: mockOnSubmit, isLoading: false })
    );

    const mockEvent = {
      key: 'Enter',
      preventDefault: vi.fn(),
      shiftKey: false,
      metaKey: true,
      nativeEvent: { isComposing: false },
    };

    result.current.handleKeyDown(mockEvent as any);

    expect(mockEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('should NOT prevent default during composition', () => {
    const { result } = renderHook(() =>
      useChatInput({ onSubmit: mockOnSubmit, isLoading: false })
    );

    const mockEvent = {
      key: 'Enter',
      preventDefault: vi.fn(),
      shiftKey: false,
      metaKey: false,
      nativeEvent: { isComposing: true },
    };

    result.current.handleKeyDown(mockEvent as any);

    expect(mockEvent.preventDefault).not.toHaveBeenCalled();
  });
});
```

---

## Mock Infrastructure

### Existing Test Utilities (USE THESE)

The codebase already has comprehensive test utilities at `core/src/test/`:

```typescript
// Import from existing utilities
import { createMockUser, createMockAdminUser, MockAuthProvider } from '@/test/providers/AuthProvider';
import { createMockMessage, createMockMessageThread, createMockThread } from '@/test/wrappers/ThreadTestWrapper';
import { createMockFn, mockResolvedValue, mockRejectedValue } from '@/test/helpers/mock-factories';
```

### Hook Test Utilities

```typescript
// core/src/test/helpers/hook-mocks.ts
import { vi } from 'vitest';

// EventSource Mock (for SSE hooks)
export const createMockEventSource = () => ({
  onmessage: null as ((event: MessageEvent) => void) | null,
  onerror: null as ((event: Event) => void) | null,
  onopen: null as ((event: Event) => void) | null,
  close: vi.fn(),
});

// Mock fetch
export const createMockFetch = () => {
  const mock = vi.fn();
  return mock;
};

// Mock navigator.clipboard
export const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue(''),
};

// Mock URL.createObjectURL and revokeObjectURL
export const mockURL = {
  createObjectURL: vi.fn().mockReturnValue('blob:test'),
  revokeObjectURL: vi.fn(),
};

// Mock window.matchMedia
export const createMockMatchMedia = (matches: boolean) => ({
  matches,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
```

---

## Execution Order

> **Note:** Shared test infrastructure (mocks, wrappers, helpers) is defined in [tasks-0.plan.md](tasks-0.plan.md). All tests in this plan use the centralized mock infrastructure.

### Priority Sequence

1. **Phase 1: Real-time Stream Hooks** (Most critical)
   - useHealthStream (SSE + reconnection)
   - useLogStream (SSE + buffer)
   - useServiceStatus (polling + actions)

2. **Phase 4: Auth Hooks** (Critical - requires Provider wrappers)
   - useAuth (complex Better Auth integration)
   - useAdminAuth (simple derived state)

3. **Phase 2: Chat Hooks** (Core functionality)
   - useThreadData (complex aggregator)
   - useAssistantMessageData (parsing)

4. **Phase 6: Chat Input Hooks** (Core UI functionality)
   - useAutoRename (side effect management)
   - useChatInput (state management)

5. **Phase 3: Theme Hook** (UI consistency)
   - useDarkMode (context-based)

6. **Phase 5: Dialog Hook** (Safety patterns)
   - useConfirmDialogPromise (lifecycle safety)

---

## Coverage Targets

| Hook | Current | Target | Est. New Tests | Total Tests | Notes |
|------|---------|--------|----------------|-------------|-------|
| useHealthStream | 0% | 90% | ~15 | 15 | SSE mocking required |
| useLogStream | 0% | 90% | ~15 | 15 | SSE mocking required |
| useServiceStatus | ~67% | 90% | ~5 | 10 | 5 tests exist, add 5 more |
| useThreadData | 0% | 85% | ~20 | 20 | Complex provider mocking |
| useAssistantMessageData | 0% | 90% | ~10 | 10 | Pure function - straightforward |
| useAutoRename | 0% | 90% | ~12 | 12 | API client mocking required |
| useChatInput | 0% | 90% | ~12 | 12 | State management + events |
| useConfirmDialogPromise | 0% | 90% | ~10 | 10 | Promise lifecycle |
| useDarkMode | ~60% | 90% | ~6 | 10 | 4 tests exist, add 6 more |
| useAuth | 0% | 85% | ~20 | 20 | Provider wrapper required |
| useAdminAuth | 0% | 90% | ~8 | 8 | Simple derived state |

**Total New Tests Required:** ~133 tests
**Total Tests After Implementation:** ~142 tests (including existing 9 tests)

---

## Success Criteria

### Coverage Goals

- **Real-time Hooks:** 90% (critical for live data)
- **Auth Hooks:** 85-90% (security-critical)
- **Chat Hooks:** 85% (core user functionality)
- **Theme Hook:** 90% (simple, high impact)
- **Dialog Hook:** 90% (safety patterns)

### Test Quality

All hook tests must:
1. Use `vi.hoisted()` for mock hoisting (per codebase pattern)
2. Mock external dependencies with `vi.mock()`
3. Test initial state
4. Test state transitions
5. Test async operations
6. Test cleanup (unmount)
7. Test error handling
8. Use existing test utilities where available

---

## Next Steps

1. ✅ Use existing test utilities from `core/src/test/`
2. Create hook-specific wrappers for context-based hooks
3. Execute tests in priority order
4. Verify coverage improvements
5. Move to Tasks E for library files

**End of Tasks D (Revised)**

