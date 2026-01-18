import { vi } from 'vitest';

// Mutable ref for test-specific auth state
export const authStateRef: {
  current: {
    user?: {
      id: string;
      displayName: string;
      email: string;
      role: 'admin' | 'user' | 'guest';
      status: 'active' | 'disabled' | 'deleted';
      createdAt: string;
      updatedAt: string;
      lastLoginAt?: string;
    } | null;
    loading?: boolean;
    error?: string | null;
  };
} = { current: {} };

export const mockUpdateProfile = vi.fn();
export const mockClearError = vi.fn();
export const mockLogin = vi.fn();
export const mockGithubLogin = vi.fn();
export const mockGoogleLogin = vi.fn();
export const mockLogout = vi.fn();

// Create mock useAuth based on current authStateRef
export const createMockUseAuth = (overrides: {
  user?: {
    id: string;
    displayName: string;
    email: string;
    role: 'admin' | 'user' | 'guest';
    status: 'active' | 'disabled' | 'deleted';
    createdAt: string;
    updatedAt: string;
    lastLoginAt?: string;
  } | null;
  loading?: boolean;
  error?: string | null;
} = {}) => ({
  state: {
    user: overrides.user ?? {
      id: 'user-123',
      displayName: 'Test User',
      email: 'test@example.com',
      role: 'user',
      status: 'active',
      createdAt: '2023-01-01T00:00:00.000Z',
      updatedAt: '2023-01-01T00:00:00.000Z',
    },
    loading: overrides.loading ?? false,
    error: overrides.error ?? null,
  },
  updateProfile: mockUpdateProfile,
  clearError: mockClearError,
  login: mockLogin,
  githubLogin: mockGithubLogin,
  googleLogin: mockGoogleLogin,
  logout: mockLogout,
});

// Mock module for vi.mock
export const mockUseAuth = {
  useAuth: () => createMockUseAuth(authStateRef.current),
};
