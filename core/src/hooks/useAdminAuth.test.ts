// core/src/hooks/useAdminAuth.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAdminAuth } from './useAdminAuth';
import type { User } from '@/types/auth';

// ============================================================================
// Mock useAuth
// ============================================================================

vi.mock('./useAuth', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from './useAuth';

describe('useAdminAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Test 4.2.1: Admin Detection
  // ============================================================================

  describe('Admin Detection', () => {
    it('should return true for admin role', async () => {
      const adminUser: User = {
        id: 'admin-123',
        displayName: 'Admin User',
        email: 'admin@test.com',
        role: 'admin',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(useAuth).mockReturnValue({
        state: {
          user: adminUser,
          loading: false,
          error: null,
        },
        login: vi.fn(),
        githubLogin: vi.fn(),
        googleLogin: vi.fn(),
        logout: vi.fn(),
        updateProfile: vi.fn(),
        clearError: vi.fn(),
      });

      const { result } = renderHook(() => useAdminAuth());

      // Wait for useEffect to run
      await waitFor(() => {
        expect(result.current.isAdmin).toBe(true);
      });
    });

    it('should return false for user role', () => {
      const regularUser: User = {
        id: 'user-123',
        displayName: 'Regular User',
        email: 'user@test.com',
        role: 'user',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(useAuth).mockReturnValue({
        state: {
          user: regularUser,
          loading: false,
          error: null,
        },
        login: vi.fn(),
        githubLogin: vi.fn(),
        googleLogin: vi.fn(),
        logout: vi.fn(),
        updateProfile: vi.fn(),
        clearError: vi.fn(),
      });

      const { result } = renderHook(() => useAdminAuth());

      expect(result.current.isAdmin).toBe(false);
    });

    it('should return false for null user', () => {
      vi.mocked(useAuth).mockReturnValue({
        state: {
          user: null,
          loading: false,
          error: null,
        },
        login: vi.fn(),
        githubLogin: vi.fn(),
        googleLogin: vi.fn(),
        logout: vi.fn(),
        updateProfile: vi.fn(),
        clearError: vi.fn(),
      });

      const { result } = renderHook(() => useAdminAuth());

      expect(result.current.isAdmin).toBe(false);
    });

    it('should return false for guest role', () => {
      const guestUser: User = {
        id: 'guest-123',
        displayName: 'Guest User',
        email: 'guest@test.com',
        role: 'guest',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(useAuth).mockReturnValue({
        state: {
          user: guestUser,
          loading: false,
          error: null,
        },
        login: vi.fn(),
        githubLogin: vi.fn(),
        googleLogin: vi.fn(),
        logout: vi.fn(),
        updateProfile: vi.fn(),
        clearError: vi.fn(),
      });

      const { result } = renderHook(() => useAdminAuth());

      expect(result.current.isAdmin).toBe(false);
    });
  });

  // ============================================================================
  // Test 4.2.2: Loading State
  // ============================================================================

  describe('Loading State', () => {
    it('should return isAdminLoading true during auth loading', async () => {
      vi.mocked(useAuth).mockReturnValue({
        state: {
          user: null,
          loading: true,
          error: null,
        },
        login: vi.fn(),
        githubLogin: vi.fn(),
        googleLogin: vi.fn(),
        logout: vi.fn(),
        updateProfile: vi.fn(),
        clearError: vi.fn(),
      });

      const { result } = renderHook(() => useAdminAuth());

      await waitFor(() => {
        expect(result.current.isAdminLoading).toBe(true);
        expect(result.current.isAdmin).toBe(false);
      });
    });

    it('should return isAdminLoading false when not loading', () => {
      const regularUser: User = {
        id: 'user-123',
        displayName: 'Regular User',
        email: 'user@test.com',
        role: 'user',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(useAuth).mockReturnValue({
        state: {
          user: regularUser,
          loading: false,
          error: null,
        },
        login: vi.fn(),
        githubLogin: vi.fn(),
        googleLogin: vi.fn(),
        logout: vi.fn(),
        updateProfile: vi.fn(),
        clearError: vi.fn(),
      });

      const { result } = renderHook(() => useAdminAuth());

      expect(result.current.isAdminLoading).toBe(false);
    });

    it('should return isAdminLoading false when has error', async () => {
      vi.mocked(useAuth).mockReturnValue({
        state: {
          user: null,
          loading: true,
          error: 'Auth failed',
        },
        login: vi.fn(),
        githubLogin: vi.fn(),
        googleLogin: vi.fn(),
        logout: vi.fn(),
        updateProfile: vi.fn(),
        clearError: vi.fn(),
      });

      const { result } = renderHook(() => useAdminAuth());

      await waitFor(() => {
        expect(result.current.isAdminLoading).toBe(false);
      });
    });
  });

  // ============================================================================
  // Test 4.2.3: State Passthrough
  // ============================================================================

  describe('State Passthrough', () => {
    it('should return user from useAuth', async () => {
      const regularUser: User = {
        id: 'user-123',
        displayName: 'Regular User',
        email: 'user@test.com',
        role: 'user',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(useAuth).mockReturnValue({
        state: {
          user: regularUser,
          loading: false,
          error: null,
        },
        login: vi.fn(),
        githubLogin: vi.fn(),
        googleLogin: vi.fn(),
        logout: vi.fn(),
        updateProfile: vi.fn(),
        clearError: vi.fn(),
      });

      const { result } = renderHook(() => useAdminAuth());

      await waitFor(() => {
        expect(result.current.user).toEqual(regularUser);
      });
    });

    it('should return error from useAuth', async () => {
      vi.mocked(useAuth).mockReturnValue({
        state: {
          user: null,
          loading: false,
          error: 'Auth failed',
        },
        login: vi.fn(),
        githubLogin: vi.fn(),
        googleLogin: vi.fn(),
        logout: vi.fn(),
        updateProfile: vi.fn(),
        clearError: vi.fn(),
      });

      const { result } = renderHook(() => useAdminAuth());

      await waitFor(() => {
        expect(result.current.error).toBe('Auth failed');
      });
    });

    it('should return loading from useAuth', async () => {
      vi.mocked(useAuth).mockReturnValue({
        state: {
          user: null,
          loading: true,
          error: null,
        },
        login: vi.fn(),
        githubLogin: vi.fn(),
        googleLogin: vi.fn(),
        logout: vi.fn(),
        updateProfile: vi.fn(),
        clearError: vi.fn(),
      });

      const { result } = renderHook(() => useAdminAuth());

      await waitFor(() => {
        expect(result.current.loading).toBe(true);
      });
    });
  });

  // ============================================================================
  // Additional Tests
  // ============================================================================

  describe('Return Type', () => {
    it('should return all expected properties', async () => {
      const regularUser: User = {
        id: 'user-123',
        displayName: 'Regular User',
        email: 'user@test.com',
        role: 'user',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(useAuth).mockReturnValue({
        state: {
          user: regularUser,
          loading: false,
          error: null,
        },
        login: vi.fn(),
        githubLogin: vi.fn(),
        googleLogin: vi.fn(),
        logout: vi.fn(),
        updateProfile: vi.fn(),
        clearError: vi.fn(),
      });

      const { result } = renderHook(() => useAdminAuth());

      await waitFor(() => {
        expect(result.current).toHaveProperty('isAdmin');
        expect(result.current).toHaveProperty('isAdminLoading');
        expect(result.current).toHaveProperty('user');
        expect(result.current).toHaveProperty('error');
        expect(result.current).toHaveProperty('loading');
      });
    });
  });

  // ============================================================================
  // Gap Tests: Derived State & Edge Cases
  // ============================================================================

  describe('isAdminLoading State', () => {
    it('should derive isAdminLoading from state.loading', async () => {
      vi.mocked(useAuth).mockReturnValue({
        state: { user: null, loading: true, error: null },
        login: vi.fn(),
        githubLogin: vi.fn(),
        googleLogin: vi.fn(),
        logout: vi.fn(),
        updateProfile: vi.fn(),
        clearError: vi.fn(),
      });

      const { result } = renderHook(() => useAdminAuth());

      await waitFor(() => {
        expect(result.current.isAdminLoading).toBe(true);
      });
    });

    it('should be false when loading is false and user exists', async () => {
      const mockUser: User = {
        id: '123',
        displayName: 'User',
        email: 'user@test.com',
        role: 'user',
        status: 'active',
        createdAt: '',
        updatedAt: '',
      };

      vi.mocked(useAuth).mockReturnValue({
        state: { user: mockUser, loading: false, error: null },
        login: vi.fn(),
        githubLogin: vi.fn(),
        googleLogin: vi.fn(),
        logout: vi.fn(),
        updateProfile: vi.fn(),
        clearError: vi.fn(),
      });

      const { result } = renderHook(() => useAdminAuth());

      await waitFor(() => {
        expect(result.current.isAdminLoading).toBe(false);
      });
    });
  });

  describe('user Property', () => {
    it('should return user from auth state', async () => {
      const mockUser: User = {
        id: '123',
        displayName: 'Admin',
        email: 'admin@test.com',
        role: 'admin',
        status: 'active',
        createdAt: '',
        updatedAt: '',
      };

      vi.mocked(useAuth).mockReturnValue({
        state: { user: mockUser, loading: false, error: null },
        login: vi.fn(),
        githubLogin: vi.fn(),
        googleLogin: vi.fn(),
        logout: vi.fn(),
        updateProfile: vi.fn(),
        clearError: vi.fn(),
      });

      const { result } = renderHook(() => useAdminAuth());

      await waitFor(() => {
        expect(result.current.user).toBe(mockUser);
      });
    });

    it('should return null when no user', async () => {
      vi.mocked(useAuth).mockReturnValue({
        state: { user: null, loading: false, error: null },
        login: vi.fn(),
        githubLogin: vi.fn(),
        googleLogin: vi.fn(),
        logout: vi.fn(),
        updateProfile: vi.fn(),
        clearError: vi.fn(),
      });

      const { result } = renderHook(() => useAdminAuth());

      await waitFor(() => {
        expect(result.current.user).toBeNull();
      });
    });
  });

  describe('error Property', () => {
    it('should return error from auth state', async () => {
      vi.mocked(useAuth).mockReturnValue({
        state: { user: null, loading: false, error: 'Auth failed' },
        login: vi.fn(),
        githubLogin: vi.fn(),
        googleLogin: vi.fn(),
        logout: vi.fn(),
        updateProfile: vi.fn(),
        clearError: vi.fn(),
      });

      const { result } = renderHook(() => useAdminAuth());

      await waitFor(() => {
        expect(result.current.error).toBe('Auth failed');
      });
    });
  });

  describe('loading Property', () => {
    it('should return state.loading', async () => {
      vi.mocked(useAuth).mockReturnValue({
        state: { user: null, loading: true, error: null },
        login: vi.fn(),
        githubLogin: vi.fn(),
        googleLogin: vi.fn(),
        logout: vi.fn(),
        updateProfile: vi.fn(),
        clearError: vi.fn(),
      });

      const { result } = renderHook(() => useAdminAuth());

      await waitFor(() => {
        expect(result.current.loading).toBe(true);
      });
    });
  });

  describe('isAdminLoading Edge Cases', () => {
    it('should be true when no user and no error', async () => {
      vi.mocked(useAuth).mockReturnValue({
        state: { user: null, loading: false, error: null },
        login: vi.fn(),
        githubLogin: vi.fn(),
        googleLogin: vi.fn(),
        logout: vi.fn(),
        updateProfile: vi.fn(),
        clearError: vi.fn(),
      });

      const { result } = renderHook(() => useAdminAuth());

      await waitFor(() => {
        expect(result.current.isAdminLoading).toBe(true);
      });
    });
  });
});
