// core/src/test/helpers/render-helpers.ts
import { render, type RenderResult, screen, waitFor } from '@testing-library/react';
import { act } from '@testing-library/react';
import { expect } from 'vitest';
import type { Mock } from 'vitest';
import { vi } from 'vitest';
import React, { createElement } from 'react';
import { TestAuthContext } from '@/hooks/useAuth';
import { mockUseAuth, mockUseAuthAsAdmin } from '@/test/mocks/auth';
import { mockUseSearchParams, mockUseHealthStream } from '@/test/mocks/hooks';

// ============================================================================
// Module-scoped mocks (must be at module scope for vi.mock to take effect)
// These mocks are applied when this module is first imported, ensuring components
// receive mocked hooks rather than real implementations. This solves the timing
// issue where vi.doMock inside functions ran after components were already
// instantiated with real hook references.
// ============================================================================

// Default mock implementations at module scope
const defaultUseAuthReturn = {
  user: null,
  loading: false,
  error: null,
  login: vi.fn(),
  githubLogin: vi.fn(),
  googleLogin: vi.fn(),
  logout: vi.fn(),
  updateProfile: vi.fn(),
  clearError: vi.fn(),
};

const defaultUseAdminAuthReturn = {
  isAdmin: false,
  isAdminLoading: false,
  user: null,
  loading: false,
  error: null,
};

const defaultUseHealthStreamReturn = {
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
};

const defaultUseSearchParamsReturn = {
  get: (_key: string) => null,
  getAll: (_key: string) => [],
  has: (_key: string) => false,
  entries: () => [],
  keys: () => [],
  values: () => [],
  toString: () => '',
};

// Module-scoped holder for the current auth context value
// This allows renderWithAuth/renderWithAdmin to update the value that
// the mocked useAuth hook will return to components
let currentTestAuthContextValue: typeof mockUseAuth extends () => infer R ? R : never = defaultUseAuthReturn as never;

// Update function for tests to modify the auth context value
export const setTestAuthContextValue = (value: typeof currentTestAuthContextValue): void => {
  currentTestAuthContextValue = value;
};

// Reset to default auth context value
export const resetTestAuthContextValue = (): void => {
  currentTestAuthContextValue = defaultUseAuthReturn as never;
};

// Mock useAuth at module scope so components get the mock on import
// The mock returns the module-scoped context value, which is updated
// by renderWithAuth/renderWithAdmin via TestAuthContext.Provider
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => currentTestAuthContextValue,
  AuthContext: {
    Provider: ({ children }: { children: React.ReactNode }) => createElement(React.Fragment, null, children),
  },
  TestAuthContext: React.createContext(undefined as never),
}));

// Mock useAdminAuth at module scope
vi.mock('@/hooks/useAdminAuth', () => ({
  useAdminAuth: () => defaultUseAdminAuthReturn,
}));

// Mock useHealthStream at module scope
vi.mock('@/hooks/useHealthStream', () => ({
  useHealthStream: () => defaultUseHealthStreamReturn,
}));

// Mock next/navigation at module scope
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => defaultUseSearchParamsReturn,
}));

// ============================================================================
// Render with Auth
// ============================================================================

export function renderWithAuth(
  ui: React.ReactElement,
  authState?: {
    user: Record<string, unknown> | null;
    loading: boolean;
    error: string | null;
  }
): RenderResult {
  // Use mockUseAuth to create a complete auth context value, overriding state with provided authState
  const authContextValue = mockUseAuth({
    state: authState ?? { user: null, loading: false, error: null },
  });

  // Update the module-scoped value so the mocked useAuth hook returns it
  currentTestAuthContextValue = authContextValue as never;

  // Wrap ui with TestAuthContext.Provider so useAuth (which checks TestAuthContext first) reads the value
  const wrappedUi = createElement(TestAuthContext.Provider, { value: authContextValue }, ui);

  return render(wrappedUi);
}

// ============================================================================
// Render with Admin
// ============================================================================

export function renderWithAdmin(ui: React.ReactElement): RenderResult {
  // Use pre-built admin mock helper to create complete auth context value
  const authContextValue = mockUseAuthAsAdmin();

  // Re-apply mock with admin state using vi.doMock for useAdminAuth
  // This ensures useAdminAuth returns admin values at module level
  vi.doMock('@/hooks/useAdminAuth', () => ({
    useAdminAuth: () => ({
      ...defaultUseAdminAuthReturn,
      isAdmin: true,
      isAdminLoading: false,
      user: { id: 'admin', role: 'admin' },
      loading: false,
      error: null,
    }),
  }));

  // Wrap ui with AuthContext.Provider (for useAuth)
  const wrappedUi = createElement(AuthContext.Provider, { value: authContextValue }, ui);

  return render(wrappedUi);
}

// ============================================================================
// Render with Health Stream
// ============================================================================

export function renderWithHealthStream(
  ui: React.ReactElement,
  healthState?: {
    isConnected: boolean;
    error: string | null;
    serviceList?: unknown[];
  }
): RenderResult {
  // Re-apply mock with custom health state using vi.doMock
  vi.doMock('@/hooks/useHealthStream', () => ({
    useHealthStream: () => ({
      ...defaultUseHealthStreamReturn,
      services: {},
      serviceList: healthState?.serviceList || defaultUseHealthStreamReturn.serviceList,
      isConnected: healthState?.isConnected ?? true,
      error: healthState?.error ?? null,
      refresh: vi.fn(),
    }),
  }));

  return render(ui);
}

// ============================================================================
// Render with Router
// ============================================================================

export function renderWithRouter(
  ui: React.ReactElement,
  router?: {
    push?: Mock;
    replace?: Mock;
    back?: Mock;
  }
): RenderResult {
  // Re-apply mock with custom router using vi.doMock
  vi.doMock('next/navigation', () => ({
    useRouter: () => ({
      push: router?.push || vi.fn(),
      replace: router?.replace || vi.fn(),
      back: router?.back || vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    }),
    useSearchParams: () => defaultUseSearchParamsReturn,
  }));

  return render(ui);
}

// ============================================================================
// Async Helpers
// ============================================================================

export async function waitForLoadingComplete(timeout = 5000): Promise<void> {
  await waitFor(
    () => {
      expect(screen.queryByText(/loading/i, { exact: false })).not.toBeInTheDocument();
    },
    { timeout }
  );
}

export async function waitForAsyncOperation(ms = 100): Promise<void> {
  await act(async () => await new Promise(resolve => setTimeout(resolve, ms)));
}
