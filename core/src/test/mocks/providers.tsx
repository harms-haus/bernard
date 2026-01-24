// core/src/test/mocks/providers.tsx
import { vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

// ============================================================================
// Mock AuthProvider
// ============================================================================

interface MockAuthProviderProps {
  children: ReactNode;
  value?: {
    state: {
      user: Record<string, unknown> | null;
      loading: boolean;
      error: string | null;
    };
    login?: () => Promise<void>;
    logout?: () => Promise<void>;
    updateProfile?: () => Promise<Record<string, unknown>>;
    clearError?: () => void;
  };
}

export const MockAuthProvider = ({ children, value }: MockAuthProviderProps) => (
  <div data-testid="auth-provider">{children}</div>
);

export const createMockAuthProviderValue = (overrides: Record<string, unknown> = {}) => {
  const state = (overrides.state as { user?: unknown; loading?: boolean; error?: string | null } | undefined) || {
    user: null,
    loading: false,
    error: null,
  };
  return {
    state,
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue({}),
    clearError: vi.fn(),
    ...overrides,
  };
};

// ============================================================================
// Mock DarkModeProvider
// ============================================================================

export const MockDarkModeProvider = ({ children }: { children: ReactNode }) => (
  <div data-testid="dark-mode-provider">{children}</div>
);

export const createMockDarkModeValue = (isDarkMode = false) => ({
  isDarkMode,
  toggleDarkMode: vi.fn(),
  setDarkMode: vi.fn(),
});

// ============================================================================
// Mock ToastManagerProvider
// ============================================================================

export const MockToastManagerProvider = ({ children }: { children: ReactNode }) => (
  <div data-testid="toast-manager-provider">{children}</div>
);

export const createMockToastManagerValue = () => ({
  toasts: [],
  showToast: vi.fn().mockReturnValue('toast-1'),
  hideToast: vi.fn(),
  clearToasts: vi.fn(),
});

// ============================================================================
// Mock DialogManagerProvider
// ============================================================================

export const MockDialogManagerProvider = ({ children }: { children: ReactNode }) => (
  <div data-testid="dialog-manager-provider">{children}</div>
);

export const createMockDialogManagerValue = () => ({
  dialogs: [],
  openDialog: vi.fn().mockReturnValue('dialog-1'),
  closeDialog: vi.fn(),
  closeAllDialogs: vi.fn(),
});

// ============================================================================
// Mock StreamProvider
// ============================================================================

export const MockStreamProvider = ({ children }: { children: ReactNode }) => (
  <div data-testid="stream-provider">{children}</div>
);

export type MockStreamContextValue = {
  messages: unknown[];
  isLoading: boolean;
  submit: Mock;
  stop: Mock;
};

export const createMockStreamContextValue = (overrides: Record<string, unknown> = {}): MockStreamContextValue => ({
  messages: [],
  isLoading: false,
  submit: vi.fn(),
  stop: vi.fn(),
  ...overrides,
});

// ============================================================================
// Mock ThreadProvider
// ============================================================================

export const MockThreadProvider = ({ children }: { children: ReactNode }) => (
  <div data-testid="thread-provider">{children}</div>
);

export const createMockThreadContextValue = (overrides: Record<string, unknown> = {}) => ({
  threads: [],
  createThread: vi.fn(),
  deleteThread: vi.fn(),
  updateThread: vi.fn(),
  ...overrides,
});

// ============================================================================
// Mock Sidebar Provider
// ============================================================================

export const MockSidebarProvider = ({ children }: { children: ReactNode }) => (
  <div data-testid="sidebar-provider">{children}</div>
);

export const createMockSidebarValue = (overrides: Record<string, unknown> = {}) => ({
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
  ...overrides,
});

// ============================================================================
// Mock Header Provider
// ============================================================================

export const MockHeaderProvider = ({ children }: { children: ReactNode }) => (
  <div data-testid="header-provider">{children}</div>
);

export const createMockHeaderValue = (overrides: Record<string, unknown> = {}) => ({
  title: 'Bernard',
  subtitle: null,
  actions: [],
  setTitle: vi.fn(),
  setSubtitle: vi.fn(),
  setActions: vi.fn(),
  reset: vi.fn(),
  ...overrides,
});
