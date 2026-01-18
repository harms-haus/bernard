// core/src/test/wrappers/component-wrappers.tsx
import { ReactNode } from 'react';
import { vi, type Mock } from 'vitest';

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

  vi.doMock('@/hooks/useAuth', () => ({
    useAuth: () => mockState,
  }));

  return <>{children}</>;
};

// ============================================================================
// Admin Wrapper
// ============================================================================

interface AdminWrapperProps {
  children: ReactNode;
  isAdmin?: boolean;
}

export const AdminWrapper = ({ children, isAdmin = false }: AdminWrapperProps) => {
  const mockState = {
    user: isAdmin
      ? { id: 'admin', role: 'admin' }
      : { id: 'user', role: 'user' },
    loading: false,
    error: null,
  };

  vi.doMock('@/hooks/useAdminAuth', () => ({
    useAdminAuth: () => ({
      isAdmin,
      isAdminLoading: false,
      user: mockState.user,
      loading: false,
      error: null,
    }),
  }));

  return <>{children}</>;
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

  vi.doMock('@/providers/StreamProvider', async () => {
    const actual = await vi.importActual('@/providers/StreamProvider');
    return {
      ...actual,
      useStreamContext: () => mockContext,
    };
  });

  return <>{children}</>;
};

// ============================================================================
// Dark Mode Wrapper
// ============================================================================

interface DarkModeWrapperProps {
  children: ReactNode;
  isDarkMode?: boolean;
}

export const DarkModeWrapper = ({ children, isDarkMode = false }: DarkModeWrapperProps) => {
  vi.doMock('@/hooks/useDarkMode', () => ({
    useDarkMode: () => ({
      isDarkMode,
      toggleDarkMode: vi.fn(),
      setDarkMode: vi.fn(),
    }),
  }));

  return <>{children}</>;
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
  vi.doMock('@/hooks/useHealthStream', () => ({
    useHealthStream: () => ({
      services: {},
      serviceList: [],
      isConnected,
      error,
      refresh: vi.fn(),
    }),
  }));

  return <>{children}</>;
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
  vi.doMock('next/navigation', () => ({
    useRouter: () => ({
      push: router.push || vi.fn(),
      replace: router.replace || vi.fn(),
      back: router.back || vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    }),
    useSearchParams: () => mockUseSearchParams(),
  }));

  return <>{children}</>;
};

// Helper
import { mockUseSearchParams } from '@/test/mocks/hooks';
