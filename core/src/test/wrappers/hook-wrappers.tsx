// core/src/test/wrappers/hook-wrappers.tsx
import { ReactNode } from 'react';
import { renderHook, type RenderHookOptions, type RenderHookResult } from '@testing-library/react';
import { vi } from 'vitest';
import { AuthContext } from '@/hooks/useAuth';
import type { AuthState, User } from '@/types/auth';

// Import test providers
import { DarkModeTestProvider } from '@/test/providers';

// ============================================================================
// Auth Provider Wrapper (for useAuth, useAdminAuth)
// ============================================================================

type AuthContextType = {
  state: AuthState;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  githubLogin: () => Promise<void>;
  googleLogin: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: { displayName?: string; email?: string }) => Promise<User>;
  clearError: () => void;
};

interface AuthProviderWrapperProps {
  children: ReactNode;
  value?: Partial<AuthContextType> & {
    state: {
      user: Record<string, unknown> | null;
      loading: boolean;
      error: string | null;
    };
  };
}

export const AuthProviderWrapper = ({ children, value }: AuthProviderWrapperProps) => {
  const mockValue: AuthContextType = {
    state: { user: null, loading: false, error: null },
    login: vi.fn().mockResolvedValue(undefined),
    githubLogin: vi.fn().mockResolvedValue(undefined),
    googleLogin: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue({ id: 'mock-user', email: 'test@example.com' } as User),
    clearError: vi.fn(),
    ...value,
  };

  // Use AuthContext.Provider directly instead of vi.doMock (which is ineffective during render)
  return <AuthContext.Provider value={mockValue}>{children}</AuthContext.Provider>;
};

export function renderWithAuth<T>(
  callback: () => T,
  options?: Omit<RenderHookOptions<T>, 'wrapper'>
): RenderHookResult<T, T> {
  return renderHook(callback, {
    wrapper: AuthProviderWrapper,
    ...options,
  });
}

// ============================================================================
// Dark Mode Provider Wrapper (for useDarkMode)
// ============================================================================

interface DarkModeProviderWrapperProps {
  children: ReactNode;
  initialValue?: { isDarkMode: boolean };
}

export const DarkModeProviderWrapper = ({
  children,
  initialValue = { isDarkMode: false },
}: DarkModeProviderWrapperProps) => {
  // Use DarkModeTestProvider instead of vi.doMock (which is ineffective during render)
  return (
    <DarkModeTestProvider isDarkMode={initialValue.isDarkMode}>
      {children}
    </DarkModeTestProvider>
  );
};

export function renderWithDarkMode<T>(
  callback: () => T,
  options?: Omit<RenderHookOptions<T>, 'wrapper'>
): RenderHookResult<T, T> {
  return renderHook(callback, {
    wrapper: DarkModeProviderWrapper,
    ...options,
  });
}

// ============================================================================
// Toast Manager Wrapper (for useToast, useToastManager)
// ============================================================================

interface ToastManagerWrapperProps {
  children: ReactNode;
}

export const ToastManagerWrapper = ({ children }: ToastManagerWrapperProps) => {
  vi.doMock('@/components/ToastManager', () => ({
    useToastManager: () => ({
      toasts: [],
      showToast: vi.fn().mockReturnValue('toast-1'),
      hideToast: vi.fn(),
      clearToasts: vi.fn(),
    }),
    useToast: () => ({
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    }),
  }));

  return <>{children}</>;
};

// ============================================================================
// Dialog Manager Wrapper (for useDialogManager, useConfirmDialog)
// ============================================================================

interface DialogManagerWrapperProps {
  children: ReactNode;
}

export const DialogManagerWrapper = ({ children }: DialogManagerWrapperProps) => {
  vi.doMock('@/components/DialogManager', () => ({
    useDialogManager: () => ({
      dialogs: [],
      openDialog: vi.fn().mockReturnValue('dialog-1'),
      closeDialog: vi.fn(),
      closeAllDialogs: vi.fn(),
    }),
    useConfirmDialog: () => vi.fn(),
    useAlertDialog: () => vi.fn(),
  }));

  return <>{children}</>;
};

// ============================================================================
// Sidebar Provider Wrapper (for useDynamicSidebar)
// ============================================================================

interface SidebarProviderWrapperProps {
  children: ReactNode;
  initialValue?: {
    isOpen?: boolean;
    menuItems?: unknown[];
    header?: unknown;
  };
}

export const SidebarProviderWrapper = ({
  children,
  initialValue = {},
}: SidebarProviderWrapperProps) => {
  vi.doMock('@/components/dynamic-sidebar/DynamicSidebarProvider', () => ({
    useDynamicSidebar: () => ({
      isOpen: true,
      header: null,
      menuItems: [],
      footerItems: [],
      setHeader: vi.fn(),
      setMenuItems: vi.fn(),
      addMenuItem: vi.fn(),
      removeMenuItem: vi.fn(),
      updateMenuItem: vi.fn(),
      addFooterItem: vi.fn(),
      clearFooterItems: vi.fn(),
      setIsOpen: vi.fn(),
      toggle: vi.fn(),
      reset: vi.fn(),
      ...initialValue,
    }),
  }));

  return <>{children}</>;
};

// ============================================================================
// Header Provider Wrapper (for useDynamicHeader)
// ============================================================================

interface HeaderProviderWrapperProps {
  children: ReactNode;
  initialValue?: {
    title?: string;
    subtitle?: string | null;
    actions?: unknown[];
  };
}

export const HeaderProviderWrapper = ({
  children,
  initialValue = {},
}: HeaderProviderWrapperProps) => {
  vi.doMock('@/components/dynamic-header/DynamicHeaderProvider', () => ({
    useDynamicHeader: () => ({
      title: '',
      subtitle: null,
      actions: [],
      setTitle: vi.fn(),
      setSubtitle: vi.fn(),
      setActions: vi.fn(),
      reset: vi.fn(),
      ...initialValue,
    }),
  }));

  return <>{children}</>;
};
