// core/src/test/mocks/auth.ts
import { vi } from 'vitest';

// ============================================================================
// User Fixtures
// ============================================================================

export const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  role: 'user' as const,
  status: 'active' as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const mockAdminUser = {
  ...mockUser,
  role: 'admin' as const,
};

export const mockGuestUser = {
  ...mockUser,
  role: 'guest' as const,
};

// ============================================================================
// Mock Auth State
// ============================================================================

export interface MockAuthState {
  user: typeof mockUser | typeof mockAdminUser | typeof mockGuestUser | null;
  loading: boolean;
  error: string | null;
}

export const createMockAuthState = (overrides: Partial<MockAuthState> = {}): MockAuthState => ({
  user: mockUser,
  loading: false,
  error: null,
  ...overrides,
});

// ============================================================================
// Mock AuthClient (Better-Auth)
// ============================================================================

export const createMockAuthClient = () => ({
  useSession: vi.fn(),
  signIn: {
    email: vi.fn(),
    social: vi.fn(),
  },
  signUp: {
    email: vi.fn(),
  },
  signOut: vi.fn(),
  updateUser: vi.fn(),
});

// ============================================================================
// Mock Session Response
// ============================================================================

export const createMockSession = (user = mockUser) => ({
  session: {
    id: 'session-123',
    userId: user.id,
    expiresAt: new Date(Date.now() + 3600000),
  },
  user: {
    id: user.id,
    email: user.email,
    name: user.displayName,
    role: user.role,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});

// ============================================================================
// Mock Auth Error
// ============================================================================

export const createMockAuthError = (message: string) => ({
  error: {
    message,
    code: 'AUTH_ERROR',
  },
});

// ============================================================================
// Mock useAuth Hook
// ============================================================================

export const mockUseAuth = (overrides: Record<string, unknown> = {}) => ({
  state: createMockAuthState(overrides.state as Partial<MockAuthState>),
  login: vi.fn().mockResolvedValue(undefined),
  githubLogin: vi.fn().mockResolvedValue(undefined),
  googleLogin: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn().mockResolvedValue({}),
  clearError: vi.fn(),
  ...overrides,
});

export const mockUseAuthAsAdmin = () => mockUseAuth({
  state: { user: mockAdminUser, loading: false, error: null },
});

export const mockUseAuthAsGuest = () => mockUseAuth({
  state: { user: mockGuestUser, loading: false, error: null },
});

export const mockUseAuthLoading = () => mockUseAuth({
  state: { user: null, loading: true, error: null },
});

export const mockUseAuthUnauthenticated = () => mockUseAuth({
  state: { user: null, loading: false, error: null },
});

// ============================================================================
// Mock useAdminAuth Hook
// ============================================================================

export const mockUseAdminAuth = (overrides: Record<string, unknown> = {}) => ({
  isAdmin: false,
  isAdminLoading: false,
  user: null,
  error: null,
  loading: false,
  ...overrides,
});

export const mockUseAdminAuthAsAdmin = () => mockUseAdminAuth({
  isAdmin: true,
  isAdminLoading: false,
  user: mockAdminUser,
  loading: false,
  error: null,
});

export const mockUseAdminAuthLoading = () => mockUseAdminAuth({
  isAdmin: false,
  isAdminLoading: true,
  user: null,
  loading: true,
  error: null,
});

// ============================================================================
// Router Mocks
// ============================================================================

export const createMockRouter = () => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
});

export const createMockSearchParams = (params: Record<string, string> = {}) => {
  const get = (key: string) => key in params ? params[key] : null;
  const getAll = (key: string) => key in params ? [params[key]] : [];
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
