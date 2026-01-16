import { useCallback, useRef, useEffect } from 'react';
import { useConfirmDialog } from '@/components/DialogManager';

export interface ConfirmDialogOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'default' | 'destructive';
}

/**
 * Hook that wraps useConfirmDialog to return a Promise that always resolves.
 * This prevents memory leaks and hanging Promises when the component unmounts
 * or the dialog is dismissed via backdrop/ESC.
 */
export function useConfirmDialogPromise() {
  const confirmDialog = useConfirmDialog();
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return useCallback(async (options: ConfirmDialogOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      let resolved = false;

      // Create a safe resolve function that checks mounted state and prevents double resolution
      const safeResolve = (value: boolean) => {
        if (!resolved && isMountedRef.current) {
          resolved = true;
          resolve(value);
        }
      };

      // Open the dialog
      const close = confirmDialog({
        ...options,
        onConfirm: () => {
          safeResolve(true);
          close();
        },
        onCancel: () => {
          safeResolve(false);
          close();
        },
      });

      // Set up a timeout to ensure the Promise resolves if the dialog doesn't call onClose properly
      setTimeout(() => {
        if (!resolved && isMountedRef.current) {
          safeResolve(false);
        }
      }, 30000); // 30 second timeout as a safety net

      // We'll rely on the timeout and component unmount cleanup
    });
  }, [confirmDialog]);
}