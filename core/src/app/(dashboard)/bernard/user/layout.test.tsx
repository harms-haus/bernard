// core/src/app/(dashboard)/bernard/user/layout.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import UserSectionLayout from './layout';
import { AuthTestProvider, RouterTestProvider } from '@/test/providers';

// ============================================================================
// Mock useAuth
// ============================================================================

const createMockUseAuth = (overrides: {
  user?: {
    id: string;
    displayName: string;
    email: string;
    role: 'admin' | 'user' | 'guest';
    status: 'active' | 'disabled' | 'deleted';
    createdAt: string;
    updatedAt: string;
  } | null;
  loading?: boolean;
  error?: string | null;
} = {}) => ({
  state: {
    user: overrides.user || null,
    loading: overrides.loading || false,
    error: overrides.error || null,
  },
  login: vi.fn(),
  githubLogin: vi.fn(),
  googleLogin: vi.fn(),
  logout: vi.fn(),
  updateProfile: vi.fn(),
  clearError: vi.fn(),
});

let mockUseAuthResult = createMockUseAuth();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuthResult,
}));

// ============================================================================
// Mock useRouter
// ============================================================================

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

// ============================================================================
// Mock UserLayout
// ============================================================================

vi.mock('@/components/UserLayout', () => ({
  UserLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="user-layout">{children}</div>
  ),
}));

// ============================================================================
// Test Setup
// ============================================================================

const renderUserSectionLayout = (authOverrides: {
  user?: {
    id: string;
    displayName: string;
    email: string;
    role: 'admin' | 'user' | 'guest';
    status: 'active' | 'disabled' | 'deleted';
    createdAt: string;
    updatedAt: string;
  } | null;
  loading?: boolean;
  error?: string | null;
} = {}) => {
  mockUseAuthResult = createMockUseAuth(authOverrides);

  return render(
    <AuthTestProvider
      value={{
        state: mockUseAuthResult.state,
        login: mockUseAuthResult.login,
        githubLogin: mockUseAuthResult.githubLogin,
        googleLogin: mockUseAuthResult.googleLogin,
        logout: mockUseAuthResult.logout,
        updateProfile: mockUseAuthResult.updateProfile,
        clearError: mockUseAuthResult.clearError,
      }}
    >
      <RouterTestProvider router={{ replace: mockReplace }}>
        <UserSectionLayout>
          <div data-testid="child-content">Child Content</div>
        </UserSectionLayout>
      </RouterTestProvider>
    </AuthTestProvider>
  );
};

// ============================================================================
// Test Cases
// ============================================================================

describe('UserSectionLayout', () => {
  beforeEach(() => {
    mockUseAuthResult = createMockUseAuth();
    mockReplace.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });
  describe('redirects unauthenticated users', () => {
    it('should redirect to login when user is not authenticated', () => {
      renderUserSectionLayout({ user: null, loading: false });

      expect(mockReplace).toHaveBeenCalledWith('/auth/login');
    });

    it('should not render children when unauthenticated', () => {
      renderUserSectionLayout({ user: null, loading: false });

      expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
    });
  });

  describe('renders children when authenticated', () => {
    it('should render children when user is authenticated', () => {
      const mockUser = {
        id: '123',
        displayName: 'Test User',
        email: 'test@example.com',
        role: 'user' as const,
        status: 'active' as const,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      renderUserSectionLayout({ user: mockUser, loading: false });

      expect(screen.getByText('Child Content')).toBeInTheDocument();
    });

    it('should not redirect when user is authenticated', () => {
      const mockUser = {
        id: '123',
        displayName: 'Test User',
        email: 'test@example.com',
        role: 'user' as const,
        status: 'active' as const,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      renderUserSectionLayout({ user: mockUser, loading: false });

      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe('shows loading state', () => {
    it('should return null while loading', () => {
      const { container } = renderUserSectionLayout({ user: null, loading: true });

      // Component returns null when loading
      expect(container.innerHTML).toBe('');
    });

    it('should not redirect while loading', () => {
      renderUserSectionLayout({ user: null, loading: true });

      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('should not render children while loading', () => {
      renderUserSectionLayout({ user: null, loading: true });

      expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
    });
  });
});