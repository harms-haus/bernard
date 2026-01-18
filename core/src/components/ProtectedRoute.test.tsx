import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';

// ============================================
// HOISTED MOCKS (must be hoisted)
// ============================================
const mockUseRouter = vi.hoisted(() => vi.fn());
const mockUseSearchParams = vi.hoisted(() => vi.fn().mockReturnValue(new URLSearchParams()));

vi.mock('next/navigation', () => ({
  useRouter: mockUseRouter,
  useSearchParams: mockUseSearchParams,
}));

const mockState = vi.hoisted(() => ({
  user: null as { id: string; role: string } | null,
  loading: false,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ state: mockState }),
}));

// ============================================
// TEST COMPONENTS
// ============================================
function TestChild() {
  return <div data-testid="protected-content">Protected Content</div>;
}

// ============================================
// TEST SUITE
// ============================================
describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRouter.mockReturnValue({
      replace: vi.fn(),
      push: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    });
    // Reset to defaults
    mockState.user = null;
    mockState.loading = false;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Loading State', () => {
    it('shows loading spinner while auth is loading', () => {
      mockState.loading = true;

      render(
        <ProtectedRoute>
          <TestChild />
        </ProtectedRoute>
      );

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('does not render children while loading', () => {
      mockState.loading = true;

      render(
        <ProtectedRoute>
          <TestChild />
        </ProtectedRoute>
      );

      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
  });

  describe('Unauthenticated User', () => {
    it('redirects to login when user is null and not loading', () => {
      mockState.user = null;
      mockState.loading = false;

      // Mock window.location
      const originalLocation = window.location;
      try {
        delete (window as any).location;
        (window as any).location = { href: '', pathname: '/test' };

        render(
          <ProtectedRoute>
            <TestChild />
          </ProtectedRoute>
        );

        // Should redirect to auth/login
        expect((window as any).location.href).toContain('/auth/login');
      } finally {
        // Restore location
        (window as any).location = originalLocation;
      }
    });

    it('does not render children when unauthenticated', () => {
      mockState.user = null;
      mockState.loading = false;

      render(
        <ProtectedRoute>
          <TestChild />
        </ProtectedRoute>
      );

      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
  });

  describe('Authenticated User', () => {
    it('renders children when user is authenticated', () => {
      mockState.user = { id: '1', role: 'user' };
      mockState.loading = false;

      render(
        <ProtectedRoute>
          <TestChild />
        </ProtectedRoute>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('renders children when user has no role specified', () => {
      mockState.user = { id: '1', role: '' };
      mockState.loading = false;

      render(
        <ProtectedRoute>
          <TestChild />
        </ProtectedRoute>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
  });

  describe('Admin Access', () => {
    it('redirects non-admin user when requireAdmin is true', () => {
      mockState.user = { id: '1', role: 'user' };
      mockState.loading = false;

      const replaceMock = vi.fn();
      mockUseRouter.mockReturnValue({
        replace: replaceMock,
        push: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        refresh: vi.fn(),
        prefetch: vi.fn(),
      });

      render(
        <ProtectedRoute requireAdmin>
          <TestChild />
        </ProtectedRoute>
      );

      expect(replaceMock).toHaveBeenCalledWith('/');
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('renders children when user is admin', () => {
      mockState.user = { id: '1', role: 'admin' };
      mockState.loading = false;

      render(
        <ProtectedRoute requireAdmin>
          <TestChild />
        </ProtectedRoute>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('redirects when role is "administrator" instead of "admin"', () => {
      mockState.user = { id: '1', role: 'administrator' };
      mockState.loading = false;

      const replaceMock = vi.fn();
      mockUseRouter.mockReturnValue({
        replace: replaceMock,
        push: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        refresh: vi.fn(),
        prefetch: vi.fn(),
      });

      render(
        <ProtectedRoute requireAdmin>
          <TestChild />
        </ProtectedRoute>
      );

      // Should redirect because role is 'administrator', not 'admin'
      expect(replaceMock).toHaveBeenCalledWith('/');
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
  });

  describe('Without requireAdmin', () => {
    it('renders children for any authenticated user', () => {
      mockState.user = { id: '1', role: 'user' };
      mockState.loading = false;

      render(
        <ProtectedRoute>
          <TestChild />
        </ProtectedRoute>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('renders children for admin user', () => {
      mockState.user = { id: '1', role: 'admin' };
      mockState.loading = false;

      render(
        <ProtectedRoute>
          <TestChild />
        </ProtectedRoute>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined user gracefully', () => {
      (mockState as any).user = undefined;
      mockState.loading = false;

      render(
        <ProtectedRoute>
          <TestChild />
        </ProtectedRoute>
      );

      // Should NOT render because user is undefined (unauthenticated)
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('handles user object with missing role', () => {
      mockState.user = { id: '1' } as any;
      mockState.loading = false;

      render(
        <ProtectedRoute>
          <TestChild />
        </ProtectedRoute>
      );

      // Should render because user exists (no role means not admin)
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
  });
});
