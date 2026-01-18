import { beforeAll, beforeEach, afterEach, vi, expect } from "vitest";
import React from "react";
import * as fs from "node:fs";
import * as path from "node:path";
import "@testing-library/jest-dom";
import { resetSettingsManager } from "@/lib/config/appSettings";
import { resetSettingsStore } from "@/lib/config/settingsStore";

// Make React available globally for JSX transformation in tests
globalThis.React = React;

// ============================================================================
// MOCK next/headers to prevent "headers() called outside request scope" errors
// ============================================================================

vi.mock('next/headers', async () => {
  const actual = await vi.importActual<typeof import('next/headers')>('next/headers');
  return {
    ...actual,
    headers: vi.fn().mockImplementation(() => {
      // Return a mock headers object that behaves like Headers
      const headers = new Map<string, string>([
        ['cookie', 'test-cookie'],
        ['authorization', 'Bearer test-token'],
      ]);
      return headers;
    }),
  };
});

// ============================================================================
// MOCK better-auth to return a mock session for tests
// ============================================================================

vi.mock('@/lib/auth/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/auth')>('@/lib/auth/auth');
  // Safely handle missing nested objects with defaults
  const defaultAuth = actual?.auth ?? {};
  const defaultApi = defaultAuth?.api ?? {};
  // Make role configurable via environment variable, default to 'admin'
  const defaultRole = process.env.TEST_DEFAULT_ROLE ?? 'admin';
  return {
    ...actual,
    auth: {
      ...defaultAuth,
      api: {
        ...defaultApi,
        getSession: vi.fn().mockResolvedValue({
          user: {
            id: 'test-user-123',
            email: 'test@example.com',
            name: 'Test User',
            role: defaultRole,
            image: null,
          },
          session: {
            id: 'test-session-123',
            userId: 'test-user-123',
            token: 'test-token',
            expiresAt: new Date(Date.now() + 86400000),
          },
        }),
      },
    },
  };
});

// ============================================
// LOCALSTORAGE MOCK (using Object.defineProperty)
// ============================================
const localStorageData = new Map<string, string>();

// Create a proper localStorage mock object
const localStorageMock = {
  getItem: (key: string): string | null => {
    const value = localStorageData.get(key);
    return value === undefined ? null : value;
  },
  setItem: (key: string, value: string): void => {
    localStorageData.set(key, value);
  },
  removeItem: (key: string): void => {
    localStorageData.delete(key);
  },
  clear: (): void => {
    localStorageData.clear();
  },
  get length() {
    return localStorageData.size;
  },
  key: (index: number): string | null => {
    return Array.from(localStorageData.keys())[index] ?? null;
  },
};

// Use Object.defineProperty to replace localStorage
// This must happen at the global level to work with jsdom
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

// Also set on window for any code that uses window.localStorage
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
}

// Clear localStorage mock data before each test
beforeEach(() => {
  localStorageData.clear();
});

const TEST_DIR = path.join(process.cwd(), "test-temp");
const LOGS_DIR = path.join(TEST_DIR, 'logs')
const PIDS_DIR = path.join(TEST_DIR, 'pids')

beforeEach(() => {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true })
  }
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true })
  }
  if (!fs.existsSync(PIDS_DIR)) {
    fs.mkdirSync(PIDS_DIR, { recursive: true })
  }

  vi.stubEnv('LOG_DIR', LOGS_DIR)
  vi.stubEnv('TZ', 'America/Chicago')
  // BetterAuth requires a secret, stub one for tests
  vi.stubEnv('BETTER_AUTH_SECRET', 'Cz+yjqf9nUVK2xa5lMgQEAIkeuDbZwvrct9IKXyPaJw=')
})

afterEach(() => {
  vi.unstubAllEnvs();
  // Reset singleton instances after each test
  resetSettingsManager();
  resetSettingsStore();
});

vi.mock('node:child_process', () => ({
  default: {
    spawn: vi.fn().mockReturnValue({
      pid: 12345,
      on: vi.fn(),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      kill: vi.fn(),
    }),
    execSync: vi.fn().mockReturnValue(''),
    exec: vi.fn(),
    execFile: vi.fn(),
    spawnSync: vi.fn(),
  },
  spawn: vi.fn().mockReturnValue({
    pid: 12345,
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    kill: vi.fn(),
  }),
  execSync: vi.fn().mockReturnValue(''),
  exec: vi.fn(),
  execFile: vi.fn(),
  spawnSync: vi.fn(),
}))

const originalKill = process.kill

beforeEach(() => {
  process.kill = vi.fn().mockReturnValue(true) as any
})

afterEach(() => {
  process.kill = originalKill
})

// ============================================================================
// Import Shared Mock Infrastructure
// ============================================================================

// These will be available to all tests
import '@/test/mocks';
import '@/test/wrappers';
import '@/test/helpers';

export {}
