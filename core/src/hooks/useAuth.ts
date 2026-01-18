"use client";

import React, { createContext, useCallback, useContext, useMemo, useState, useEffect, useRef, ReactNode } from 'react';
import { authClient } from '@/lib/auth/auth-client';
import { User } from '@/types/auth';
import { AuthState, LoginCredentials } from '../types/auth';

type AuthContextType = {
  state: AuthState;
  login: (credentials: LoginCredentials) => Promise<void>;
  githubLogin: () => Promise<void>;
  googleLogin: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: { displayName?: string; email?: string }) => Promise<User>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Export AuthContext for testing purposes to enable wrapping with AuthContext.Provider
export { AuthContext };

// ============================================================================
// Test Auth Context (for testing only - defined here to avoid test/prod coupling)
// ============================================================================

export type TestAuthContextType = {
  state: {
    user: User | null;
    loading: boolean;
    error: string | null;
  };
  login?: (credentials: LoginCredentials) => Promise<void>;
  githubLogin?: () => Promise<void>;
  googleLogin?: () => Promise<void>;
  logout?: () => Promise<void>;
  updateProfile?: (data: { displayName?: string; email?: string }) => Promise<User>;
  clearError?: () => void;
};

const TestAuthContext = createContext<TestAuthContextType | undefined>(undefined);

// Export TestAuthContext for test providers
export { TestAuthContext };

type AuthProviderProps = {
  children: ReactNode;
};

/**
 * Map Better Auth user to our User type
 */
function mapBetterAuthUser(betterAuthUser: {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
} | null): User | null {
  if (!betterAuthUser) return null;

  return {
    id: betterAuthUser.id,
    displayName: betterAuthUser.name || betterAuthUser.email?.split('@')[0] || 'User',
    email: betterAuthUser.email ?? '',
    role: (betterAuthUser.role as User['role']) || 'user',
    status: 'active',
    createdAt: betterAuthUser.createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: betterAuthUser.updatedAt?.toISOString() || new Date().toISOString(),
  };
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { data: session, isPending, error } = authClient.useSession();

  // Fallback session detection - try to fetch session directly if hook doesn't work
  const [fallbackSession, setFallbackSession] = useState<{ data: unknown } | null>(null);
  const [fallbackError, setFallbackError] = useState<string | null>(null);
  const prevSessionRef = useRef<string>('');

  useEffect(() => {
    // If useSession doesn't return a session after a delay, try fallback
    if (isPending && !session) {
      const timer = setTimeout(async () => {
        try {
          const response = await fetch('/api/auth/get-session', {
            method: 'GET',
            credentials: 'include',
          });

          if (response.ok) {
            const data = await response.json();
            if (data.session) {
              setFallbackSession({ data: data.session });
            }
          }
        } catch (err) {
          setFallbackError(err instanceof Error ? err.message : 'Failed to fetch session');
        }
      }, 1000); // Wait 1 second before trying fallback

      return () => clearTimeout(timer);
    }
  }, [isPending, session]);

  // Use Better Auth session if available, otherwise use fallback
  const activeSession = session || fallbackSession;
  const activeError = error?.message || fallbackError;
  const activeLoading = isPending && !fallbackSession;

  const userData = ((activeSession as { session?: { user?: unknown } })?.session?.user) ||
    ((activeSession as { user?: unknown })?.user);
  const computedUser = userData ? mapBetterAuthUser(userData as Parameters<typeof mapBetterAuthUser>[0]) : null;

  const [state, setState] = useState<AuthState>(() => ({
    user: computedUser,
    loading: activeLoading,
    error: activeError,
  }));

  // Track previous state to avoid unnecessary updates
  useEffect(() => {
    const newStateKey = `${computedUser?.id || 'no-user'}-${activeLoading}-${activeError || 'no-error'}`;
    if (prevSessionRef.current !== newStateKey) {
      prevSessionRef.current = newStateKey;
      setState({
        user: computedUser,
        loading: activeLoading,
        error: activeError,
      });
    }
  }, [computedUser, activeLoading, activeError]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const { error } = await authClient.signIn.email({
      email: credentials.email,
      password: credentials.password,
    });

    if (error) {
      throw new Error(error.message || 'Login failed');
    }
  }, []);

  const githubLogin = useCallback(async () => {
    const { error } = await authClient.signIn.social({
      provider: 'github',
    });

    if (error) {
      throw new Error(error.message || 'GitHub login failed');
    }
  }, []);

  const googleLogin = useCallback(async () => {
    const { error } = await authClient.signIn.social({
      provider: 'google',
    });

    if (error) {
      throw new Error(error.message || 'Google login failed');
    }
  }, []);

  const logout = useCallback(async () => {
    await authClient.signOut();
  }, []);

  const updateProfile = useCallback(async (data: { displayName?: string; email?: string }) => {
    const currentUser = session?.user;
    if (!currentUser) {
      throw new Error('No user logged in');
    }

    type UpdateUserResponse = { data?: unknown; error?: { message: string } } | { status: boolean };
    const response = await authClient.updateUser({
      name: data.displayName,
    }) as UpdateUserResponse;

    if ('error' in response && response.error) {
      throw new Error(response.error.message || 'Failed to update profile');
    }

    return mapBetterAuthUser(currentUser)!;
  }, [session]);

  const clearError = useCallback(() => {
    // Better Auth handles errors differently, but we provide this for API compatibility
  }, []);

  const value = useMemo(
    () => ({
      state,
      login,
      githubLogin,
      googleLogin,
      logout,
      updateProfile,
      clearError,
    }),
    [state, login, githubLogin, googleLogin, logout, updateProfile, clearError]
  );

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  // Always call both context hooks at the top level (rules of hooks)
  const testContext = useContext(TestAuthContext);
  const context = useContext(AuthContext);

  // Check for test context first (used in test environment)
  if (testContext !== undefined) {
    // Adapt test context to AuthContextType
    return {
      state: {
        user: testContext.state.user as User | null,
        loading: testContext.state.loading,
        error: testContext.state.error,
      },
      login: testContext.login || (() => Promise.resolve()),
      githubLogin: testContext.githubLogin || (() => Promise.resolve()),
      googleLogin: testContext.googleLogin || (() => Promise.resolve()),
      logout: testContext.logout || (() => Promise.resolve()),
      updateProfile: testContext.updateProfile || (() => Promise.resolve({} as User)),
      clearError: testContext.clearError || (() => { }),
    };
  }

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
