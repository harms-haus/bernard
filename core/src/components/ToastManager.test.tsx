import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ToastManagerProvider,
  useToastManager,
  useToast,
  ToastVariant,
} from './ToastManager';

// ============================================
// TEST COMPONENTS
// ============================================
function TestConsumer() {
  const { showToast, hideToast, clearToasts } = useToastManager();
  return (
    <div>
      <button
        data-testid="show-button"
        onClick={() => {
          showToast({ title: 'Test Toast', variant: 'default' });
        }}
      >
        Show Toast
      </button>
      <button data-testid="hide-button" onClick={() => hideToast('test-id')}>
        Hide Toast
      </button>
      <button data-testid="clear-button" onClick={clearToasts}>
        Clear All
      </button>
    </div>
  );
}

function TestToastHookConsumer() {
  const { success, error, warning, info } = useToast();
  return (
    <div>
      <button data-testid="success-button" onClick={() => success('Success!')}>
        Success
      </button>
      <button data-testid="error-button" onClick={() => error('Error!')}>
        Error
      </button>
      <button data-testid="warning-button" onClick={() => warning('Warning!')}>
        Warning
      </button>
      <button data-testid="info-button" onClick={() => info('Info!')}>
        Info
      </button>
    </div>
  );
}

// ============================================
// TEST SUITE
// ============================================
describe('ToastManager', () => {
  describe('ToastManagerProvider', () => {
    it('renders children without errors', () => {
      render(
        <ToastManagerProvider>
          <div data-testid="children">Child Content</div>
        </ToastManagerProvider>
      );

      expect(screen.getByTestId('children')).toBeInTheDocument();
    });

    it('provides toast context to consumers', () => {
      render(
        <ToastManagerProvider>
          <TestConsumer />
        </ToastManagerProvider>
      );

      expect(screen.getByTestId('show-button')).toBeInTheDocument();
      expect(screen.getByTestId('hide-button')).toBeInTheDocument();
      expect(screen.getByTestId('clear-button')).toBeInTheDocument();
    });
  });

  describe('useToastManager', () => {
    it('showToast function exists and is callable', () => {
      let capturedShowToast: typeof useToastManager extends () => { showToast: infer T } ? T : never = null as any;

      function CaptureConsumer() {
        const { showToast } = useToastManager();
        capturedShowToast = showToast;
        return null;
      }

      render(
        <ToastManagerProvider>
          <CaptureConsumer />
        </ToastManagerProvider>
      );

      expect(capturedShowToast).toBeDefined();
      expect(typeof capturedShowToast).toBe('function');
    });

    it('hideToast function exists and is callable', () => {
      let capturedHideToast: typeof useToastManager extends () => { hideToast: infer T } ? T : never = null as any;

      function CaptureConsumer() {
        const { hideToast } = useToastManager();
        capturedHideToast = hideToast;
        return null;
      }

      render(
        <ToastManagerProvider>
          <CaptureConsumer />
        </ToastManagerProvider>
      );

      expect(capturedHideToast).toBeDefined();
      expect(typeof capturedHideToast).toBe('function');
    });

    it('clearToasts function exists and is callable', () => {
      let capturedClearToasts: typeof useToastManager extends () => { clearToasts: infer T } ? T : never = null as any;

      function CaptureConsumer() {
        const { clearToasts } = useToastManager();
        capturedClearToasts = clearToasts;
        return null;
      }

      render(
        <ToastManagerProvider>
          <CaptureConsumer />
        </ToastManagerProvider>
      );

      expect(capturedClearToasts).toBeDefined();
      expect(typeof capturedClearToasts).toBe('function');
    });
  });

  describe('useToast convenience methods', () => {
    it('success function exists', () => {
      let capturedSuccess: ReturnType<typeof useToast>['success'] = null as any;

      function CaptureConsumer() {
        const { success } = useToast();
        capturedSuccess = success;
        return null;
      }

      render(
        <ToastManagerProvider>
          <CaptureConsumer />
        </ToastManagerProvider>
      );

      expect(capturedSuccess).toBeDefined();
      expect(typeof capturedSuccess).toBe('function');
    });

    it('error function exists', () => {
      let capturedError: ReturnType<typeof useToast>['error'] = null as any;

      function CaptureConsumer() {
        const { error } = useToast();
        capturedError = error;
        return null;
      }

      render(
        <ToastManagerProvider>
          <CaptureConsumer />
        </ToastManagerProvider>
      );

      expect(capturedError).toBeDefined();
      expect(typeof capturedError).toBe('function');
    });

    it('warning function exists', () => {
      let capturedWarning: ReturnType<typeof useToast>['warning'] = null as any;

      function CaptureConsumer() {
        const { warning } = useToast();
        capturedWarning = warning;
        return null;
      }

      render(
        <ToastManagerProvider>
          <CaptureConsumer />
        </ToastManagerProvider>
      );

      expect(capturedWarning).toBeDefined();
      expect(typeof capturedWarning).toBe('function');
    });

    it('info function exists', () => {
      let capturedInfo: ReturnType<typeof useToast>['info'] = null as any;

      function CaptureConsumer() {
        const { info } = useToast();
        capturedInfo = info;
        return null;
      }

      render(
        <ToastManagerProvider>
          <CaptureConsumer />
        </ToastManagerProvider>
      );

      expect(capturedInfo).toBeDefined();
      expect(typeof capturedInfo).toBe('function');
    });
  });

  describe('Context Error Handling', () => {
    it('throws error when useToastManager used outside provider', () => {
      const BadComponent = () => {
        useToastManager();
        return null;
      };

      expect(() => render(<BadComponent />)).toThrow(
        'useToastManager must be used within a ToastManagerProvider'
      );
    });

    it('throws error when useToast used outside provider', () => {
      const BadComponent = () => {
        useToast();
        return null;
      };

      expect(() => render(<BadComponent />)).toThrow(
        'useToastManager must be used within a ToastManagerProvider'
      );
    });
  });
});
