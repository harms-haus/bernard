// core/src/hooks/useChatInput.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useChatInput } from './useChatInput';

describe('useChatInput', () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Form Submission', () => {
    it('should call form.requestSubmit on Enter key', () => {
      const mockRequestSubmit = vi.fn();
      const mockEvent = {
        key: 'Enter',
        preventDefault: vi.fn(),
        currentTarget: { form: { requestSubmit: mockRequestSubmit } },
        shiftKey: false,
        metaKey: false,
        nativeEvent: { isComposing: false },
      };

      const { result } = renderHook(() =>
        useChatInput({ onSubmit: mockOnSubmit, isLoading: false })
      );

      act(() => {
        result.current.setInput('Hello!');
      });

      result.current.handleKeyDown(mockEvent as any);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockRequestSubmit).toHaveBeenCalled();
    });

    it('should handle form without requestSubmit', () => {
      const mockEvent = {
        key: 'Enter',
        preventDefault: vi.fn(),
        currentTarget: { form: null },
        shiftKey: false,
        metaKey: false,
        nativeEvent: { isComposing: false },
      };

      const { result } = renderHook(() =>
        useChatInput({ onSubmit: mockOnSubmit, isLoading: false })
      );

      act(() => {
        result.current.setInput('Hello!');
      });

      expect(() => result.current.handleKeyDown(mockEvent as any)).not.toThrow();
    });
  });

  describe('canSubmit with Whitespace', () => {
    it('should be false with only whitespace input', () => {
      const { result } = renderHook(() =>
        useChatInput({ onSubmit: mockOnSubmit, isLoading: false })
      );

      act(() => {
        result.current.setInput('   ');
      });

      expect(result.current.canSubmit).toBe(false);
    });

    it('should be true with mixed whitespace and text', () => {
      const { result } = renderHook(() =>
        useChatInput({ onSubmit: mockOnSubmit, isLoading: false })
      );

      act(() => {
        result.current.setInput('  Hello  ');
      });

      expect(result.current.canSubmit).toBe(true);
    });
  });

  describe('Default UUID Generator', () => {
    it('should use uuidv4 when not provided', () => {
      const { result } = renderHook(() =>
        useChatInput({ onSubmit: mockOnSubmit, isLoading: false })
      );

      act(() => {
        result.current.setInput('Hello!');
      });

      act(() => {
        result.current.handleSubmit();
      });

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          ),
        })
      );
    });
  });
});
