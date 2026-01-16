import { vi } from 'vitest';

export interface MockAuthContextType {
  state: {
    user: {
      id: string;
      displayName: string;
      isAdmin: boolean;
      status: 'active' | 'inactive' | 'pending';
      createdAt: string;
      updatedAt: string;
    } | null;
    loading: boolean;
    error: string | null;
  };
  login: (credentials: any) => Promise<void>;
  githubLogin: () => Promise<void>;
  googleLogin: () => Promise<void>;
  logout: () => Promise<void>;
  getCurrentUser: () => Promise<void>;
  updateProfile: (data: { displayName?: string; email?: string }) => Promise<any>;
  clearError: () => void;
}

export const authContextContainer = {
  current: createDefaultAuthContext() as MockAuthContextType,
};

export function createDefaultAuthContext(): MockAuthContextType {
  return {
    state: {
      user: {
        id: 'test-user-id',
        displayName: 'Test User',
        isAdmin: false,
        status: 'active' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      loading: false,
      error: null,
    },
    login: vi.fn().mockResolvedValue(undefined),
    githubLogin: vi.fn().mockResolvedValue(undefined),
    googleLogin: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    getCurrentUser: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue({
      id: 'test-user-id',
      displayName: 'Test User',
      isAdmin: false,
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    clearError: vi.fn(),
  };
}

export function createMockAuthContext(overrides: Partial<MockAuthContextType> = {}): MockAuthContextType {
  const defaultContext = createDefaultAuthContext();

  // Deep merge state: merge default state with overrides.state
  const mergedState = {
    ...defaultContext.state,
    ...overrides.state,
    // Deep merge user object specifically
    user: overrides.state?.user ? {
      ...defaultContext.state.user,
      ...overrides.state.user,
    } : defaultContext.state.user,
  };

  return {
    ...defaultContext,
    state: mergedState,
    ...overrides,
  };
}

export function createAdminAuthContext(): MockAuthContextType {
  return createMockAuthContext({
    state: {
      user: {
        id: 'admin-user-id',
        displayName: 'Admin User',
        isAdmin: true,
        status: 'active' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      loading: false,
      error: null,
    },
  });
}

export function createGuestAuthContext(): MockAuthContextType {
  return createMockAuthContext({
    state: {
      user: null,
      loading: false,
      error: null,
    },
  });
}
