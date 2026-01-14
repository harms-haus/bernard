import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAutoRename } from './useAutoRename';
import { useChatInput } from './useChatInput';
import type { Message } from '@langchain/langgraph-sdk';

describe('useAutoRename', () => {
  let mockAutoRename: Mock;
  let onRenameComplete: Mock;

  beforeEach(() => {
    mockAutoRename = vi.fn().mockResolvedValue({ success: true, threadId: '1', name: 'New Name' });
    onRenameComplete = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return false for hasTriggeredAutoRename initially', () => {
    const { result } = renderHook(() => useAutoRename({
      threadId: 'thread-1',
      messages: [],
      apiClient: { autoRenameThread: mockAutoRename } as any,
      onRenameComplete,
    }));

    expect(result.current.hasTriggeredAutoRename).toBe(false);
    expect(result.current.isAutoRenaming).toBe(false);
  });

  it('should not trigger when threadId is null', () => {
    const messages: Message[] = [
      { id: '1', type: 'human', content: 'Hello' },
      { id: '2', type: 'ai', content: 'Hi there!' },
    ];

    renderHook(() => useAutoRename({
      threadId: null,
      messages,
      apiClient: { autoRenameThread: mockAutoRename } as any,
      onRenameComplete,
    }));

    expect(mockAutoRename).not.toHaveBeenCalled();
  });

  it('should not trigger when there are not exactly 2 messages', () => {
    const messages: Message[] = [
      { id: '1', type: 'human', content: 'Hello' },
    ];

    renderHook(() => useAutoRename({
      threadId: 'thread-1',
      messages,
      apiClient: { autoRenameThread: mockAutoRename } as any,
      onRenameComplete,
    }));

    expect(mockAutoRename).not.toHaveBeenCalled();
  });

  it('should handle API errors gracefully', async () => {
    mockAutoRename.mockRejectedValue(new Error('API Error'));
    
    const messages: Message[] = [
      { id: '1', type: 'human', content: 'Hello' },
      { id: '2', type: 'ai', content: 'Hi there!' },
    ];

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useAutoRename({
      threadId: 'thread-1',
      messages,
      apiClient: { autoRenameThread: mockAutoRename } as any,
      onRenameComplete,
    }));

    await waitFor(() => {
      expect(result.current.isAutoRenaming).toBe(false);
    });

    expect(consoleError).toHaveBeenCalledWith('Auto-rename failed:', expect.any(Error));
    expect(onRenameComplete).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });
});

describe('useChatInput', () => {
  let onSubmit: Mock;

  beforeEach(() => {
    onSubmit = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty input initially', () => {
    const { result } = renderHook(() => useChatInput({
      onSubmit,
      isLoading: false,
    }));

    expect(result.current.input).toBe('');
    expect(result.current.canSubmit).toBe(false);
  });

  it('should update input on setInput', () => {
    const { result } = renderHook(() => useChatInput({
      onSubmit,
      isLoading: false,
    }));

    act(() => {
      result.current.setInput('Hello, world!');
    });

    expect(result.current.input).toBe('Hello, world!');
  });

  it('should allow submission when input is not empty and not loading', () => {
    const { result } = renderHook(() => useChatInput({
      onSubmit,
      isLoading: false,
    }));

    act(() => {
      result.current.setInput('Hello!');
    });

    expect(result.current.canSubmit).toBe(true);
  });

  it('should not allow submission when loading', () => {
    const { result } = renderHook(() => useChatInput({
      onSubmit,
      isLoading: true,
    }));

    act(() => {
      result.current.setInput('Hello!');
    });

    expect(result.current.canSubmit).toBe(false);
  });

  it('should not allow submission when input is empty', () => {
    const { result } = renderHook(() => useChatInput({
      onSubmit,
      isLoading: false,
    }));

    expect(result.current.canSubmit).toBe(false);
  });

  it('should not allow submission when input is only whitespace', () => {
    const { result } = renderHook(() => useChatInput({
      onSubmit,
      isLoading: false,
    }));

    act(() => {
      result.current.setInput('   ');
    });

    expect(result.current.canSubmit).toBe(false);
  });

  it('should call onSubmit with new message on handleSubmit', () => {
    const { result } = renderHook(() => useChatInput({
      onSubmit,
      isLoading: false,
    }));

    act(() => {
      result.current.setInput('Test message');
    });

    act(() => {
      result.current.handleSubmit({ preventDefault: () => {} } as React.FormEvent);
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submittedMessage = onSubmit.mock.calls[0][0] as Message;
    expect(submittedMessage.type).toBe('human');
    expect(submittedMessage.content).toBe('Test message');
    expect(submittedMessage.id).toBeDefined();
  });

  it('should clear input after submission', () => {
    const { result } = renderHook(() => useChatInput({
      onSubmit,
      isLoading: false,
    }));

    act(() => {
      result.current.setInput('Test message');
    });

    act(() => {
      result.current.handleSubmit({ preventDefault: () => {} } as React.FormEvent);
    });

    expect(result.current.input).toBe('');
  });

  it('should use custom uuidGenerator when provided', () => {
    const customUUID = 'custom-uuid-123';
    const uuidGenerator = vi.fn().mockReturnValue(customUUID);

    const { result } = renderHook(() => useChatInput({
      onSubmit,
      isLoading: false,
      uuidGenerator,
    }));

    act(() => {
      result.current.setInput('Test');
    });

    act(() => {
      result.current.handleSubmit({ preventDefault: () => {} } as React.FormEvent);
    });

    expect(uuidGenerator).toHaveBeenCalled();
    const submittedMessage = onSubmit.mock.calls[0][0] as Message;
    expect(submittedMessage.id).toBe(customUUID);
  });
});
