import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  DialogManagerProvider,
  useDialogManager,
  useConfirmDialog,
  useAlertDialog,
} from './DialogManager';

// ============================================
// TEST COMPONENTS
// ============================================
function TestDialogConsumer() {
  const { openDialog, closeDialog, closeAllDialogs } = useDialogManager();
  return (
    <div>
      <button
        data-testid="open-alert"
        onClick={() =>
          openDialog({ type: 'alert', title: 'Alert Title' })
        }
      >
        Open Alert
      </button>
      <button
        data-testid="open-confirm"
        onClick={() =>
          openDialog({
            type: 'confirm',
            title: 'Confirm?',
            onConfirm: vi.fn(),
          })
        }
      >
        Open Confirm
      </button>
      <button data-testid="close-dialog" onClick={() => closeDialog('test-id')}>
        Close Dialog
      </button>
      <button data-testid="close-all" onClick={() => closeAllDialogs()}>
        Close All
      </button>
    </div>
  );
}

// ============================================
// TEST SUITE
// ============================================
describe('DialogManager', () => {
  describe('DialogManagerProvider', () => {
    it('renders children without errors', () => {
      render(
        <DialogManagerProvider>
          <div data-testid="children">Child Content</div>
        </DialogManagerProvider>
      );

      expect(screen.getByTestId('children')).toBeInTheDocument();
    });

    it('provides dialog context to consumers', () => {
      render(
        <DialogManagerProvider>
          <TestDialogConsumer />
        </DialogManagerProvider>
      );

      expect(screen.getByTestId('open-alert')).toBeInTheDocument();
      expect(screen.getByTestId('open-confirm')).toBeInTheDocument();
      expect(screen.getByTestId('close-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('close-all')).toBeInTheDocument();
    });
  });

  describe('useDialogManager', () => {
    it('openDialog function exists and is callable', () => {
      let capturedOpenDialog: ReturnType<typeof useDialogManager>['openDialog'] | null = null;

      function CaptureConsumer() {
        const { openDialog } = useDialogManager();
        capturedOpenDialog = openDialog;
        return null;
      }

      render(
        <DialogManagerProvider>
          <CaptureConsumer />
        </DialogManagerProvider>
      );

      expect(capturedOpenDialog).toBeDefined();
      expect(typeof capturedOpenDialog).toBe('function');
    });

    it('closeDialog function exists and is callable', () => {
      let capturedCloseDialog: ReturnType<typeof useDialogManager>['closeDialog'] | null = null;

      function CaptureConsumer() {
        const { closeDialog } = useDialogManager();
        capturedCloseDialog = closeDialog;
        return null;
      }

      render(
        <DialogManagerProvider>
          <CaptureConsumer />
        </DialogManagerProvider>
      );

      expect(capturedCloseDialog).toBeDefined();
      expect(typeof capturedCloseDialog).toBe('function');
    });

    it('closeAllDialogs function exists and is callable', () => {
      let capturedCloseAll: ReturnType<typeof useDialogManager>['closeAllDialogs'] | null = null;

      function CaptureConsumer() {
        const { closeAllDialogs } = useDialogManager();
        capturedCloseAll = closeAllDialogs;
        return null;
      }

      render(
        <DialogManagerProvider>
          <CaptureConsumer />
        </DialogManagerProvider>
      );

      expect(capturedCloseAll).toBeDefined();
      expect(typeof capturedCloseAll).toBe('function');
    });
  });

  describe('useConfirmDialog', () => {
    it('returns a function', () => {
      let capturedUseConfirm: ReturnType<typeof useConfirmDialog> | null = null;

      function CaptureConsumer() {
        capturedUseConfirm = useConfirmDialog();
        return null;
      }

      render(
        <DialogManagerProvider>
          <CaptureConsumer />
        </DialogManagerProvider>
      );

      expect(capturedUseConfirm).toBeDefined();
      expect(typeof capturedUseConfirm).toBe('function');
    });
  });

  describe('useAlertDialog', () => {
    it('returns a function', () => {
      let capturedUseAlert: ReturnType<typeof useAlertDialog> | null = null;

      function CaptureConsumer() {
        capturedUseAlert = useAlertDialog();
        return null;
      }

      render(
        <DialogManagerProvider>
          <CaptureConsumer />
        </DialogManagerProvider>
      );

      expect(capturedUseAlert).toBeDefined();
      expect(typeof capturedUseAlert).toBe('function');
    });
  });

  describe('Context Error Handling', () => {
    it('throws error when useDialogManager used outside provider', () => {
      const BadComponent = () => {
        useDialogManager();
        return null;
      };

      expect(() => render(<BadComponent />)).toThrow(
        'useDialogManager must be used within a DialogManagerProvider'
      );
    });
  });
});
