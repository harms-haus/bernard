// core/src/test/wrappers/component-wrappers.tsx
import { ReactNode } from 'react';
import { vi, type Mock } from 'vitest';

// Import test providers (created in Part B)
import {
  AuthTestProvider,
  DarkModeTestProvider,
  StreamTestProvider,
  HealthStreamTestProvider,
  RouterTestProvider,
  SearchParamsTestProvider,
} from '@/test/providers';

// Import from mocks (created in Part A)
import type { MockAuthState } from '@/test/mocks/auth';
import type { MockStreamContextValue } from '@/test/mocks/providers';


// ============================================================================
// Auth Wrapper
// ============================================================================

interface AuthWrapperProps {
  children: ReactNode;
  authState?: MockAuthState;
}

export const AuthWrapper = ({ children, authState }: AuthWrapperProps) => {
  const mockState = authState || {
    user: null,
    loading: false,
    error: null,
  };

  // Use AuthTestProvider instead of vi.doMock (which is ineffective during render)
  return (
    <AuthTestProvider
      value={{
        state: mockState,
        login: vi.fn().mockResolvedValue(undefined),
        logout: vi.fn().mockResolvedValue(undefined),
      }}
    >
      {children}
    </AuthTestProvider>
  );
};

// ============================================================================
// Admin Wrapper
// ============================================================================

interface AdminWrapperProps {
  children: ReactNode;
  isAdmin?: boolean;
}

export const AdminWrapper = ({ children, isAdmin = false }: AdminWrapperProps) => {
  const mockUser = isAdmin
    ? { id: 'admin', role: 'admin' }
    : { id: 'user', role: 'user' };

  // AdminWrapper reuses AuthTestProvider since useAdminAuth depends on useAuth
  return (
    <AuthTestProvider
      value={{
        state: {
          user: mockUser,
          loading: false,
          error: null,
        },
        login: vi.fn().mockResolvedValue(undefined),
        logout: vi.fn().mockResolvedValue(undefined),
      }}
    >
      {children}
    </AuthTestProvider>
  );
};

// ============================================================================
// Stream Wrapper
// ============================================================================

interface StreamWrapperProps {
  children: ReactNode;
  contextValue?: MockStreamContextValue;
}

export const StreamWrapper = ({ children, contextValue }: StreamWrapperProps) => {
  const mockContext = contextValue || {
    messages: [],
    isLoading: false,
    submit: vi.fn(),
    stop: vi.fn(),
  };

  // Use StreamTestProvider instead of vi.doMock
  return (
    <StreamTestProvider
      value={{
        messages: mockContext.messages as import('@langchain/langgraph-sdk').Message[],
        isLoading: mockContext.isLoading,
        submit: mockContext.submit,
        stop: mockContext.stop,
        error: null,
        latestProgress: null,
        resetProgress: vi.fn(),
        getMessagesMetadata: vi.fn().mockReturnValue(undefined),
        setBranch: vi.fn(),
      }}
    >
      {children}
    </StreamTestProvider>
  );
};

// ============================================================================
// Dark Mode Wrapper
// ============================================================================

interface DarkModeWrapperProps {
  children: ReactNode;
  isDarkMode?: boolean;
}

export const DarkModeWrapper = ({ children, isDarkMode = false }: DarkModeWrapperProps) => {
  // Use DarkModeTestProvider instead of vi.doMock
  return (
    <DarkModeTestProvider isDarkMode={isDarkMode}>
      {children}
    </DarkModeTestProvider>
  );
};

// ============================================================================
// Health Stream Wrapper
// ============================================================================

interface HealthStreamWrapperProps {
  children: ReactNode;
  isConnected?: boolean;
  error?: string | null;
}

export const HealthStreamWrapper = ({
  children,
  isConnected = true,
  error = null,
}: HealthStreamWrapperProps) => {
  // Use HealthStreamTestProvider instead of vi.doMock
  return (
    <HealthStreamTestProvider isConnected={isConnected} error={error}>
      {children}
    </HealthStreamTestProvider>
  );
};

// ============================================================================
// Router Wrapper
// ============================================================================

interface RouterWrapperProps {
  children: ReactNode;
  router?: {
    push?: Mock;
    replace?: Mock;
    back?: Mock;
  };
}

export const RouterWrapper = ({ children, router = {} }: RouterWrapperProps) => {
  // Use RouterTestProvider and SearchParamsTestProvider instead of vi.doMock
  return (
    <RouterTestProvider
      router={{
        push: router.push || vi.fn(),
        replace: router.replace || vi.fn(),
        back: router.back || vi.fn(),
      }}
    >
      <SearchParamsTestProvider params={{}}>
        {children}
      </SearchParamsTestProvider>
    </RouterTestProvider>
  );
};
