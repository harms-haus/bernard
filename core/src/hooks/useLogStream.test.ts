// core/src/hooks/useLogStream.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/providers/LogStreamProvider', async () => {
  const actual = await vi.importActual('@/providers/LogStreamProvider');
  return {
    ...actual,
    useLogStream: vi.fn(() => ({
      logs: [],
      isConnected: false,
      error: null,
      clearLogs: vi.fn(),
      containerRef: { current: null },
    })),
  };
});

import { useLogStream } from './useLogStream';

describe('useLogStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Return Type', () => {
    it('should return logs, isConnected, error, clearLogs, containerRef', () => {
      const { result } = renderHook(() =>
        useLogStream({ service: 'test-service' })
      );

      expect(result.current).toHaveProperty('logs');
      expect(result.current).toHaveProperty('isConnected');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('clearLogs');
      expect(result.current).toHaveProperty('containerRef');
      expect(Array.isArray(result.current.logs)).toBe(true);
      expect(typeof result.current.isConnected).toBe('boolean');
      expect(typeof result.current.clearLogs).toBe('function');
    });
  });

  describe('Options', () => {
    it('should accept service option', () => {
      const { result } = renderHook(() =>
        useLogStream({ service: 'whisper' })
      );

      expect(result.current).toBeDefined();
    });

    it('should accept enabled option', () => {
      const { result } = renderHook(() =>
        useLogStream({ service: 'test', enabled: false })
      );

      expect(result.current).toBeDefined();
    });

    it('should accept maxEntries option', () => {
      const { result } = renderHook(() =>
        useLogStream({ service: 'test', maxEntries: 100 })
      );

      expect(result.current).toBeDefined();
    });

    it('should accept autoScroll option', () => {
      const { result } = renderHook(() =>
        useLogStream({ service: 'test', autoScroll: true })
      );

      expect(result.current).toBeDefined();
    });
  });

  describe('Initial State', () => {
    it('should have empty logs array initially', () => {
      const { result } = renderHook(() =>
        useLogStream({ service: 'test' })
      );

      expect(result.current.logs).toEqual([]);
    });

    it('should not be connected initially', () => {
      const { result } = renderHook(() =>
        useLogStream({ service: 'test' })
      );

      expect(result.current.isConnected).toBe(false);
    });

    it('should have null error initially', () => {
      const { result } = renderHook(() =>
        useLogStream({ service: 'test' })
      );

      expect(result.current.error).toBeNull();
    });
  });
});
