import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useServiceStatus, useService, type ServiceStatus } from './useServiceStatus';
import { useDarkMode, DarkModeProvider } from './useDarkMode';

describe('useServiceStatus', () => {
  beforeEach(() => {
    // Don't use fake timers - let real timers work
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch services on mount', async () => {
    const mockServices: ServiceStatus[] = [
      { id: 'whisper', name: 'Whisper', port: 8870, status: 'running', health: 'healthy' },
      { id: 'kokoro', name: 'Kokoro', port: 8880, status: 'stopped', health: 'unknown' },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockServices,
    });

    const { result } = renderHook(() => useServiceStatus({ autoRefresh: false }));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.services).toEqual(mockServices);
  });

  it('should handle fetch error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed'));

    const { result } = renderHook(() => useServiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed');
    expect(result.current.services).toEqual([]);
  });

  it('should call correct endpoint for startService', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const { result } = renderHook(() => useServiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    result.current.startService('whisper');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/services/whisper/start',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('should call correct endpoint for stopService', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const { result } = renderHook(() => useServiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    result.current.stopService('whisper');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/services/whisper/stop',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('should call correct endpoint for restartService', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const { result } = renderHook(() => useServiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    result.current.restartService('whisper');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/services/whisper/restart',
      expect.objectContaining({ method: 'POST' })
    );
  });

  // ============================================================================
  // useService Helper Function Tests (Gap Tests)
  // ============================================================================

  describe('useService', () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should return service when found', async () => {
      const mockServices: ServiceStatus[] = [
        { id: 'whisper', name: 'Whisper', port: 8870, status: 'running', health: 'healthy' },
        { id: 'kokoro', name: 'Kokoro', port: 8880, status: 'stopped', health: 'unknown' },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockServices,
      });

      const { result } = renderHook(() => useService('whisper'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.status).toEqual({
        id: 'whisper',
        name: 'Whisper',
        port: 8870,
        status: 'running',
        health: 'healthy',
      });
      expect(result.current.services).toHaveLength(2);
    });

    it('should return null when service not found', async () => {
      const mockServices: ServiceStatus[] = [
        { id: 'whisper', name: 'Whisper', port: 8870, status: 'running', health: 'healthy' },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockServices,
      });

      const { result } = renderHook(() => useService('nonexistent'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.status).toBeNull();
      expect(result.current.services).toHaveLength(1);
    });
  });
});

describe('useDarkMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should throw error when used outside DarkModeProvider', () => {
    expect(() => renderHook(() => useDarkMode())).toThrow(
      'useDarkMode must be used within a DarkModeProvider'
    );
  });

  it('should work correctly within provider', () => {
    const { result } = renderHook(() => useDarkMode(), {
      wrapper: DarkModeProvider,
    });

    expect(result.current.isDarkMode).toBeDefined();
    expect(result.current.toggleDarkMode).toBeDefined();
  });

  it('should toggle state', () => {
    const { result } = renderHook(() => useDarkMode(), {
      wrapper: DarkModeProvider,
    });

    const initialValue = result.current.isDarkMode;

    act(() => {
      result.current.toggleDarkMode();
    });

    expect(result.current.isDarkMode).toBe(!initialValue);
  });

  it('should set dark mode to specific value', () => {
    const { result } = renderHook(() => useDarkMode(), {
      wrapper: DarkModeProvider,
    });

    act(() => {
      result.current.setDarkMode(true);
    });

    expect(result.current.isDarkMode).toBe(true);
  });

  it('should read saved preference from localStorage', async () => {
    localStorage.setItem('darkMode', 'true');

    const { result } = renderHook(() => useDarkMode(), {
      wrapper: DarkModeProvider,
    });

    await waitFor(() => expect(result.current.isDarkMode).toBe(true));

    expect(result.current.isDarkMode).toBe(true);
  });

  it('should use system preference when no localStorage value', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as any);

    const { result } = renderHook(() => useDarkMode(), {
      wrapper: DarkModeProvider,
    });

    await waitFor(() => expect(result.current.isDarkMode).toBe(true));

    expect(result.current.isDarkMode).toBe(true);
  });

  it('should save preference to localStorage on change', async () => {
    // Mock localStorage BEFORE rendering the hook to capture all calls
    const setItemSpy = vi.spyOn(localStorage, 'setItem');

    const { result } = renderHook(() => useDarkMode(), {
      wrapper: DarkModeProvider,
    });

    await waitFor(() => expect(result.current.isDarkMode).not.toBeUndefined());

    act(() => {
      result.current.setDarkMode(true);
    });

    expect(localStorage.setItem).toHaveBeenCalledWith('darkMode', 'true');
  });

  it('should handle localStorage error gracefully', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('Storage disabled');
    });

    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
    } as any);

    const { result } = renderHook(() => useDarkMode(), {
      wrapper: DarkModeProvider,
    });

    await waitFor(() => expect(result.current.isDarkMode).toBe(false));

    expect(result.current.isDarkMode).toBe(false);
  });
});
