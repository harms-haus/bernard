import { createContext, useContext, ReactNode, useMemo } from 'react';
import type { User } from '@/types/auth';
import { vi, type Mock } from 'vitest';

export interface MockAuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export interface MockAuthContextType {
  state: MockAuthState;
  login: Mock;
  githubLogin: Mock;
  googleLogin: Mock;
  logout: Mock;
  getCurrentUser: Mock;
  updateProfile: Mock;
  clearError: Mock;
}

const MockAuthContext = createContext<MockAuthContextType | undefined>(undefined);

const mockAuthContextContainer: { current: MockAuthContextType } = {
  current: {
    state: { user: null, loading: false, error: null },
    login: vi.fn().mockResolvedValue(undefined),
    githubLogin: vi.fn().mockResolvedValue(undefined),
    googleLogin: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    getCurrentUser: vi.fn().mockResolvedValue(null),
    updateProfile: vi.fn().mockResolvedValue({
      id: 'test-user-id',
      displayName: 'Test User',
      isAdmin: false,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    clearError: vi.fn(),
  },
};

export { mockAuthContextContainer };

export function createMockAuthContext(overrides: Partial<MockAuthContextType> = {}): MockAuthContextType {
  const defaultUser: User = {
    id: 'test-user-id',
    displayName: 'Test User',
    isAdmin: false,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    state: { user: null, loading: false, error: null },
    login: vi.fn().mockResolvedValue(undefined),
    githubLogin: vi.fn().mockResolvedValue(undefined),
    googleLogin: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    getCurrentUser: vi.fn().mockResolvedValue(null),
    updateProfile: vi.fn().mockResolvedValue(defaultUser),
    clearError: vi.fn(),
    ...overrides,
  };
}

const defaultMockAuthContext = createMockAuthContext();

export function MockAuthProvider({ 
  children, 
  value 
}: { 
  children: ReactNode;
  value?: MockAuthContextType;
}) {
  const contextValue = useMemo(
    () => value ?? defaultMockAuthContext, 
    [value]
  );
  return (
    <MockAuthContext.Provider value={contextValue}>
      {children}
    </MockAuthContext.Provider>
  );
}

export function useMockAuthContext() {
  const context = useContext(MockAuthContext);
  if (!context) {
    throw new Error('useMockAuthContext must be used within MockAuthProvider');
  }
  return context;
}

// Helper to create a mock user for testing
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'test-user-id',
    displayName: 'Test User',
    isAdmin: false,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// Helper to create an admin user for testing
export function createMockAdminUser(overrides: Partial<User> = {}): User {
  return {
    ...createMockUser({ isAdmin: true }),
    ...overrides,
  };
}
