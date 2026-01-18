// core/src/hooks/useHealthStream.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Mock EventSource globally
global.EventSource = vi.fn().mockImplementation(() => ({
  onopen: null,
  onmessage: null,
  onerror: null,
  close: vi.fn(),
})) as any;

import { useHealthStream } from './useHealthStream';

describe('useHealthStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.EventSource as any).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Service Access', () => {
    it('should return service when found', async () => {
      // Mock EventSource to simulate a service update
      const mockService = {
        service: 'redis',
        name: 'Redis',
        status: 'up',
        responseTime: 5,
      };

      let messageHandler: ((event: MessageEvent) => void) | null = null;
      (global.EventSource as any).mockImplementation(() => {
        const mockEventSource = {
          onopen: null,
          onmessage: null,
          onerror: null,
          close: vi.fn(),
        };
        // Capture the message handler
        Object.defineProperty(mockEventSource, 'onmessage', {
          set: (handler: (event: MessageEvent) => void) => {
            messageHandler = handler;
          },
          get: () => messageHandler,
        });
        // Trigger onopen to simulate connection
        setTimeout(() => {
          if (mockEventSource.onopen) {
            (mockEventSource.onopen as () => void)();
          }
        }, 0);
        return mockEventSource;
      });

      const { result } = renderHook(() => useHealthStream());

      // Wait for EventSource to be set up
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate receiving a service update
      if (messageHandler) {
        messageHandler({
          data: JSON.stringify(mockService),
        } as MessageEvent);
      }

      // Wait for state to update
      await waitFor(() => {
        expect(result.current.getService('redis')).toEqual(mockService);
      });
    });

    it('should return null for non-existent service', () => {
      const { result } = renderHook(() => useHealthStream());

      expect(result.current.getService('nonexistent')).toBeNull();
    });

    it('should have isConnected and error properties', () => {
      const { result } = renderHook(() => useHealthStream());

      expect(result.current).toHaveProperty('isConnected');
      expect(result.current).toHaveProperty('error');
      expect(typeof result.current.isConnected).toBe('boolean');
      expect(result.current.error).toBeNull();
    });
  });

  describe('Refresh', () => {
    it('should expose refresh function', () => {
      const { result } = renderHook(() => useHealthStream());

      expect(typeof result.current.refresh).toBe('function');
    });
  });

  describe('Enabled Option', () => {
    it('should work with enabled option', () => {
      const { result } = renderHook(() => useHealthStream({ enabled: true }));

      expect(result.current).toBeDefined();
    });

    it('should not establish connection when disabled', () => {
      const { result } = renderHook(() => useHealthStream({ enabled: false }));

      // When disabled, EventSource should not be created
      expect(global.EventSource).not.toHaveBeenCalled();

      // Hook should still return a valid structure
      expect(result.current).toBeDefined();
      expect(result.current.isConnected).toBe(false);
    });
  });
});
