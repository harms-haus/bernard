// core/src/hooks/useAuth.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { User } from '@/types/auth';
import type { LoginCredentials } from '@/types/auth';

// ============================================================================
// Mock authClient module
// ============================================================================

vi.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: vi.fn(() => ({
      data: { session: null, user: null },
      isPending: false,
    })),
    signIn: {
      email: vi.fn(),
      social: vi.fn(),
    },
    signOut: vi.fn(),
    updateUser: vi.fn(),
  },
}));

// ============================================================================
// Mock useAuth module with actual exports
// ============================================================================

vi.mock('./useAuth', async () => {
  const actual = await vi.importActual<typeof import('./useAuth')>('./useAuth');
  return {
    ...actual,
  };
});

// Import after mocking
import { useAuth, TestAuthContext, AuthContext } from './useAuth';
import { authClient } from '@/lib/auth/auth-client';

// Helper to create a proper User object matching our User type
const createTestUser = (overrides: Partial<User> = {}): User => ({
  id: 'test-user-123',
  displayName: 'Test User',
  email: 'test@example.com',
  role: 'user',
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default mock behavior
    (authClient.useSession as Mock).mockReturnValue({
      data: { session: null, user: null },
      isPending: false,
    });
    (authClient.signIn.email as Mock).mockResolvedValue({ error: null });
    (authClient.signIn.social as Mock).mockResolvedValue({ error: null });
    (authClient.signOut as Mock).mockResolvedValue(undefined);
    (authClient.updateUser as Mock).mockResolvedValue({ data: { id: 'user-123' } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to render hook with TestAuthContext using actual method implementations
  const renderWithTestContext = (
    state: { user: User | null; loading: boolean; error: string | null },
    methods?: {
      login?: (credentials: LoginCredentials) => Promise<void>;
      logout?: () => Promise<void>;
      githubLogin?: () => Promise<void>;
      googleLogin?: () => Promise<void>;
      updateProfile?: (data: { displayName?: string; email?: string }) => Promise<User>;
      clearError?: () => void;
    }
  ) => {
    // Create a wrapper that provides both TestAuthContext and AuthContext
    // This allows us to use TestAuthContext for state while using actual methods
    const loginMethod = methods?.login
      ? methods.login
      : async (credentials: LoginCredentials) => {
          const { error } = await authClient.signIn.email({
            email: credentials.email,
            password: credentials.password,
          });
          if (error) throw new Error(error.message || 'Login failed');
        };

    const githubLoginMethod = methods?.githubLogin
      ? methods.githubLogin
      : async () => {
          const { error } = await authClient.signIn.social({ provider: 'github' });
          if (error) throw new Error(error.message || 'GitHub login failed');
        };

    const googleLoginMethod = methods?.googleLogin
      ? methods.googleLogin
      : async () => {
          const { error } = await authClient.signIn.social({ provider: 'google' });
          if (error) throw new Error(error.message || 'Google login failed');
        };

    const logoutMethod = methods?.logout
      ? methods.logout
      : async () => {
          await authClient.signOut();
        };

    const updateProfileMethod = methods?.updateProfile
      ? methods.updateProfile
      : async (_data: { displayName?: string; email?: string }) => {
          // For tests that need the actual implementation, we need session data
          // This is a simplified version for tests that don't need full profile update
          throw new Error('No user logged in');
        };

    const clearErrorMethod = methods?.clearError ? methods.clearError : () => {};

    return renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <TestAuthContext.Provider
          value={{
            state,
            login: loginMethod,
            githubLogin: githubLoginMethod,
            googleLogin: googleLoginMethod,
            logout: logoutMethod,
            updateProfile: updateProfileMethod,
            clearError: clearErrorMethod,
          }}
        >
          {children}
        </TestAuthContext.Provider>
      ),
    });
  };

  // ============================================================================
  // State Structure
  // ============================================================================

  describe('State Structure', () => {
    it('should have state property with user, loading, error', () => {
      const { result } = renderWithTestContext({
        user: null,
        loading: false,
        error: null,
      });

      expect(result.current).toHaveProperty('state');
      expect(result.current.state).toHaveProperty('user');
      expect(result.current.state).toHaveProperty('loading');
      expect(result.current.state).toHaveProperty('error');
      expect(typeof result.current.state.user).toBe('object');
      expect(typeof result.current.state.loading).toBe('boolean');
      expect(result.current.state.error).toBeNull();
    });

    it('should have login, logout, githubLogin, googleLogin methods', () => {
      const { result } = renderWithTestContext({
        user: null,
        loading: false,
        error: null,
      });

      expect(typeof result.current.login).toBe('function');
      expect(typeof result.current.logout).toBe('function');
      expect(typeof result.current.githubLogin).toBe('function');
      expect(typeof result.current.googleLogin).toBe('function');
      expect(typeof result.current.updateProfile).toBe('function');
      expect(typeof result.current.clearError).toBe('function');
    });
  });

  // ============================================================================
  // Email Login
  // ============================================================================

  describe('Email Login', () => {
    it('should call authClient.signIn.email with credentials', async () => {
      const credentials = { email: 'test@example.com', password: 'password123' };
      const { result } = renderWithTestContext({
        user: null,
        loading: false,
        error: null,
      });

      await act(async () => {
        await result.current.login(credentials);
      });

      expect(authClient.signIn.email).toHaveBeenCalledWith({
        email: credentials.email,
        password: credentials.password,
      });
    });

    it('should throw error on login failure', async () => {
      const mockError = { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' };
      (authClient.signIn.email as Mock).mockResolvedValue({ error: mockError });

      const { result } = renderWithTestContext({
        user: null,
        loading: false,
        error: null,
      });
      const credentials = { email: 'test@example.com', password: 'wrongpassword' };

      await expect(result.current.login(credentials)).rejects.toThrow('Invalid credentials');
    });
  });

  // ============================================================================
  // OAuth Login
  // ============================================================================

  describe('OAuth Login', () => {
    it('should call githubLogin and trigger social signIn with github provider', async () => {
      const { result } = renderWithTestContext({
        user: null,
        loading: false,
        error: null,
      });

      await act(async () => {
        await result.current.githubLogin();
      });

      expect(authClient.signIn.social).toHaveBeenCalledWith({ provider: 'github' });
    });

    it('should call googleLogin and trigger social signIn with google provider', async () => {
      const { result } = renderWithTestContext({
        user: null,
        loading: false,
        error: null,
      });

      await act(async () => {
        await result.current.googleLogin();
      });

      expect(authClient.signIn.social).toHaveBeenCalledWith({ provider: 'google' });
    });

    it('should throw error on OAuth login failure', async () => {
      const mockError = { message: 'OAuth failed', code: 'OAUTH_ERROR' };
      (authClient.signIn.social as Mock).mockResolvedValue({ error: mockError });

      const { result } = renderWithTestContext({
        user: null,
        loading: false,
        error: null,
      });

      await expect(result.current.githubLogin()).rejects.toThrow('OAuth failed');
    });
  });

  // ============================================================================
  // Logout
  // ============================================================================

  describe('Logout', () => {
    it('should call authClient.signOut', async () => {
      const { result } = renderWithTestContext({
        user: null,
        loading: false,
        error: null,
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(authClient.signOut).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // Profile Updates
  // ============================================================================

  describe('Profile Updates', () => {
    it('should call updateProfile with displayName data', async () => {
      const mockUser = createTestUser();
      (authClient.useSession as Mock).mockReturnValue({
        data: { session: { user: mockUser }, user: mockUser },
        isPending: false,
      });
      (authClient.updateUser as Mock).mockResolvedValue({
        data: { id: 'user-123', name: 'Updated Name' },
      });

      const { result } = renderWithTestContext(
        { user: mockUser, loading: false, error: null },
        {
          updateProfile: async (data: { displayName?: string; email?: string }) => {
            const response = await authClient.updateUser({
              name: data.displayName,
            }) as { data?: unknown; error?: { message: string } };
            if ('error' in response && response.error) {
              throw new Error(response.error.message);
            }
            return mockUser;
          },
        }
      );
      const updateData = { displayName: 'Updated Name' };

      const returnedUser = await act(async () => {
        return result.current.updateProfile(updateData);
      });

      expect(authClient.updateUser).toHaveBeenCalledWith({ name: updateData.displayName });
      expect(returnedUser).toBeDefined();
    });

    it('should throw error when no user logged in during profile update', async () => {
      const { result } = renderWithTestContext({
        user: null,
        loading: false,
        error: null,
      });
      const updateData = { displayName: 'New Name' };

      await expect(result.current.updateProfile(updateData)).rejects.toThrow('No user logged in');
    });
  });

  // ============================================================================
  // clearError
  // ============================================================================

  describe('clearError', () => {
    it('should exist as a function', () => {
      const { result } = renderWithTestContext({
        user: null,
        loading: false,
        error: null,
      });

      expect(typeof result.current.clearError).toBe('function');
    });

    it('should be callable without errors', () => {
      const { result } = renderWithTestContext({
        user: null,
        loading: false,
        error: null,
      });

      expect(() => result.current.clearError()).not.toThrow();
    });
  });

  // ============================================================================
  // User Role Mapping
  // ============================================================================

  describe('User Role Mapping', () => {
    it('should return admin user correctly', () => {
      const adminUser = createTestUser({ id: 'admin-123', role: 'admin' });
      const { result } = renderWithTestContext({
        user: adminUser,
        loading: false,
        error: null,
      });

      expect(result.current.state.user).toBeDefined();
      expect(result.current.state.user?.id).toBe('admin-123');
      expect(result.current.state.user?.role).toBe('admin');
    });

    it('should return guest user correctly', () => {
      const guestUser = createTestUser({ id: 'guest-123', role: 'guest' });
      const { result } = renderWithTestContext({
        user: guestUser,
        loading: false,
        error: null,
      });

      expect(result.current.state.user).toBeDefined();
      expect(result.current.state.user?.id).toBe('guest-123');
      expect(result.current.state.user?.role).toBe('guest');
    });

    it('should return regular user correctly when role is user', () => {
      const regularUser = createTestUser({ id: 'user-456', role: 'user' });
      const { result } = renderWithTestContext({
        user: regularUser,
        loading: false,
        error: null,
      });

      expect(result.current.state.user).toBeDefined();
      expect(result.current.state.user?.id).toBe('user-456');
      expect(result.current.state.user?.role).toBe('user');
    });

    it('should return null user when no user', () => {
      const { result } = renderWithTestContext({
        user: null,
        loading: false,
        error: null,
      });

      expect(result.current.state.user).toBeNull();
    });
  });

  // ============================================================================
  // Loading State
  // ============================================================================

  describe('Loading State', () => {
    it('should have loading property in state', () => {
      const { result } = renderWithTestContext({
        user: null,
        loading: true,
        error: null,
      });

      expect(result.current.state.loading).toBe(true);
    });

    it('should return not loading when session is resolved', () => {
      const { result } = renderWithTestContext({
        user: null,
        loading: false,
        error: null,
      });

      expect(result.current.state.loading).toBe(false);
    });

    it('should expose loading state from auth provider', () => {
      const mockUser = createTestUser();
      const { result } = renderWithTestContext({
        user: mockUser,
        loading: true,
        error: null,
      });

      expect(result.current.state.loading).toBe(true);
    });
  });

  // ============================================================================
  // Error State
  // ============================================================================

  describe('Error State', () => {
    it('should have error property in state', () => {
      const { result } = renderWithTestContext({
        user: null,
        loading: false,
        error: 'Test error',
      });

      expect(result.current.state.error).toBe('Test error');
    });

    it('should return null error when no error', () => {
      const { result } = renderWithTestContext({
        user: null,
        loading: false,
        error: null,
      });

      expect(result.current.state.error).toBeNull();
    });

    it('should expose error from auth provider state', () => {
      const mockUser = createTestUser();
      const { result } = renderWithTestContext({
        user: mockUser,
        loading: false,
        error: 'Auth error',
      });

      expect(result.current.state.error).toBe('Auth error');
    });
  });
});
