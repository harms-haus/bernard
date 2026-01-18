# Bernard Testing Improvements - Tasks D-2: Hook Coverage (Extended)
**Generated:** 2026-01-18  
**Last Updated:** 2026-01-18 (Initial Draft - Gap Analysis Follow-up)  
**Target Coverage:** 70% overall (supplements Tasks D)  
**Focus Areas:** Extended Hook Tests, Edge Cases, Integration Tests, Error Handling

---

## Executive Summary

This plan addresses the **gap analysis findings** from Tasks D. The original plan covered ~133 tests, but analysis revealed an additional **~58 tests** are needed to achieve proper coverage. This plan adds those missing tests.

### Files Covered in This Plan

| Hook | Gap Tests | Priority | Pattern |
|------|-----------|----------|---------|
| useService | 2 | P1 | Service Helper |
| useThreadData | 9 | P0 | Action Handlers |
| useAuth | 12 | P0 | Auth Functions |
| useAssistantMessageData | 6 | P1 | Metadata Extraction |
| useDarkMode | 7 | P1 | LocalStorage/DOM |
| useAdminAuth | 5 | P1 | Derived State |
| useAutoRename | 5 | P2 | Edge Cases |
| useChatInput | 3 | P2 | Edge Cases |
| useConfirmDialogPromise | 2 | P2 | Promise Safety |
| useHealthStream | 4 | P2 | SSE Errors |
| useLogStream | 3 | P2 | SSE Errors |

**Total New Tests:** ~58 tests  
**Dependency:** Must be executed after Tasks D

---

## Phase 1: Service Helper & Thread Data (P0-P1)

### 1.1 useService Helper (`hooks/useServiceStatus.ts`)

**File Location:** `core/src/hooks/useServiceStatus.ts`

The hook exports a helper function `useService(serviceId)` that filters services to return a single service by ID.

#### Test Scenarios

**Test 1.1.1: Service Found**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useService } from './useServiceStatus';
import type { ServiceStatus } from './useServiceStatus';

describe('useService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('should return service when found', async () => {
    const mockServices: ServiceStatus[] = [
      { id: 'whisper', name: 'Whisper', port: 8870, status: 'running', health: 'healthy' },
      { id: 'kokoro', name: 'Kokoro', port: 8880, status: 'stopped', health: 'unknown' },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockServices,
    });

    const { result } = renderHook(() => useService('whisper'));

    await waitFor(() => expect(result.current.status).not.toBeNull());

    expect(result.current.status).toEqual({
      id: 'whisper',
      name: 'Whisper',
      port: 8870,
      status: 'running',
      health: 'healthy',
    });
    expect(result.current.services).toHaveLength(2);
  });

  it('should return null when service not found', async () => {
    const mockServices: ServiceStatus[] = [
      { id: 'whisper', name: 'Whisper', port: 8870, status: 'running', health: 'healthy' },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockServices,
    });

    const { result } = renderHook(() => useService('nonexistent'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.status).toBeNull();
    expect(result.current.services).toHaveLength(1);
  });
});
```

---

### 1.2 useThreadData Action Handlers (`hooks/useThreadData.ts`)

**File Location:** `core/src/hooks/useThreadData.ts`

#### Test Scenarios

**Test 1.2.1: handleSubmit - Message Creation**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThreadData } from './useThreadData';
import type { Message } from '@langchain/langgraph-sdk';
import { useStreamContext } from '@/providers/StreamProvider';
import { useDarkMode } from './useDarkMode';
import { useThreads } from '@/providers/ThreadProvider';
import { useSearchParams, useRouter } from 'next/navigation';

// Mock dependencies
vi.mocked(useSearchParams).mockReturnValue({
  get: vi.fn().mockReturnValue('thread-123'),
} as any);

vi.mocked(useRouter).mockReturnValue({
  replace: vi.fn(),
} as any);

vi.mocked(useStreamContext).mockReturnValue({
  messages: [],
  submit: vi.fn(),
  isLoading: false,
  latestProgress: null,
} as any);

vi.mocked(useDarkMode).mockReturnValue({
  isDarkMode: false,
  toggleDarkMode: vi.fn(),
} as any);

vi.mocked(useThreads).mockReturnValue({
  getThreads: vi.fn(),
} as any);

describe('useThreadData - handleSubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create human message and call submit', async () => {
    const mockSubmit = vi.fn();
    vi.mocked(useStreamContext).mockReturnValue({
      messages: [],
      submit: mockSubmit,
      isLoading: false,
      latestProgress: null,
    } as any);

    const { result } = renderHook(() => useThreadData());

    act(() => {
      result.current.setInput('Hello, Bernard!');
    });

    act(() => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as any);
    });

    expect(mockSubmit).toHaveBeenCalledWith(
      { messages: expect.arrayContaining([
        expect.objectContaining({
          type: 'human',
          content: 'Hello, Bernard!',
        }),
      ]) },
      expect.objectContaining({
        streamMode: ['values'],
      })
    );

    expect(result.current.input).toBe('');
  });

  it('should NOT submit when input is empty', () => {
    const mockSubmit = vi.fn();
    vi.mocked(useStreamContext).mockReturnValue({
      messages: [],
      submit: mockSubmit,
      isLoading: false,
      latestProgress: null,
    } as any);

    const { result } = renderHook(() => useThreadData());

    act(() => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as any);
    });

    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('should NOT submit when isLoading is true', () => {
    const mockSubmit = vi.fn();
    vi.mocked(useStreamContext).mockReturnValue({
      messages: [],
      submit: mockSubmit,
      isLoading: true,
      latestProgress: null,
    } as any);

    const { result } = renderHook(() => useThreadData());

    act(() => {
      result.current.setInput('Hello!');
    });

    act(() => {
      result.current.handleSubmit({ preventDefault: vi.fn() } as any);
    });

    expect(mockSubmit).not.toHaveBeenCalled();
  });
});
```

**Test 1.2.2: handleNewChat**
```typescript
describe('handleNewChat', () => {
  it('should navigate to /bernard/chat', () => {
    const mockReplace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      replace: mockReplace,
    } as any);

    const { result } = renderHook(() => useThreadData());

    result.current.handleNewChat();

    expect(mockReplace).toHaveBeenCalledWith('/bernard/chat');
  });
});
```

**Test 1.2.3: handleRegenerate**
```typescript
describe('handleRegenerate', () => {
  it('should call stream.submit with checkpoint', () => {
    const mockSubmit = vi.fn();
    vi.mocked(useStreamContext).mockReturnValue({
      messages: [],
      submit: mockSubmit,
      isLoading: false,
      latestProgress: null,
    } as any);

    const { result } = renderHook(() => useThreadData());

    const mockCheckpoint = { id: 'checkpoint-123' };
    result.current.handleRegenerate(mockCheckpoint);

    expect(mockSubmit).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        checkpoint: mockCheckpoint,
        streamMode: ['values'],
      })
    );
  });
});
```

**Test 1.2.4: handleCopyChatHistory**
```typescript
describe('handleCopyChatHistory', () => {
  beforeEach(() => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should copy JSON to clipboard', async () => {
    const messages: Message[] = [
      { id: '1', type: 'human', content: 'Hello' },
      { id: '2', type: 'ai', content: 'Hi there!' },
    ];
    vi.mocked(useStreamContext).mockReturnValue({
      messages,
      submit: vi.fn(),
      isLoading: false,
      latestProgress: null,
    } as any);

    const { result } = renderHook(() => useThreadData());

    await result.current.handleCopyChatHistory();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ], null, 2)
    );
  });

  it('should handle JSON.stringify for complex content', async () => {
    const messages: Message[] = [
      { 
        id: '1', 
        type: 'human', 
        content: [{ type: 'text', text: 'Complex' }] 
      },
    ];
    vi.mocked(useStreamContext).mockReturnValue({
      messages,
      submit: vi.fn(),
      isLoading: false,
      latestProgress: null,
    } as any);

    const { result } = renderHook(() => useThreadData());

    await result.current.handleCopyChatHistory();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('Complex')
    );
  });
});
```

**Test 1.2.5: handleDownloadChatHistory**
```typescript
describe('handleDownloadChatHistory', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    vi.spyOn(document.body, 'appendChild').mockReturnValue({} as any);
    vi.spyOn(document.body, 'removeChild').mockReturnValue({} as any);
    const mockClick = vi.fn();
    vi.spyOn(document.createElement('a'), 'click').mockReturnValue({
      click: mockClick,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create and trigger download', () => {
    const messages: Message[] = [
      { id: '1', type: 'human', content: 'Hello' },
    ];
    vi.mocked(useStreamContext).mockReturnValue({
      messages,
      submit: vi.fn(),
      isLoading: false,
      latestProgress: null,
    } as any);

    const { result } = renderHook(() => useThreadData());

    result.current.handleDownloadChatHistory();

    expect(document.createElement('a')).toHaveBeenCalledWith('a');
    const mockA = (document.createElement('a') as any).mock.results[0].value;
    expect(mockA.href).toBe('blob:test');
    expect(mockA.download).toMatch(/chat-history-\d{4}-\d{2}-\d{2}.json/);
    expect(document.body.appendChild).toHaveBeenCalled();
    expect(mockA.click).toHaveBeenCalled();
    expect(document.body.removeChild).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
});
```

**Test 1.2.6: toggleDarkMode**
```typescript
describe('toggleDarkMode', () => {
  it('should call useDarkMode toggleDarkMode', () => {
    const mockToggle = vi.fn();
    vi.mocked(useDarkMode).mockReturnValue({
      isDarkMode: false,
      toggleDarkMode: mockToggle,
    } as any);

    const { result } = renderHook(() => useThreadData());

    result.current.toggleDarkMode();

    expect(mockToggle).toHaveBeenCalled();
  });
});
```

**Test 1.2.7: Auto-Rename Effect**
```typescript
describe('Auto-Rename Effect', () => {
  it('should call autoRenameThread when messages.length === 2', async () => {
    const mockAutoRenameThread = vi.fn().mockResolvedValue(undefined);
    const mockGetThreads = vi.fn();
    
    vi.spyOn(await import('@/lib/api/client'), 'getAPIClient')
      .mockReturnValue({ autoRenameThread: mockAutoRenameThread } as any);

    vi.mocked(useThreads).mockReturnValue({
      getThreads: mockGetThreads,
    } as any);

    const messages: Message[] = [
      { id: '1', type: 'human', content: 'First message' },
      { id: '2', type: 'ai', content: 'AI response' },
    ];
    vi.mocked(useStreamContext).mockReturnValue({
      messages,
      submit: vi.fn(),
      isLoading: false,
      latestProgress: null,
    } as any);

    const { result, waitFor } = renderHook(() => useThreadData());

    await waitFor(() => {
      expect(mockAutoRenameThread).toHaveBeenCalledWith('thread-123', 'First message');
    });
    expect(mockGetThreads).toHaveBeenCalled();
    expect(result.current.isGhostMode).toBe(false);
  });

  it('should NOT auto-rename when messages.length !== 2', () => {
    const mockAutoRenameThread = vi.fn();
    
    vi.spyOn(await import('@/lib/api/client'), 'getAPIClient')
      .mockReturnValue({ autoRenameThread: mockAutoRenameThread } as any);

    const messages: Message[] = [
      { id: '1', type: 'human', content: 'First message' },
    ];
    vi.mocked(useStreamContext).mockReturnValue({
      messages,
      submit: vi.fn(),
      isLoading: false,
      latestProgress: null,
    } as any);

    renderHook(() => useThreadData());

    expect(mockAutoRenameThread).not.toHaveBeenCalled();
  });
});
```

**Test 1.2.8: Input Clearing on Thread Change**
```typescript
describe('Input Clearing', () => {
  it('should clear input when threadId changes', () => {
    const searchParams = { get: vi.fn() };
    vi.mocked(useSearchParams).mockReturnValue(searchParams as any);

    const mockReplace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ replace: mockReplace } as any);

    const messages: Message[] = [];
    vi.mocked(useStreamContext).mockReturnValue({
      messages,
      submit: vi.fn(),
      isLoading: false,
      latestProgress: null,
    } as any);

    const { result, rerender } = renderHook(({ threadId }) => useThreadData(), {
      initialProps: { threadId: 'thread-1' },
    });

    act(() => {
      result.current.setInput('Some input');
    });
    expect(result.current.input).toBe('Some input');

    // Simulate thread change
    searchParams.get
      .mockReturnValueOnce('thread-1')
      .mockReturnValueOnce('thread-2');
    
    rerender({ threadId: 'thread-2' });

    expect(result.current.input).toBe('');
  });
});

**Test 1.2.9: Auto-Rename Reset**
```typescript
describe('Auto-Rename Reset', () => {
  it('should reset hasTriggeredAutoRename when threadId changes', () => {
    const searchParams = { get: vi.fn() };
    vi.mocked(useSearchParams).mockReturnValue(searchParams as any);

    const mockAutoRenameThread = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(await import('@/lib/api/client'), 'getAPIClient')
      .mockReturnValue({ autoRenameThread: mockAutoRenameThread } as any);

    const mockGetThreads = vi.fn();
    vi.mocked(useThreads).mockReturnValue({ getThreads: mockGetThreads } as any);

    const messages: Message[] = [
      { id: '1', type: 'human', content: 'Hello' },
      { id: '2', type: 'ai', content: 'Hi!' },
    ];
    vi.mocked(useStreamContext).mockReturnValue({
      messages,
      submit: vi.fn(),
      isLoading: false,
      latestProgress: null,
    } as any);

    const { result, rerender, waitFor } = renderHook(({ threadId }) => useThreadData(), {
      initialProps: { threadId: 'thread-1' },
    });

    await waitFor(() => {
      expect(mockAutoRenameThread).toHaveBeenCalled();
    });

    // Switch thread
    searchParams.get
      .mockReturnValueOnce('thread-1')
      .mockReturnValueOnce('thread-2');
    
    rerender({ threadId: 'thread-2' });

    // Auto-rename should trigger again for new thread
    await waitFor(() => {
      expect(mockAutoRenameThread).toHaveBeenCalledTimes(2);
    });
  });
});
```

---

## Phase 2: Authentication Hooks (P0)

### 2.1 useAuth Function Tests (`hooks/useAuth.ts`)

**File Location:** `core/src/hooks/useAuth.ts`

#### Test Scenarios

**Test 2.1.1: login Function**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuth, AuthProvider } from './useAuth';
import { authClient } from '@/lib/auth/auth-client';

describe('useAuth - login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call authClient.signIn.email with credentials', async () => {
    vi.spyOn(authClient.signIn, 'email').mockResolvedValue({ error: null });
    vi.spyOn(authClient, 'useSession').mockReturnValue({
      data: null,
      isPending: false,
      error: null,
    } as any);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await result.current.login({ email: 'test@example.com', password: 'password' });

    expect(authClient.signIn.email).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password',
    });
  });

  it('should throw error on login failure', async () => {
    vi.spyOn(authClient.signIn, 'email').mockResolvedValue({
      error: { message: 'Invalid credentials' },
    });
    vi.spyOn(authClient, 'useSession').mockReturnValue({
      data: null,
      isPending: false,
      error: null,
    } as any);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await expect(result.current.login({ 
      email: 'test@example.com', 
      password: 'wrong' 
    })).rejects.toThrow('Invalid credentials');
  });
});
```

**Test 2.1.2: githubLogin Function**
```typescript
describe('githubLogin', () => {
  it('should call authClient.signIn.social with github provider', async () => {
    vi.spyOn(authClient.signIn, 'social').mockResolvedValue({ error: null });
    vi.spyOn(authClient, 'useSession').mockReturnValue({
      data: null,
      isPending: false,
      error: null,
    } as any);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await result.current.githubLogin();

    expect(authClient.signIn.social).toHaveBeenCalledWith({
      provider: 'github',
    });
  });

  it('should throw error on GitHub login failure', async () => {
    vi.spyOn(authClient.signIn, 'social').mockResolvedValue({
      error: { message: 'GitHub auth failed' },
    });
    vi.spyOn(authClient, 'useSession').mockReturnValue({
      data: null,
      isPending: false,
      error: null,
    } as any);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await expect(result.current.githubLogin()).rejects.toThrow('GitHub auth failed');
  });
});
```

**Test 2.1.3: googleLogin Function**
```typescript
describe('googleLogin', () => {
  it('should call authClient.signIn.social with google provider', async () => {
    vi.spyOn(authClient.signIn, 'social').mockResolvedValue({ error: null });
    vi.spyOn(authClient, 'useSession').mockReturnValue({
      data: null,
      isPending: false,
      error: null,
    } as any);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await result.current.googleLogin();

    expect(authClient.signIn.social).toHaveBeenCalledWith({
      provider: 'google',
    });
  });
});
```

**Test 2.1.4: logout Function**
```typescript
describe('logout', () => {
  it('should call authClient.signOut', async () => {
    vi.spyOn(authClient, 'signOut').mockResolvedValue(undefined);
    vi.spyOn(authClient, 'useSession').mockReturnValue({
      data: null,
      isPending: false,
      error: null,
    } as any);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await result.current.logout();

    expect(authClient.signOut).toHaveBeenCalled();
  });
});
```

**Test 2.1.5: updateProfile Function**
```typescript
describe('updateProfile', () => {
  it('should call authClient.updateUser with displayName', async () => {
    const mockUser = { id: '1', name: 'Old Name' };
    vi.spyOn(authClient, 'useSession').mockReturnValue({
      data: { user: mockUser },
      isPending: false,
      error: null,
    } as any);
    vi.spyOn(authClient, 'updateUser').mockResolvedValue({ error: null });

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    const updatedUser = await result.current.updateProfile({ displayName: 'New Name' });

    expect(authClient.updateUser).toHaveBeenCalledWith({ name: 'New Name' });
    expect(updatedUser.displayName).toBe('New Name');
  });

  it('should throw error when no user logged in', async () => {
    vi.spyOn(authClient, 'useSession').mockReturnValue({
      data: null,
      isPending: false,
      error: null,
    } as any);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await expect(result.current.updateProfile({ displayName: 'Name' }))
      .rejects.toThrow('No user logged in');
  });

  it('should throw error on update failure', async () => {
    const mockUser = { id: '1', name: 'Name' };
    vi.spyOn(authClient, 'useSession').mockReturnValue({
      data: { user: mockUser },
      isPending: false,
      error: null,
    } as any);
    vi.spyOn(authClient, 'updateUser').mockResolvedValue({
      error: { message: 'Update failed' },
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await expect(result.current.updateProfile({ displayName: 'Name' }))
      .rejects.toThrow('Update failed');
  });
});
```

**Test 2.1.6: clearError Function**
```typescript
describe('clearError', () => {
  it('should exist and be callable', () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    // Should not throw
    expect(() => result.current.clearError()).not.toThrow();
  });
});
```

**Test 2.1.7: User Mapping Function**
```typescript
describe('mapBetterAuthUser', () => {
  it('should map Better Auth user to User type', () => {
    const betterAuthUser = {
      id: 'user-123',
      name: 'John Doe',
      email: 'john@example.com',
      image: 'https://example.com/avatar.png',
      role: 'admin',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-06-01'),
    };

    const result = mapBetterAuthUser(betterAuthUser);

    expect(result).toEqual({
      id: 'user-123',
      displayName: 'John Doe',
      email: 'john@example.com',
      role: 'admin',
      status: 'active',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-06-01T00:00:00.000Z',
    });
  });

  it('should use email prefix when name is null', () => {
    const betterAuthUser = {
      id: 'user-123',
      name: null,
      email: 'john@example.com',
    };

    const result = mapBetterAuthUser(betterAuthUser);

    expect(result.displayName).toBe('john');
  });

  it('should return null when user is null', () => {
    const result = mapBetterAuthUser(null);
    expect(result).toBeNull();
  });
});
```

**Test 2.1.8: Fallback Session Detection**
```typescript
describe('Fallback Session Detection', () => {
  it('should fetch session from /api/auth/get-session after delay', async () => {
    vi.useFakeTimers();
    
    vi.spyOn(authClient, 'useSession').mockReturnValue({
      data: null,
      isPending: true,
      error: null,
    } as any);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session: { user: { id: 'fallback-user' } } }),
    });

    const { result, waitFor } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    expect(result.current.state.loading).toBe(true);

    vi.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/get-session', {
        method: 'GET',
        credentials: 'include',
      });
    });

    vi.useRealTimers();
  });

  it('should handle fallback session fetch error', async () => {
    vi.useFakeTimers();

    vi.spyOn(authClient, 'useSession').mockReturnValue({
      data: null,
      isPending: true,
      error: null,
    } as any);

    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const { result, waitFor } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    vi.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(result.current.state.error).toBe('Network error');
    });

    vi.useRealTimers();
  });
});
```

**Test 2.1.9: State Deduplication**
```typescript
describe('State Deduplication', () => {
  it('should not update state if nothing changed', () => {
    const mockSetState = vi.fn();
    vi.spyOn(require('react'), 'useState')
      .mockImplementationOnce(() => [null, mockSetState])
      .mockImplementationOnce(() => [null, vi.fn()])
      .mockImplementation(() => [false, vi.fn()]);

    vi.spyOn(authClient, 'useSession').mockReturnValue({
      data: { user: { id: '1', name: 'Test' } },
      isPending: false,
      error: null,
    } as any);

    renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    // SetState should only be called once (not on every render)
    expect(mockSetState).toHaveBeenCalledTimes(1);
  });
});
```

**Test 2.1.10: Loading State Derivation**
```typescript
describe('Loading State', () => {
  it('should be true when isPending is true and no fallback session', () => {
    vi.spyOn(authClient, 'useSession').mockReturnValue({
      data: null,
      isPending: true,
      error: null,
    } as any);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    expect(result.current.state.loading).toBe(true);
  });

  it('should be false when isPending is false', () => {
    vi.spyOn(authClient, 'useSession').mockReturnValue({
      data: { user: { id: '1' } },
      isPending: false,
      error: null,
    } as any);

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    expect(result.current.state.loading).toBe(false);
  });
});
```

**Test 2.1.11: Test Context Adaptation**
```typescript
describe('Test Context', () => {
  it('should adapt test context to AuthContextType', () => {
    const mockTestContext = {
      state: {
        user: { id: 'test', displayName: 'Test', email: 'test@test.com', role: 'user', status: 'active', createdAt: '', updatedAt: '' },
        loading: false,
        error: null,
      },
      login: vi.fn(),
      githubLogin: vi.fn(),
    };

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <TestAuthContext.Provider value={mockTestContext as any}>
          {children}
        </TestAuthContext.Provider>
      ),
    });

    expect(result.current.state.user?.id).toBe('test');
    expect(result.current.login).toBeDefined();
    expect(typeof result.current.login).toBe('function');
  });
});
```

---

### 2.2 useAdminAuth State Tests (`hooks/useAdminAuth.ts`)

**File Location:** `core/src/hooks/useAdminAuth.ts`

#### Test Scenarios

**Test 2.2.1: isAdminLoading State**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAdminAuth } from './useAdminAuth';
import { TestAuthContext } from './useAuth';
import type { User } from '@/types/auth';

describe('useAdminAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should derive isAdminLoading from state.loading', () => {
    const { result } = renderHook(() => useAdminAuth(), {
      wrapper: ({ children }) => (
        <TestAuthContext.Provider value={{
          state: { user: null, loading: true, error: null },
        }}>
          {children}
        </TestAuthContext.Provider>
      ),
    });

    expect(result.current.isAdminLoading).toBe(true);
  });

  it('should be false when loading is false', () => {
    const { result } = renderHook(() => useAdminAuth(), {
      wrapper: ({ children }) => (
        <TestAuthContext.Provider value={{
          state: { user: null, loading: false, error: null },
        }}>
          {children}
        </TestAuthContext.Provider>
      ),
    });

    expect(result.current.isAdminLoading).toBe(false);
  });
});
```

**Test 2.2.2: user Property**
```typescript
describe('user Property', () => {
  it('should return user from auth state', () => {
    const mockUser: User = {
      id: '123',
      displayName: 'Admin',
      email: 'admin@test.com',
      role: 'admin',
      status: 'active',
      createdAt: '',
      updatedAt: '',
    };

    const { result } = renderHook(() => useAdminAuth(), {
      wrapper: ({ children }) => (
        <TestAuthContext.Provider value={{
          state: { user: mockUser, loading: false, error: null },
        }}>
          {children}
        </TestAuthContext.Provider>
      ),
    });

    expect(result.current.user).toBe(mockUser);
  });

  it('should return null when no user', () => {
    const { result } = renderHook(() => useAdminAuth(), {
      wrapper: ({ children }) => (
        <TestAuthContext.Provider value={{
          state: { user: null, loading: false, error: null },
        }}>
          {children}
        </TestAuthContext.Provider>
      ),
    });

    expect(result.current.user).toBeNull();
  });
});
```

**Test 2.2.3: error Property**
```typescript
describe('error Property', () => {
  it('should return error from auth state', () => {
    const { result } = renderHook(() => useAdminAuth(), {
      wrapper: ({ children }) => (
        <TestAuthContext.Provider value={{
          state: { user: null, loading: false, error: 'Auth failed' },
        }}>
          {children}
        </TestAuthContext.Provider>
      ),
    });

    expect(result.current.error).toBe('Auth failed');
  });
});
```

**Test 2.2.4: loading Property**
```typescript
describe('loading Property', () => {
  it('should return state.loading', () => {
    const { result } = renderHook(() => useAdminAuth(), {
      wrapper: ({ children }) => (
        <TestAuthContext.Provider value={{
          state: { user: null, loading: true, error: null },
        }}>
          {children}
        </TestAuthContext.Provider>
      ),
    });

    expect(result.current.loading).toBe(true);
  });
});
```

**Test 2.2.5: isAdminLoading with No User and No Error**
```typescript
describe('isAdminLoading Edge Cases', () => {
  it('should be true when no user and no error', () => {
    const { result } = renderHook(() => useAdminAuth(), {
      wrapper: ({ children }) => (
        <TestAuthContext.Provider value={{
          state: { user: null, loading: false, error: null },
        }}>
          {children}
        </TestAuthContext.Provider>
      ),
    });

    // isAdminLoading = loading || (!hasUser && !error)
    // = false || (!false && !null) = false || true = true
    expect(result.current.isAdminLoading).toBe(true);
  });
});
```

---

## Phase 3: Message & Theme Hooks (P1)

### 3.1 useAssistantMessageData Metadata Tests (`hooks/useAssistantMessageData.ts`)

**File Location:** `core/src/hooks/useAssistantMessageData.ts`

#### Test Scenarios

**Test 3.1.1: Meta Branch Extraction**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAssistantMessageData } from './useAssistantMessageData';
import { useStreamContext } from '@/providers/StreamProvider';
import type { Message } from '@langchain/langgraph-sdk';

vi.mocked(useStreamContext).mockReturnValue({
  getMessagesMetadata: vi.fn().mockReturnValue({
    branch: 'feature-branch',
    branchOptions: ['main', 'feature-branch', 'experimental'],
  }),
} as any);

describe('useAssistantMessageData - meta', () => {
  it('should extract branch from metadata', () => {
    const message = { 
      content: 'Hello', 
      role: 'assistant',
      id: 'msg-1',
    } as Message;

    const { result } = renderHook(() => 
      useAssistantMessageData(message)
    );

    expect(result.current.meta.branch).toBe('feature-branch');
  });

  it('should extract branchOptions from metadata', () => {
    const message = { 
      content: 'Hello', 
      role: 'assistant',
      id: 'msg-1',
    } as Message;

    const { result } = renderHook(() => 
      useAssistantMessageData(message)
    );

    expect(result.current.meta.branchOptions).toEqual(['main', 'feature-branch', 'experimental']);
  });

  it('should extract parentCheckpoint from firstSeenState', () => {
    const mockCheckpoint = { id: 'checkpoint-123' };
    vi.mocked(useStreamContext).mockReturnValue({
      getMessagesMetadata: vi.fn().mockReturnValue({
        branch: undefined,
        branchOptions: undefined,
        firstSeenState: { parent_checkpoint: mockCheckpoint },
      }),
    } as any);

    const message = { 
      content: 'Hello', 
      role: 'assistant',
      id: 'msg-1',
    } as Message;

    const { result } = renderHook(() => 
      useAssistantMessageData(message)
    );

    expect(result.current.meta.parentCheckpoint).toBe(mockCheckpoint);
  });
});
```

**Test 3.1.2: toolResults Filtering**
```typescript
describe('toolResults', () => {
  it('should filter nextMessages by tool_call_id', () => {
    const message = {
      content: 'Let me search for that',
      role: 'assistant',
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'search', arguments: '{}' } }],
      id: 'msg-1',
    } as Message;

    const nextMessages: Message[] = [
      { id: 'tool-1', type: 'tool', content: 'Search results', tool_call_id: 'call-1' } as Message,
      { id: 'tool-2', type: 'tool', content: 'Unrelated', tool_call_id: 'call-2' } as Message,
    ];

    const { result } = renderHook(() => 
      useAssistantMessageData(message, nextMessages)
    );

    expect(result.current.toolResults).toHaveLength(1);
    expect(result.current.toolResults[0].tool_call_id).toBe('call-1');
  });

  it('should return empty array when no tool calls', () => {
    const message = {
      content: 'Hello',
      role: 'assistant',
      id: 'msg-1',
    } as Message;

    const { result } = renderHook(() => 
      useAssistantMessageData(message, [])
    );

    expect(result.current.toolResults).toEqual([]);
  });
});
```

**Test 3.1.3: Non-Text Part Filtering**
```typescript
describe('Content Parsing Edge Cases', () => {
  it('should filter out non-text parts from array content', () => {
    const message = {
      content: [
        { type: 'text', text: 'Hello' },
        { type: 'image', url: 'https://example.com/image.png' },
        { type: 'text', text: 'World' },
      ],
      role: 'assistant',
      id: 'msg-1',
    } as Message;

    const { result } = renderHook(() => 
      useAssistantMessageData(message)
    );

    expect(result.current.contentString).toBe('Hello\nWorld');
  });

  it('should handle complex content with JSON.stringify fallback', () => {
    const message = {
      content: { custom: { nested: 'object' } },
      role: 'assistant',
      id: 'msg-1',
    } as Message;

    const { result } = renderHook(() => 
      useAssistantMessageData(message)
    );

    expect(result.current.contentString).toBe('{"custom":{"nested":"object"}}');
  });
});
```

**Test 3.1.4: hasBranches Detection**
```typescript
describe('hasBranches', () => {
  it('should be true when branchOptions.length > 1', () => {
    vi.mocked(useStreamContext).mockReturnValue({
      getMessagesMetadata: vi.fn().mockReturnValue({
        branchOptions: ['main', 'branch-1', 'branch-2'],
      }),
    } as any);

    const message = { content: 'Hello', role: 'assistant', id: 'msg-1' } as Message;

    const { result } = renderHook(() => useAssistantMessageData(message));

    expect(result.current.hasBranches).toBe(true);
  });

  it('should be false when only one branch option', () => {
    vi.mocked(useStreamContext).mockReturnValue({
      getMessagesMetadata: vi.fn().mockReturnValue({
        branchOptions: ['main'],
      }),
    } as any);

    const message = { content: 'Hello', role: 'assistant', id: 'msg-1' } as Message;

    const { result } = renderHook(() => useAssistantMessageData(message));

    expect(result.current.hasBranches).toBe(false);
  });
});
```

**Test 3.1.5: toolCallsHaveContents Detection**
```typescript
describe('toolCallsHaveContents', () => {
  it('should be true when tool calls have args', () => {
    const message = {
      content: 'Searching...',
      role: 'assistant',
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'search', arguments: '{"query":"test"}' } }],
      id: 'msg-1',
    } as Message;

    const { result } = renderHook(() => useAssistantMessageData(message));

    expect(result.current.toolCallsHaveContents).toBe(true);
  });

  it('should be false when tool calls have empty args', () => {
    const message = {
      content: 'Searching...',
      role: 'assistant',
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'search', arguments: '{}' } }],
      id: 'msg-1',
    } as Message;

    const { result } = renderHook(() => useAssistantMessageData(message));

    expect(result.current.toolCallsHaveContents).toBe(false);
  });
});
```

---

### 3.2 useDarkMode Integration Tests (`hooks/useDarkMode.ts`)

**File Location:** `core/src/hooks/useDarkMode.ts`

#### Test Scenarios

**Test 3.2.1: LocalStorage Read on Mount**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDarkMode, DarkModeProvider } from './useDarkMode';

describe('useDarkMode - LocalStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(document.documentElement.classList, 'add');
    vi.spyOn(document.documentElement.classList, 'remove');
  });

  it('should read saved preference from localStorage', async () => {
    localStorage.setItem('darkMode', 'true');

    const { result, waitFor: waitForHook } = renderHook(() => useDarkMode(), {
      wrapper: DarkModeProvider,
    });

    await waitForHook(() => result.current.isDarkMode !== undefined);

    expect(result.current.isDarkMode).toBe(true);
    expect(document.documentElement.classList.add).toHaveBeenCalledWith('dark');
  });

  it('should use system preference when no localStorage value', async () => {
    vi.spyOn(window.matchMedia, '(prefers-color-scheme: dark)').mockReturnValue({
      matches: true,
    } as any);

    const { result, waitFor: waitForHook } = renderHook(() => useDarkMode(), {
      wrapper: DarkModeProvider,
    });

    await waitForHook(() => result.current.isDarkMode !== undefined);

    expect(result.current.isDarkMode).toBe(true);
  });

  it('should save preference to localStorage on change', async () => {
    const { result, waitFor: waitForHook, act } = renderHook(() => useDarkMode(), {
      wrapper: DarkModeProvider,
    });

    await waitForHook(() => result.current.isDarkMode !== undefined);

    const setItemSpy = vi.spyOn(localStorage, 'setItem');

    act(() => {
      result.current.setDarkMode(true);
    });

    expect(localStorage.setItem).toHaveBeenCalledWith('darkMode', 'true');
  });

  it('should handle localStorage error gracefully', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('Storage disabled');
    });

    vi.spyOn(window.matchMedia, '(prefers-color-scheme: dark)').mockReturnValue({
      matches: false,
    } as any);

    const { result, waitFor: waitForHook } = renderHook(() => useDarkMode(), {
      wrapper: DarkModeProvider,
    });

    await waitForHook(() => result.current.isDarkMode !== undefined);

    // Should fallback to system preference without crashing
    expect(result.current.isDarkMode).toBe(false);
  });

  it('should handle localStorage setItem error gracefully', async () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage full');
    });

    const { result, waitFor: waitForHook, act } = renderHook(() => useDarkMode(), {
      wrapper: DarkModeProvider,
    });

    await waitForHook(() => result.current.isDarkMode !== undefined);

    // Should not throw
    act(() => {
      result.current.setDarkMode(true);
    });

    expect(result.current.isDarkMode).toBe(true);
  });
});
```

**Test 3.2.2: DOM Class Manipulation**
```typescript
describe('DOM Class Manipulation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should add "dark" class when isDarkMode is true', async () => {
    const addSpy = vi.spyOn(document.documentElement.classList, 'add');
    const removeSpy = vi.spyOn(document.documentElement.classList, 'remove');

    localStorage.setItem('darkMode', 'true');

    const { result, waitFor: waitForHook } = renderHook(() => useDarkMode(), {
      wrapper: DarkModeProvider,
    });

    await waitForHook(() => result.current.isDarkMode !== undefined);

    expect(addSpy).toHaveBeenCalledWith('dark');
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it('should remove "dark" class when isDarkMode is false', async () => {
    const addSpy = vi.spyOn(document.documentElement.classList, 'add');
    const removeSpy = vi.spyOn(document.documentElement.classList, 'remove');

    const { result, waitFor: waitForHook, act } = renderHook(() => useDarkMode(), {
      wrapper: DarkModeProvider,
    });

    await waitForHook(() => result.current.isDarkMode !== undefined);

    act(() => {
      result.current.setDarkMode(false);
    });

    expect(removeSpy).toHaveBeenCalledWith('dark');
    expect(addSpy).toHaveBeenCalledWith('dark'); // Initial call
  });
});
```

**Test 3.2.3: Hydration Handling**
```typescript
describe('Hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should not apply dark mode class until hydrated', async () => {
    const addSpy = vi.spyOn(document.documentElement.classList, 'add');

    localStorage.setItem('darkMode', 'true');

    const { result, waitFor: waitForHook } = renderHook(() => useDarkMode(), {
      wrapper: DarkModeProvider,
    });

    // Before hydration
    expect(result.current.isDarkMode).toBe(false);

    await waitForHook(() => result.current.isDarkMode !== undefined);

    // After hydration
    expect(addSpy).toHaveBeenCalledWith('dark');
  });
});
```

**Test 3.2.4: Test Context Priority**
```typescript
describe('Test Context Priority', () => {
  it('should prefer TestDarkModeContext over DarkModeContext', () => {
    const testContextValue = {
      isDarkMode: true,
      toggleDarkMode: vi.fn(),
      setDarkMode: vi.fn(),
    };

    const { result } = renderHook(() => useDarkMode(), {
      wrapper: ({ children }) => (
        <TestDarkModeContext.Provider value={testContextValue}>
          {children}
        </TestDarkModeContext.Provider>
      ),
    });

    expect(result.current.isDarkMode).toBe(true);
  });
});
```

---

## Phase 4: Edge Cases & Error Handling (P2)

### 4.1 useAutoRename Edge Cases (`hooks/useAutoRename.ts`)

**File Location:** `core/src/hooks/useAutoRename.ts`

#### Test Scenarios

**Test 4.1.1: Error Handling**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAutoRename } from './useAutoRename';
import type { Message } from '@langchain/langgraph-sdk';

describe('useAutoRename - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle API error gracefully', async () => {
    const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockApiClient = {
      autoRenameThread: vi.fn().mockRejectedValue(new Error('API Error')),
    };

    const messages: Message[] = [
      { id: '1', type: 'human', content: 'Hello' },
      { id: '2', type: 'ai', content: 'Hi!' },
    ];

    const { result } = renderHook(() =>
      useAutoRename({
        threadId: 'thread-123',
        messages,
        apiClient: mockApiClient as any,
      })
    );

    await waitFor(() => {
      expect(mockConsoleError).toHaveBeenCalledWith(
        'Auto-rename failed:',
        expect.any(Error)
      );
    });

    // isRenaming should be false after error
    expect(result.current.isAutoRenaming).toBe(false);
  });

  it('should invoke onRenameComplete callback on success', async () => {
    const mockOnRenameComplete = vi.fn();
    const mockApiClient = {
      autoRenameThread: vi.fn().mockResolvedValue(undefined),
    };

    const messages: Message[] = [
      { id: '1', type: 'human', content: 'Hello' },
      { id: '2', type: 'ai', content: 'Hi!' },
    ];

    renderHook(() =>
      useAutoRename({
        threadId: 'thread-123',
        messages,
        onRenameComplete: mockOnRenameComplete,
        apiClient: mockApiClient as any,
      })
    );

    await waitFor(() => {
      expect(mockOnRenameComplete).toHaveBeenCalled();
    });
  });
});
```

**Test 4.1.2: Content as Array**
```typescript
describe('Content Handling', () => {
  it('should JSON.stringify array content', async () => {
    const mockApiClient = {
      autoRenameThread: vi.fn().mockResolvedValue(undefined),
    };

    const messages: Message[] = [
      { 
        id: '1', 
        type: 'human', 
        content: [{ type: 'text', text: 'Complex' }, { type: 'text', text: 'Message' }] 
      },
      { id: '2', type: 'ai', content: 'Hi!' },
    ];

    renderHook(() =>
      useAutoRename({
        threadId: 'thread-123',
        messages,
        apiClient: mockApiClient as any,
      })
    );

    await waitFor(() => {
      expect(mockApiClient.autoRenameThread).toHaveBeenCalledWith(
        'thread-123',
        '[\n  {\n    "type": "text",\n    "text": "Complex"\n  },\n  {\n    "type": "text",\n    "text": "Message"\n  }\n]'
      );
    });
  });

  it('should skip when no human message found', () => {
    const mockApiClient = {
      autoRenameThread: vi.fn().mockResolvedValue(undefined),
    };

    const messages: Message[] = [
      { id: '1', type: 'ai', content: 'AI message' },
      { id: '2', type: 'ai', content: 'Another AI' },
    ];

    const { result } = renderHook(() =>
      useAutoRename({
        threadId: 'thread-123',
        messages,
        apiClient: mockApiClient as any,
      })
    );

    expect(result.current.hasTriggeredAutoRename).toBe(false);
    expect(mockApiClient.autoRenameThread).not.toHaveBeenCalled();
  });
});
```

**Test 4.1.3: Manual Trigger**
```typescript
describe('Manual Trigger', () => {
  it('should expose triggerAutoRename function', async () => {
    const mockApiClient = {
      autoRenameThread: vi.fn().mockResolvedValue(undefined),
    };

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

    expect(typeof result.current.triggerAutoRename).toBe('function');

    // Call manually
    result.current.triggerAutoRename();

    expect(mockApiClient.autoRenameThread).toHaveBeenCalledWith(
      'thread-123',
      'Hello'
    );
  });

  it('should return void when threadId is null', () => {
    const { result } = renderHook(() =>
      useAutoRename({
        threadId: null,
        messages: [],
      })
    );

    // Should not throw, just be a no-op
    result.current.triggerAutoRename();
    expect(result.current.triggerAutoRename()).toBeUndefined();
  });
});
```

---

### 4.2 useChatInput Edge Cases (`hooks/useChatInput.ts`)

**File Location:** `core/src/hooks/useChatInput.ts`

#### Test Scenarios

**Test 4.2.1: Form Submission**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatInput } from './useChatInput';

describe('useChatInput - Form Submission', () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call form.requestSubmit on Enter key', () => {
    const mockRequestSubmit = vi.fn();
    const mockEvent = {
      key: 'Enter',
      preventDefault: vi.fn(),
      currentTarget: { form: { requestSubmit: mockRequestSubmit } },
      shiftKey: false,
      metaKey: false,
      nativeEvent: { isComposing: false },
    };

    const { result } = renderHook(() =>
      useChatInput({ onSubmit: mockOnSubmit, isLoading: false })
    );

    act(() => {
      result.current.setInput('Hello!');
    });

    result.current.handleKeyDown(mockEvent as any);

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockRequestSubmit).toHaveBeenCalled();
  });

  it('should handle form without requestSubmit', () => {
    const mockEvent = {
      key: 'Enter',
      preventDefault: vi.fn(),
      currentTarget: { form: null },
      shiftKey: false,
      metaKey: false,
      nativeEvent: { isComposing: false },
    };

    const { result } = renderHook(() =>
      useChatInput({ onSubmit: mockOnSubmit, isLoading: false })
    );

    act(() => {
      result.current.setInput('Hello!');
    });

    // Should not throw
    result.current.handleKeyDown(mockEvent as any);
  });
});
```

**Test 4.2.2: canSubmit with Whitespace**
```typescript
describe('canSubmit with Whitespace', () => {
  it('should be false with only whitespace input', () => {
    const { result } = renderHook(() =>
      useChatInput({ onSubmit: mockOnSubmit, isLoading: false })
    );

    act(() => {
      result.current.setInput('   ');
    });

    expect(result.current.canSubmit).toBe(false);
  });

  it('should be false with mixed whitespace and text', () => {
    const { result } = renderHook(() =>
      useChatInput({ onSubmit: mockOnSubmit, isLoading: false })
    );

    act(() => {
      result.current.setInput('  Hello  ');
    });

    expect(result.current.canSubmit).toBe(true);
  });
});
```

**Test 4.2.3: Default UUID Generator**
```typescript
describe('Default UUID Generator', () => {
  it('should use uuidv4 when not provided', () => {
    const mockOnSubmit = vi.fn();

    const { result } = renderHook(() =>
      useChatInput({ onSubmit: mockOnSubmit, isLoading: false })
    );

    act(() => {
      result.current.setInput('Hello!');
    });

    act(() => {
      result.current.handleSubmit();
    });

    // Verify a UUID was generated (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        ),
      })
    );
  });
});
```

---

### 4.3 useConfirmDialogPromise Edge Cases (`hooks/useConfirmDialogPromise.ts`)

**File Location:** `core/src/hooks/useConfirmDialogPromise.ts`

#### Test Scenarios

**Test 4.3.1: Double Resolution Prevention**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConfirmDialogPromise } from './useConfirmDialogPromise';

// Mock useConfirmDialog
const mockConfirmDialog = vi.fn();

vi.mock('@/components/DialogManager', () => ({
  useConfirmDialog: () => mockConfirmDialog,
}));

describe('useConfirmDialogPromise - Double Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should only resolve once even if confirm called multiple times', async () => {
    let closeFn: () => void;
    mockConfirmDialog.mockReturnValue((options: any) => {
      closeFn = options.onConfirm;
      return () => {};
    });

    const { result } = renderHook(() => useConfirmDialogPromise());

    const promise = result.current.confirm({ title: 'Test?' });

    // Simulate multiple confirm calls
    closeFn!();
    closeFn!();
    closeFn!();

    await waitFor(() => {
      expect(promise).resolves.toBe(true);
    });
  });
});
```

**Test 4.3.2: Options Passthrough**
```typescript
describe('Options Passthrough', () => {
  it('should pass all options to confirmDialog', () => {
    const mockConfirmDialog = vi.fn().mockReturnValue(() => {});
    
    vi.mock('@/components/DialogManager', () => ({
      useConfirmDialog: () => mockConfirmDialog,
    }));

    const { result } = renderHook(() => useConfirmDialogPromise());

    result.current.confirm({
      title: 'Confirm Action',
      description: 'Are you sure?',
      confirmText: 'Yes',
      cancelText: 'No',
      confirmVariant: 'destructive',
    });

    expect(mockConfirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Confirm Action',
        description: 'Are you sure?',
        confirmText: 'Yes',
        cancelText: 'No',
        confirmVariant: 'destructive',
      })
    );
  });
});
```

---

### 4.4 SSE Error Handling Tests

#### 4.4.1 useHealthStream JSON Parse Error
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHealthStream } from './useHealthStream';

describe('useHealthStream - JSON Parse Error', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventSourceInstance.onmessage = null;
    mockEventSourceInstance.onerror = null;
    mockEventSourceInstance.onopen = null;
  });

  it('should skip invalid JSON in onmessage', () => {
    const { result } = renderHook(() => useHealthStream());

    // Simulate invalid JSON
    mockEventSourceInstance.onmessage!({
      data: 'invalid json {',
    } as MessageEvent);

    // Should not throw, state should remain unchanged
    expect(result.current.services).toEqual({});
  });
});
```

#### 4.4.2 useLogStream JSON Parse Error
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLogStream } from './useLogStream';

describe('useLogStream - JSON Parse Error', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventSourceInstance.onmessage = null;
  });

  it('should skip invalid JSON log entries', () => {
    const { result } = renderHook(() => useLogStream({ service: 'core' }));

    // Add valid entry first
    mockEventSourceInstance.onmessage!({
      data: JSON.stringify({
        timestamp: '2024-01-01T00:00:00Z',
        level: 'info',
        service: 'core',
        message: 'Valid message',
        raw: 'raw',
      }),
    } as MessageEvent);

    expect(result.current.logs).toHaveLength(1);

    // Add invalid JSON
    mockEventSourceInstance.onmessage!({
      data: 'not json at all',
    } as MessageEvent);

    // Should still have 1 entry (invalid skipped)
    expect(result.current.logs).toHaveLength(1);
  });
});
```

---

## Mock Infrastructure

### Additional Mocks Required

```typescript
// For useThreadData tests
vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
  useRouter: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  getAPIClient: vi.fn(),
}));

vi.mock('@/lib/ensure-tool-responses', () => ({
  ensureToolCallsHaveResponses: vi.fn((msgs) => msgs),
}));

// For useAuth tests
vi.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: vi.fn(),
    signIn: {
      email: vi.fn(),
      social: vi.fn(),
    },
    signOut: vi.fn(),
    updateUser: vi.fn(),
  },
}));

// For clipboard/DOM tests
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(),
    readText: vi.fn(),
  },
  writable: true,
});
```

---

## Coverage Summary

| Hook | Gap Tests | Total Tests | Status |
|------|-----------|-------------|--------|
| useService | 2 | 2 | New |
| useThreadData | 9 | 29 | Extended |
| useAuth | 12 | 32 | Extended |
| useAssistantMessageData | 6 | 16 | Extended |
| useDarkMode | 7 | 17 | Extended |
| useAdminAuth | 5 | 13 | Extended |
| useAutoRename | 5 | 17 | Extended |
| useChatInput | 3 | 15 | Extended |
| useConfirmDialogPromise | 2 | 12 | Extended |
| useHealthStream | 4 | 19 | Extended |
| useLogStream | 3 | 18 | Extended |

**Total Gap Tests:** ~58 tests  
**Total After Tasks D + D-2:** ~200+ tests

---

## Execution Order

1. **Complete Tasks D** (all 11 hooks, ~133 tests)
2. **Execute Tasks D-2** (gap analysis, ~58 tests)
3. **Run full coverage report** to verify 70% target

---

## Success Criteria

- All gap tests from analysis implemented
- 70% overall hook coverage achieved
- No untested action handlers
- All error paths covered
- Integration tests for context providers pass

---

## Next Steps

1. Execute Tasks D (133 tests)
2. Execute Tasks D-2 (58 tests)
3. Verify coverage with `npm run test:coverage`
4. Move to Tasks E for library file coverage

**End of Tasks D-2**

