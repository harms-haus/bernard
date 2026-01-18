// core/src/test/providers/test-providers.tsx
'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { vi, type Mock } from 'vitest';

// Import TestAuthContext from useAuth (defined there to avoid circular dependencies)
import { type TestAuthContextType, TestAuthContext } from '@/hooks/useAuth';

// Import TestDarkModeContext from useDarkMode
import { type TestDarkModeContextType, TestDarkModeContext } from '@/hooks/useDarkMode';

// Import TestStreamContext from StreamProvider
import { type TestStreamContextType, TestStreamContext } from '@/providers/StreamProvider';

// Import TestHealthStreamContext from useHealthStream
import { type TestHealthStreamContextType, TestHealthStreamContext, HealthStreamTestProvider } from '@/hooks/useHealthStream';

// Re-export for convenience
export { HealthStreamTestProvider };

// ============================================================================
// Test Auth Context Provider
// ============================================================================

interface AuthTestProviderProps {
  children: ReactNode;
  value?: Partial<TestAuthContextType>;
}

const defaultAuthValue: TestAuthContextType = {
  state: { user: null, loading: false, error: null },
  login: vi.fn().mockResolvedValue(undefined),
  githubLogin: vi.fn().mockResolvedValue(undefined),
  googleLogin: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn().mockResolvedValue({}),
  clearError: vi.fn(),
};

export function AuthTestProvider({ children, value }: AuthTestProviderProps) {
  const contextValue: TestAuthContextType = {
    ...defaultAuthValue,
    ...value,
    state: { ...defaultAuthValue.state, ...value?.state },
  };

  return (
    <TestAuthContext.Provider value={contextValue}>
      {children}
    </TestAuthContext.Provider>
  );
}

export function useTestAuth() {
  const context = useContext(TestAuthContext);
  if (context === undefined) {
    throw new Error('useTestAuth must be used within an AuthTestProvider');
  }
  return context;
}

// ============================================================================
// Test Dark Mode Context Provider
// ============================================================================

interface DarkModeTestProviderProps {
  children: ReactNode;
  isDarkMode?: boolean;
}

export function DarkModeTestProvider({ children, isDarkMode = false }: DarkModeTestProviderProps) {
  const contextValue: TestDarkModeContextType = {
    isDarkMode,
    toggleDarkMode: vi.fn(),
    setDarkMode: vi.fn(),
  };

  return (
    <TestDarkModeContext.Provider value={contextValue}>
      {children}
    </TestDarkModeContext.Provider>
  );
}

export function useTestDarkMode() {
  const context = useContext(TestDarkModeContext);
  if (context === undefined) {
    throw new Error('useTestDarkMode must be used within a DarkModeTestProvider');
  }
  return context;
}

// ============================================================================
// Test Stream Context Provider
// ============================================================================

interface StreamTestProviderProps {
  children: ReactNode;
  value?: Partial<TestStreamContextType>;
}

const defaultStreamValue: TestStreamContextType = {
  messages: [],
  isLoading: false,
  submit: vi.fn(),
  stop: vi.fn(),
  error: null,
  latestProgress: null,
  resetProgress: vi.fn(),
  getMessagesMetadata: vi.fn().mockReturnValue(undefined),
  setBranch: vi.fn(),
};

export function StreamTestProvider({ children, value }: StreamTestProviderProps) {
  const contextValue: TestStreamContextType = {
    ...defaultStreamValue,
    ...value,
  };

  return (
    <TestStreamContext.Provider value={contextValue}>
      {children}
    </TestStreamContext.Provider>
  );
}

export function useTestStream() {
  const context = useContext(TestStreamContext);
  if (context === undefined) {
    throw new Error('useTestStream must be used within a StreamTestProvider');
  }
  return context;
}

// ============================================================================
// Test Router Context Provider
// ============================================================================

type TestRouterContextType = {
  push: Mock;
  replace: Mock;
  back: Mock;
  forward: Mock;
  refresh: Mock;
};

const TestRouterContext = createContext<TestRouterContextType | undefined>(undefined);

interface RouterTestProviderProps {
  children: ReactNode;
  router?: Partial<TestRouterContextType>;
}

export function RouterTestProvider({ children, router = {} }: RouterTestProviderProps) {
  const contextValue: TestRouterContextType = {
    push: router.push || vi.fn(),
    replace: router.replace || vi.fn(),
    back: router.back || vi.fn(),
    forward: router.forward || vi.fn(),
    refresh: router.refresh || vi.fn(),
  };

  return (
    <TestRouterContext.Provider value={contextValue}>
      {children}
    </TestRouterContext.Provider>
  );
}

export function useTestRouter() {
  const context = useContext(TestRouterContext);
  if (context === undefined) {
    throw new Error('useTestRouter must be used within a RouterTestProvider');
  }
  return context;
}

// ============================================================================
// Test Search Params Provider (for useSearchParams mock)
// ============================================================================

type TestSearchParamsContextType = {
  get: (key: string) => string | null;
  getAll: (key: string) => string[];
  has: (key: string) => boolean;
  entries: () => Iterable<[string, string]>;
  keys: () => Iterable<string>;
  values: () => Iterable<string>;
  toString: () => string;
};

const TestSearchParamsContext = createContext<TestSearchParamsContextType | undefined>(undefined);

interface SearchParamsTestProviderProps {
  children: ReactNode;
  params?: Record<string, string>;
}

export function SearchParamsTestProvider({
  children,
  params = {},
}: SearchParamsTestProviderProps) {
  const contextValue: TestSearchParamsContextType = {
    get: (key: string) => (key in params ? params[key] : null),
    getAll: (key: string) => (key in params ? [params[key]] : []),
    has: (key: string) => key in params,
    entries: () => Object.entries(params),
    keys: () => Object.keys(params),
    values: () => Object.values(params),
    toString: () => new URLSearchParams(params).toString(),
  };

  return (
    <TestSearchParamsContext.Provider value={contextValue}>
      {children}
    </TestSearchParamsContext.Provider>
  );
}

export function useTestSearchParams() {
  const context = useContext(TestSearchParamsContext);
  if (context === undefined) {
    throw new Error('useTestSearchParams must be used within a SearchParamsTestProvider');
  }
  return context;
}
