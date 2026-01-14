import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { Message } from '@langchain/langgraph-sdk';
import type { ToolProgressEvent } from '../providers/StreamProvider';

// Mock localStorage for jsdom environment
const localStorageMock = {
  getItem: ((key: string): string | null => {
    if (key === 'bernard-chat-sidebar-open') {
      return '"true"'; // Return valid JSON string: "true"
    }
    return null;
  }),
  setItem: ((): void => {
    // No-op for testing
  }),
  removeItem: ((): void => {
    // No-op for testing
  }),
  clear: ((): void => {
    // No-op for testing
  }),
  get length() { return 0; },
  key: ((): null => null),
};

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Define the mock context type
interface MockStreamContextType {
  messages: Message[];
  submit: ReturnType<typeof vi.fn>;
  isLoading: boolean;
  stop: ReturnType<typeof vi.fn>;
  latestProgress: ToolProgressEvent | null;
  getMessagesMetadata: (message: Message) => {
    branch?: string;
    branchOptions?: string[];
    firstSeenState?: { parent_checkpoint?: { thread_id: string; checkpoint_ns: string; checkpoint_id: string; checkpoint_map: Record<string, unknown> } };
  };
  setBranch: ReturnType<typeof vi.fn>;
  resetProgress: ReturnType<typeof vi.fn>;
}

// Create a default mock context
const createDefaultMockContext = (): MockStreamContextType => ({
  messages: [],
  submit: vi.fn(),
  isLoading: false,
  stop: vi.fn(),
  latestProgress: null,
  getMessagesMetadata: () => ({}),
  setBranch: vi.fn(),
  resetProgress: vi.fn(),
});

// Mutable mock context container
const mockContextContainer: { current: MockStreamContextType } = { current: createDefaultMockContext() };

afterEach(() => {
  cleanup();
  // Reset mock context to default for each test
  mockContextContainer.current = createDefaultMockContext();
});

// Export helper to update mock context in tests
export const updateMockContext = (updates: Partial<MockStreamContextType>) => {
  Object.assign(mockContextContainer.current, updates);
};

export const mockStreamContextContainer = mockContextContainer;
export type { MockStreamContextType };
