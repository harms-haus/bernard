import { ReactNode, createContext, useContext } from 'react';
import type { Message } from '@langchain/langgraph-sdk';
import type { ThreadListItem } from '@/services/api';
import { vi } from 'vitest';

interface TestContextValue {
  messages: Message[];
  isLoading: boolean;
  submit: (values: { messages: Message[] }, options?: any) => void;
  stop: () => void;
  latestProgress: any;
  getMessagesMetadata: (message: Message) => any;
  setBranch: (branch: string) => void;
}

const TestStreamContext = createContext<TestContextValue | undefined>(undefined);

export function useTestStreamContext() {
  return useContext(TestStreamContext);
}

interface TestThreadContextValue {
  threads: ThreadListItem[];
  threadsLoading: boolean;
  getThreads: () => Promise<void>;
  createNewThread: () => Promise<string>;
}

const TestThreadContext = createContext<TestThreadContextValue | undefined>(undefined);

export function useTestThreadContext() {
  return useContext(TestThreadContext);
}

interface TestAuthContextValue {
  user: {
    id: string;
    displayName: string;
    isAdmin: boolean;
    status: 'active' | 'inactive' | 'pending';
    createdAt: string;
    updatedAt: string;
  } | null;
}

const TestAuthContext = createContext<TestAuthContextValue | undefined>(undefined);

export function useTestAuthContext() {
  return useContext(TestAuthContext);
}

interface ThreadTestWrapperProps {
  children: ReactNode;
  messages?: Message[];
  isLoading?: boolean;
  threads?: ThreadListItem[];
  user?: TestAuthContextValue['user'];
}

export function ThreadTestWrapper({
  children,
  messages = [],
  isLoading = false,
  threads = [],
  user = {
    id: 'test-user',
    displayName: 'Test User',
    isAdmin: false,
    status: 'active' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
}: ThreadTestWrapperProps) {
  const streamValue: TestContextValue = {
    messages,
    isLoading,
    submit: vi.fn(),
    stop: vi.fn(),
    latestProgress: null,
    getMessagesMetadata: () => ({}),
    setBranch: vi.fn(),
  };

  const threadValue: TestThreadContextValue = {
    threads,
    threadsLoading: false,
    getThreads: vi.fn().mockResolvedValue(undefined),
    createNewThread: vi.fn().mockResolvedValue('new-thread'),
  };

  const authValue: TestAuthContextValue = { user };

  return (
    <TestAuthContext.Provider value={authValue}>
      <TestThreadContext.Provider value={threadValue}>
        <TestStreamContext.Provider value={streamValue}>
          {children}
        </TestStreamContext.Provider>
      </TestThreadContext.Provider>
    </TestAuthContext.Provider>
  );
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
      messageCount: i + 1,
    });
  }
  return threads;
}

export function createMockMessage(type: 'human' | 'ai', content: string, id?: string): Message {
  return {
    id: id ?? `msg-${Date.now()}`,
    type,
    content,
  };
}

export function createMockMessageThread(length: number = 4): Message[] {
  const messages: Message[] = [];
  for (let i = 0; i < length; i++) {
    messages.push(
      i % 2 === 0
        ? createMockMessage('human', `User message ${i}`)
        : createMockMessage('ai', `Assistant response ${i}`)
    );
  }
  return messages;
}
