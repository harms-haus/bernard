import { createContext, useContext, ReactNode, useMemo } from 'react';
import type { Message, Checkpoint } from '@langchain/langgraph-sdk';
import type { ToolProgressEvent } from '@/providers/StreamProvider';
import { vi, type Mock } from 'vitest';

export interface MockStreamContextType {
  messages: Message[];
  submit: Mock;
  isLoading: boolean;
  stop: Mock;
  latestProgress: ToolProgressEvent | null;
  getMessagesMetadata: (message: Message) => {
    branch?: string;
    branchOptions?: string[];
    firstSeenState?: { parent_checkpoint?: Checkpoint };
  };
  setBranch: Mock;
  resetProgress: Mock;
}

const MockStreamContext = createContext<MockStreamContextType | undefined>(undefined);

const mockStreamContextContainer: { current: MockStreamContextType } = {
  current: {
    messages: [],
    submit: vi.fn(),
    isLoading: false,
    stop: vi.fn(),
    latestProgress: null,
    getMessagesMetadata: () => ({}),
    setBranch: vi.fn(),
    resetProgress: vi.fn(),
  },
};

export { mockStreamContextContainer };

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

export function MockStreamProvider({ 
  children, 
  value = createMockStreamContext() 
}: { 
  children: ReactNode;
  value?: MockStreamContextType;
}) {
  const contextValue = useMemo(() => value, [value]);
  return (
    <MockStreamContext.Provider value={contextValue}>
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

// Helper to create a human message for testing
let messageIdCounter = 0;

export function createMockHumanMessage(content: string = 'Test message', id?: string): Message {
  return {
    id: id ?? `msg-human-${++messageIdCounter}`,
    type: 'human',
    content,
  };
}

// Helper to create an assistant message for testing
export function createMockAssistantMessage(content: string = 'Test response', id?: string): Message {
  return {
    id: id ?? `msg-ai-${++messageIdCounter}`,
    type: 'ai',
    content,
  };
}

// Optional: Reset counter between test suites if needed
export function resetMessageIdCounter(): void {
  messageIdCounter = 0;
}

// Helper to create a sequence of messages for testing
export function createMockMessageThread(length: number = 3): Message[] {
  const messages: Message[] = [];
  for (let i = 0; i < length; i++) {
    messages.push(
      i % 2 === 0 
        ? createMockHumanMessage(`User message ${i}`)
        : createMockAssistantMessage(`Assistant response ${i}`)
    );
  }
  return messages;
}
