// core/src/test/mocks/external.ts
import { vi } from 'vitest';

// ============================================================================
// Mock EventSource (for SSE hooks)
// ============================================================================

export interface MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onopen: ((event: Event) => void) | null;
  close: () => void;
}

export const createMockEventSource = (): MockEventSource => ({
  onmessage: null,
  onerror: null,
  onopen: null,
  close: vi.fn(),
});

// ============================================================================
// Mock Fetch
// ============================================================================

export type MockFetchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

export const createMockFetch = (response: MockFetchResponse) => {
  return vi.fn().mockResolvedValue(response);
};

export const createMockFetchJson = (data: unknown, status = 200) =>
  createMockFetch({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });

export const createMockFetchError = (message: string, status = 500) =>
  createMockFetch({
    ok: false,
    status,
    statusText: 'Error',
    json: () => Promise.reject(new Error(message)),
    text: () => Promise.reject(new Error(message)),
  });

// ============================================================================
// Mock Navigator Clipboard
// ============================================================================

export const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue(''),
};

// ============================================================================
// Mock URL.createObjectURL
// ============================================================================

export const mockURL = {
  createObjectURL: vi.fn().mockReturnValue('blob:test'),
  revokeObjectURL: vi.fn(),
};

// ============================================================================
// Mock window.matchMedia
// ============================================================================

export const createMockMatchMedia = (matches: boolean) => ({
  matches,
  media: '',
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
});

// ============================================================================
// Mock LocalStorage
// ============================================================================

export const createMockLocalStorage = () => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] || null,
  };
};
