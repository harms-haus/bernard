import { vi } from 'vitest';
import type { Message } from '@langchain/langgraph-sdk';

export interface MockStreamContextType {
  messages: Message[];
  submit: (values: { messages: Message[] }, options?: any) => void;
  isLoading: boolean;
  stop: () => void;
  latestProgress: {
    type: 'progress' | 'step' | 'complete' | 'error';
    tool: string;
    message: string;
    data?: Record<string, unknown>;
    timestamp: number;
  } | null;
  getMessagesMetadata: (message: Message) => {
    branch?: string;
    branchOptions?: string[];
    firstSeenState?: { parent_checkpoint?: any };
  };
  setBranch: (branch: string) => void;
  resetProgress: () => void;
}

export const streamContextContainer = {
  current: createDefaultStreamContext() as MockStreamContextType,
};

export function createDefaultStreamContext(): MockStreamContextType {
  return {
    messages: [],
    submit: vi.fn(),
    isLoading: false,
    stop: vi.fn(),
    latestProgress: null,
    getMessagesMetadata: () => ({}),
    setBranch: vi.fn(),
    resetProgress: vi.fn(),
  };
}

export function createMockStreamContext(overrides: Partial<MockStreamContextType> = {}): MockStreamContextType {
  return {
    messages: [],
    submit: vi.fn(),
    isLoading: false,
    stop: vi.fn(),
    latestProgress: null,
    getMessagesMetadata: () => ({}),
    setBranch: vi.fn(),
    resetProgress: vi.fn(),
    ...overrides,
  };
}

export function createMockMessage(type: 'human' | 'ai' | 'tool', content: string, id?: string): Message {
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
