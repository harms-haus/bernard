// core/src/hooks/useAssistantMessageData.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Message } from '@langchain/langgraph-sdk';

vi.mock('@/providers/StreamProvider', async () => {
  const actual = await vi.importActual('@/providers/StreamProvider');
  return {
    ...actual,
    useStreamContext: vi.fn(() => ({
      getMessagesMetadata: vi.fn().mockReturnValue({}),
    })),
  };
});

import { useAssistantMessageData } from './useAssistantMessageData';
import { useStreamContext } from '@/providers/StreamProvider';

describe('useAssistantMessageData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Meta Branch Extraction', () => {
    it('should extract branch from metadata', () => {
      vi.mocked(useStreamContext).mockReturnValue({
        getMessagesMetadata: vi.fn().mockReturnValue({
          branch: 'feature-branch',
          branchOptions: ['main', 'feature-branch', 'experimental'],
        }),
      } as any);

      const message = {
        content: 'Hello',
        role: 'assistant',
        id: 'msg-1',
        type: 'ai',
      } as unknown as Message;

      const { result } = renderHook(() =>
        useAssistantMessageData(message)
      );

      expect(result.current.meta.branch).toBe('feature-branch');
    });

    it('should extract branchOptions from metadata', () => {
      vi.mocked(useStreamContext).mockReturnValue({
        getMessagesMetadata: vi.fn().mockReturnValue({
          branch: 'feature-branch',
          branchOptions: ['main', 'feature-branch', 'experimental'],
        }),
      } as any);

      const message = {
        content: 'Hello',
        role: 'assistant',
        id: 'msg-1',
        type: 'ai',
      } as unknown as Message;

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
        type: 'ai',
      } as unknown as Message;

      const { result } = renderHook(() =>
        useAssistantMessageData(message)
      );

      expect(result.current.meta.parentCheckpoint).toBe(mockCheckpoint);
    });
  });

  describe('toolResults', () => {
    it('should filter nextMessages by tool_call_id', () => {
      const message = {
        content: 'Let me search for that',
        role: 'assistant',
        type: 'ai',
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'search', arguments: '{}' } }],
        id: 'msg-1',
      } as unknown as Message;

      const nextMessages: Message[] = [
        { id: 'tool-1', type: 'tool', content: 'Search results', tool_call_id: 'call-1' } as unknown as Message,
        { id: 'tool-2', type: 'tool', content: 'Unrelated', tool_call_id: 'call-2' } as unknown as Message,
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
        type: 'ai',
      } as unknown as Message;

      const { result } = renderHook(() =>
        useAssistantMessageData(message, [])
      );

      expect(result.current.toolResults).toEqual([]);
    });
  });

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
        type: 'ai',
      } as unknown as Message;

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
        type: 'ai',
      } as unknown as Message;

      const { result } = renderHook(() =>
        useAssistantMessageData(message)
      );

      expect(result.current.contentString).toBe('{"custom":{"nested":"object"}}');
    });
  });

  describe('hasBranches', () => {
    it('should be true when branchOptions.length > 1', () => {
      vi.mocked(useStreamContext).mockReturnValue({
        getMessagesMetadata: vi.fn().mockReturnValue({
          branchOptions: ['main', 'branch-1', 'branch-2'],
        }),
      } as any);

      const message = { content: 'Hello', role: 'assistant', id: 'msg-1', type: 'ai' } as unknown as Message;

      const { result } = renderHook(() => useAssistantMessageData(message));

      expect(result.current.hasBranches).toBe(true);
    });

    it('should be false when only one branch option', () => {
      vi.mocked(useStreamContext).mockReturnValue({
        getMessagesMetadata: vi.fn().mockReturnValue({
          branchOptions: ['main'],
        }),
      } as any);

      const message = { content: 'Hello', role: 'assistant', id: 'msg-1', type: 'ai' } as unknown as Message;

      const { result } = renderHook(() => useAssistantMessageData(message));

      expect(result.current.hasBranches).toBe(false);
    });
  });

  describe('toolCallsHaveContents', () => {
    it('should be true when tool calls have args', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message: any = {
        content: 'Searching...',
        role: 'assistant',
        type: 'ai',
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'search', arguments: '{"query":"test"}' } }],
        id: 'msg-1',
      };

      const { result } = renderHook(() => useAssistantMessageData(message));

      expect(result.current.toolCallsHaveContents).toBe(true);
    });

    it('should be false when tool calls have empty args', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message: any = {
        content: 'Searching...',
        role: 'assistant',
        type: 'ai',
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'search', arguments: '{}' } }],
        id: 'msg-1',
      };

      const { result } = renderHook(() =>
        useAssistantMessageData(message)
      );

      expect(result.current.toolCallsHaveContents).toBe(false);
    });
  });
});
