// core/src/hooks/useConfirmDialogPromise.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConfirmDialogPromise } from './useConfirmDialogPromise';

const mockConfirmDialog = vi.fn();

vi.mock('@/components/DialogManager', () => ({
  useConfirmDialog: () => mockConfirmDialog,
}));

describe('useConfirmDialogPromise', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Double Resolution Prevention', () => {
    it('should only resolve once even if confirm called multiple times', async () => {
      let closeFn: () => void;
      mockConfirmDialog.mockImplementation((options: any) => {
        closeFn = options.onConfirm;
        return () => {};
      });

      const { result } = renderHook(() => useConfirmDialogPromise());

      const promise = result.current({
        title: 'Test Dialog',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
      });

      // Call confirm multiple times
      act(() => {
        closeFn?.();
        closeFn?.();
        closeFn?.();
      });

      const resolved = await promise;
      expect(resolved).toBe(true);
    });
  });

  describe('Timeout Behavior', () => {
    it('should resolve to false after 30 second timeout', async () => {
      mockConfirmDialog.mockImplementation(() => () => {});

      vi.useFakeTimers();

      const { result } = renderHook(() => useConfirmDialogPromise());

      const promise = result.current({
        title: 'Test Dialog',
      });

      // Advance timers past 30 seconds
      act(() => {
        vi.advanceTimersByTime(30001);
      });

      const resolved = await promise;
      expect(resolved).toBe(false);

      vi.useRealTimers();
    });
  });
});
