// core/src/test/mocks/hooks.ts
import { vi } from 'vitest';

// ============================================================================
// Mock useHealthStream
// ============================================================================

export const mockUseHealthStream = (overrides: Record<string, unknown> = {}) => ({
  services: {},
  serviceList: [
    {
      service: 'redis',
      name: 'Redis',
      status: 'up' as const,
      timestamp: new Date().toISOString(),
      isChange: false,
    },
    {
      service: 'whisper',
      name: 'Whisper',
      status: 'up' as const,
      timestamp: new Date().toISOString(),
      isChange: false,
    },
    {
      service: 'kokoro',
      name: 'Kokoro',
      status: 'down' as const,
      timestamp: new Date().toISOString(),
      isChange: true,
    },
    {
      service: 'bernard-agent',
      name: 'Bernard Agent',
      status: 'up' as const,
      timestamp: new Date().toISOString(),
      isChange: false,
    },
  ],
  getService: vi.fn().mockReturnValue(null),
  isConnected: true,
  error: null,
  refresh: vi.fn(),
  ...overrides,
});

export const mockUseHealthStreamConnected = () => mockUseHealthStream({
  isConnected: true,
  error: null,
});

export const mockUseHealthStreamDisconnected = () => mockUseHealthStream({
  isConnected: false,
  error: 'Connection lost',
});

export const mockUseHealthStreamLoading = () => mockUseHealthStream({
  isConnected: false,
  error: null,
});

// ============================================================================
// Mock useLogStream
// ============================================================================

export const mockUseLogStream = (overrides: Record<string, unknown> = {}) => ({
  logs: [],
  isConnected: false,
  error: null,
  clearLogs: vi.fn(),
  containerRef: { current: null },
  ...overrides,
});

export const mockUseLogStreamWithLogs = () => mockUseLogStream({
  logs: [
    {
      timestamp: '2024-01-01T00:00:00Z',
      level: 'info',
      service: 'core',
      message: 'Started',
      raw: '2024-01-01T00:00:00Z [info] Started',
    },
    {
      timestamp: '2024-01-01T00:00:01Z',
      level: 'error',
      service: 'core',
      message: 'Failed',
      raw: '2024-01-01T00:00:01Z [error] Failed',
    },
  ],
  isConnected: true,
  error: null,
});

// ============================================================================
// Mock useServiceStatus
// ============================================================================

export const mockUseServiceStatus = (overrides: Record<string, unknown> = {}) => ({
  services: [
    {
      id: 'whisper',
      name: 'Whisper',
      port: 8870,
      status: 'running' as const,
      health: 'healthy' as const,
      uptime: 3600,
    },
    {
      id: 'kokoro',
      name: 'Kokoro',
      port: 8880,
      status: 'stopped' as const,
      health: 'unknown' as const,
    },
  ],
  loading: false,
  error: null,
  refresh: vi.fn(),
  startService: vi.fn().mockResolvedValue(undefined),
  stopService: vi.fn().mockResolvedValue(undefined),
  restartService: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

// ============================================================================
// Mock useDarkMode
// ============================================================================

export const mockUseDarkMode = (overrides: Record<string, unknown> = {}) => ({
  isDarkMode: false,
  toggleDarkMode: vi.fn(),
  setDarkMode: vi.fn(),
  ...overrides,
});

export const mockUseDarkModeEnabled = () => mockUseDarkMode({ isDarkMode: true });

// ============================================================================
// Mock useRouter / useSearchParams
// ============================================================================

export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

export const mockUseRouter = () => mockRouter;

export const mockUseSearchParams = (params: Record<string, string> = {}) => {
  const get = (key: string) => params[key] || null;
  const getAll = (key: string) => params[key] ? [params[key]] : [];
  const has = (key: string) => key in params;
  const entries = () => Object.entries(params);
  const keys = () => Object.keys(params);
  const values = () => Object.values(params);
  const toString = () => new URLSearchParams(params).toString();

  return {
    get,
    getAll,
    has,
    entries,
    keys,
    values,
    toString,
  };
};
