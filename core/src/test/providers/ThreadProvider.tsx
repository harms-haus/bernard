import { createContext, useContext, ReactNode, useMemo } from 'react';
import type { ThreadListItem } from '@/services/api';
import { vi, type Mock } from 'vitest';

export interface MockThreadContextType {
  threads: ThreadListItem[];
  getThreads: Mock<() => Promise<ThreadListItem[]>>;
  setThreads: Mock<(threads: ThreadListItem[]) => void>;
  createThread: Mock<(id: string) => void>;
  createNewThread: Mock<() => Promise<string>>;
  updateThread: Mock<(threadId: string, name: string) => Promise<void>>;
  deleteThread: Mock<(threadId: string) => Promise<void>>;
  threadsLoading: boolean;
}

const MockThreadContext = createContext<MockThreadContextType | undefined>(undefined);

const mockThreadContextContainer: { current: MockThreadContextType } = {
  current: {
    threads: [],
    getThreads: vi.fn().mockResolvedValue([]),
    setThreads: vi.fn(),
    createThread: vi.fn(),
    createNewThread: vi.fn().mockResolvedValue('new-thread'),
    updateThread: vi.fn().mockResolvedValue(undefined),
    deleteThread: vi.fn().mockResolvedValue(undefined),
    threadsLoading: false,
  },
};

export { mockThreadContextContainer };

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
  const contextValue = useMemo(() => value, [value]);
  return (
    <MockThreadContext.Provider value={contextValue}>
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

// Helper to create a mock thread for testing
export function createMockThread(overrides: Partial<ThreadListItem> = {}): ThreadListItem {
  const now = new Date().toISOString();
  return {
    id: `thread-${Date.now()}`,
    name: 'Test Thread',
    createdAt: now,
    lastTouchedAt: now,
    messageCount: 0,
    ...overrides,
  };
}

// Helper to create multiple mock threads for testing
export function createMockThreads(count: number = 5): ThreadListItem[] {
  const threads: ThreadListItem[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const timestamp = now - i * 1000 * 60 * 60; // Each thread 1 hour apart
    threads.push({
      id: `thread-${i}`,
      name: `Thread ${i + 1}`,
      createdAt: new Date(timestamp).toISOString(),
      lastTouchedAt: new Date(timestamp + 1000 * 60 * 30).toISOString(),
      messageCount: Math.floor(Math.random() * 10),
    });
  }
  return threads;
}
