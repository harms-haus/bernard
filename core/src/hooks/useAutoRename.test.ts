// core/src/hooks/useAutoRename.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Message } from '@langchain/langgraph-sdk';

vi.mock('@/lib/api/client', async () => {
  const actual = await vi.importActual('@/lib/api/client');
  return {
    ...actual,
    getAPIClient: vi.fn(() => ({
      autoRenameThread: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

import { useAutoRename } from './useAutoRename';
import { getAPIClient } from '@/lib/api/client';

describe('useAutoRename', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Error Handling', () => {
    it('should handle API error gracefully', async () => {
      const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockApiClient = {
        autoRenameThread: vi.fn().mockRejectedValue(new Error('API Error')),
      };

      vi.mocked(getAPIClient).mockReturnValue(mockApiClient as any);

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

      expect(result.current.isAutoRenaming).toBe(false);
    });

    it('should invoke onRenameComplete callback on success', async () => {
      const mockOnRenameComplete = vi.fn();
      const mockApiClient = {
        autoRenameThread: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(getAPIClient).mockReturnValue(mockApiClient as any);

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

  describe('Content Handling', () => {
    it('should JSON.stringify array content', async () => {
      const mockApiClient = {
        autoRenameThread: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(getAPIClient).mockReturnValue(mockApiClient as any);

      const messages: Message[] = [
        {
          id: '1',
          type: 'human',
          content: [{ type: 'text', text: 'Complex' }, { type: 'text', text: 'Message' }] as any,
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

      vi.mocked(getAPIClient).mockReturnValue(mockApiClient as any);

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

  describe('Manual Trigger', () => {
    it('should expose triggerAutoRename function', async () => {
      const mockApiClient = {
        autoRenameThread: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(getAPIClient).mockReturnValue(mockApiClient as any);

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

      expect(result.current.triggerAutoRename()).toBeUndefined();
    });
  });
});
