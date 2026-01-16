import { vi } from 'vitest';
import type { ThreadListItem } from '@/services/api';

export interface MockThreadContextType {
  threads: ThreadListItem[];
  getThreads: () => Promise<ThreadListItem[]>;
  setThreads: (threads: ThreadListItem[]) => void;
  createThread: (id: string) => void;
  createNewThread: () => Promise<string>;
  updateThread: (threadId: string, name: string) => Promise<void>;
  deleteThread: (threadId: string) => Promise<void>;
  threadsLoading: boolean;
}

export const threadContextContainer = {
  current: createDefaultThreadContext() as MockThreadContextType,
};

export function createDefaultThreadContext(): MockThreadContextType {
  return {
    threads: [],
    getThreads: vi.fn().mockResolvedValue([]),
    setThreads: vi.fn(),
    createThread: vi.fn(),
    createNewThread: vi.fn().mockResolvedValue('new-thread'),
    updateThread: vi.fn().mockResolvedValue(undefined),
    deleteThread: vi.fn().mockResolvedValue(undefined),
    threadsLoading: false,
  };
}

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

export function createMockThreads(count: number = 5): ThreadListItem[] {
  const threads: ThreadListItem[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const timestamp = now - i * 1000 * 60 * 60;
    threads.push({
      id: `thread-${i}`,
      name: `Thread ${i + 1}`,
      createdAt: new Date(timestamp).toISOString(),
      lastTouchedAt: new Date(timestamp + 1000 * 60 * 30).toISOString(),
      messageCount: i,
    });
  }
  return threads;
}
