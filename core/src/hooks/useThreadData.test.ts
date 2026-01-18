// core/src/hooks/useThreadData.test.ts
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Message } from '@langchain/langgraph-sdk';
import type { Checkpoint } from '@langchain/langgraph-sdk';

// Set up global browser mocks BEFORE any imports
beforeAll(() => {
  // Mock navigator.clipboard
  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });

  // Mock URL.createObjectURL and revokeObjectURL
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn().mockReturnValue('blob:test'),
    revokeObjectURL: vi.fn().mockReturnValue(undefined),
  });
});

// Mock document.createElement for anchor element creation
// Using vi.spyOn in individual tests instead of vi.mock at module level
// to avoid overriding the global document object which breaks renderHook

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual('next/navigation');
  return {
    ...actual,
    useSearchParams: vi.fn(() => ({
      get: vi.fn().mockReturnValue('thread-123'),
    })),
    useRouter: vi.fn(() => ({
      replace: vi.fn(),
    })),
  };
});

vi.mock('@/providers/StreamProvider', async () => {
  const actual = await vi.importActual('@/providers/StreamProvider');
  return {
    ...actual,
    useStreamContext: vi.fn(() => ({
      messages: [],
      submit: vi.fn(),
      isLoading: false,
      latestProgress: null,
    })),
  };
});

vi.mock('@/hooks/useDarkMode', () => ({
  useDarkMode: vi.fn(() => ({
    isDarkMode: false,
    toggleDarkMode: vi.fn(),
  })),
}));

vi.mock('@/providers/ThreadProvider', () => ({
  useThreads: vi.fn(() => ({
    getThreads: vi.fn(),
  })),
}));

vi.mock('@/lib/api/client', () => ({
  getAPIClient: vi.fn(() => ({
    autoRenameThread: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Import after mocking
import { useThreadData } from './useThreadData';
import { useStreamContext } from '@/providers/StreamProvider';
import { useDarkMode } from '@/hooks/useDarkMode';
import { useThreads } from '@/providers/ThreadProvider';
import { getAPIClient } from '@/lib/api/client';
import { useRouter, useSearchParams } from 'next/navigation';

describe('useThreadData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleSubmit', () => {
    it('should create human message and call submit', () => {
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

  describe('handleNewChat', () => {
    it('should navigate to /bernard/chat', () => {
      const mockReplace = vi.fn();
      vi.mocked(useRouter).mockReturnValue({
        replace: mockReplace,
      } as any);
      vi.mocked(useSearchParams).mockReturnValue({
        get: vi.fn().mockReturnValue('thread-123'),
      } as any);

      const { result } = renderHook(() => useThreadData());

      result.current.handleNewChat();

      expect(mockReplace).toHaveBeenCalledWith('/bernard/chat');
    });
  });

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

      const mockCheckpoint = { id: 'checkpoint-123' } as unknown as Checkpoint;
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

  describe('handleCopyChatHistory', () => {
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
          content: [{ type: 'text', text: 'Complex' }] as any,
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

  describe('handleDownloadChatHistory', () => {
    it('should create and trigger download', async () => {
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

      // Call the function synchronously
      act(() => {
        result.current.handleDownloadChatHistory();
      });

      // In jsdom, the anchor element should have been created and clicked
      // We verify the behavior by checking that the URL was created and revoked
      // The actual DOM manipulation happens in jsdom which doesn't throw
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalled();
    });
  });

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

  describe('Auto-Rename Effect', () => {
    it('should call autoRenameThread when messages.length === 2', async () => {
      const mockAutoRenameThread = vi.fn().mockResolvedValue(undefined);
      const mockGetThreads = vi.fn();

      vi.mocked(getAPIClient).mockReturnValue({
        autoRenameThread: mockAutoRenameThread,
      } as any);

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

      renderHook(() => useThreadData());

      // Wait for async auto-rename to complete
      await Promise.resolve();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockAutoRenameThread).toHaveBeenCalledWith('thread-123', 'First message');
      expect(mockGetThreads).toHaveBeenCalled();
    });

    it('should NOT auto-rename when messages.length !== 2', () => {
      const mockAutoRenameThread = vi.fn();

      vi.mocked(getAPIClient).mockReturnValue({
        autoRenameThread: mockAutoRenameThread,
      } as any);

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

  describe('Input Clearing', () => {
    it('should clear input when threadId changes', () => {
      const messages: Message[] = [];
      vi.mocked(useStreamContext).mockReturnValue({
        messages,
        submit: vi.fn(),
        isLoading: false,
        latestProgress: null,
      } as any);

      // First render with thread-1
      const mockSearchParams = {
        get: vi.fn().mockReturnValue('thread-1'),
      };
      vi.mocked(useSearchParams).mockReturnValue(mockSearchParams as any);
      vi.mocked(useRouter).mockReturnValue({
        replace: vi.fn(),
      } as any);

      const { result, rerender } = renderHook(() => useThreadData());

      act(() => {
        result.current.setInput('Some input');
      });
      expect(result.current.input).toBe('Some input');

      // Change threadId by updating mock
      mockSearchParams.get.mockReturnValue('thread-2');
      rerender();

      // The input should clear when threadId changes in the hook's useEffect
      expect(result.current.input).toBe('');
    });
  });

  describe('Auto-Rename Reset', () => {
    it('should reset hasTriggeredAutoRename when threadId changes', async () => {
      const mockAutoRenameThread = vi.fn().mockResolvedValue(undefined);
      const mockGetThreads = vi.fn();

      vi.mocked(getAPIClient).mockReturnValue({
        autoRenameThread: mockAutoRenameThread,
      } as any);

      vi.mocked(useThreads).mockReturnValue({
        getThreads: mockGetThreads,
      } as any);

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

      // First render with thread-1
      const mockSearchParams = {
        get: vi.fn().mockReturnValue('thread-1'),
      };
      vi.mocked(useSearchParams).mockReturnValue(mockSearchParams as any);
      vi.mocked(useRouter).mockReturnValue({
        replace: vi.fn(),
      } as any);

      const { rerender } = renderHook(() => useThreadData());

      // Wait for async auto-rename to complete
      await Promise.resolve();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockAutoRenameThread).toHaveBeenCalledTimes(1);

      // Change threadId and rerender
      mockSearchParams.get.mockReturnValue('thread-2');
      rerender();

      // Wait for async auto-rename to complete again
      await Promise.resolve();
      await new Promise(resolve => setTimeout(resolve, 10));

      // Auto-rename should trigger again for new thread
      expect(mockAutoRenameThread).toHaveBeenCalledTimes(2);
    });
  });
});
