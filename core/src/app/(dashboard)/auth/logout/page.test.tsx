// core/src/app/(dashboard)/auth/logout/page.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import LogoutPage from './page';
import { RouterTestProvider } from '@/test/providers';

// ============================================================================
// Mock authClient
// ============================================================================

const mockSignOut = vi.fn();

vi.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    signOut: mockSignOut,
  },
}));

// ============================================================================
// Mock next/navigation
// ============================================================================

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// ============================================================================
// Test Setup
// ============================================================================

const renderLogoutPage = () => {
  return render(
    <RouterTestProvider router={{ push: mockPush }}>
      <LogoutPage />
    </RouterTestProvider>
  );
};

describe('LogoutPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
    mockSignOut.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Test 1.2.1: Auto-Logout on Mount
  // ============================================================================

  describe('Auto Logout', () => {
    it('should call signOut on mount', async () => {
      mockSignOut.mockResolvedValue(undefined);

      renderLogoutPage();

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledTimes(1);
      });
    });

    it('should only call signOut once', async () => {
      mockSignOut.mockResolvedValue(undefined);

      const { unmount } = renderLogoutPage();

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledTimes(1);
      });

      // Unmount and remount - should not call signOut again
      unmount();
      renderLogoutPage();

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ============================================================================
  // Test 1.2.2: Loading State
  // ============================================================================

  describe('Loading State', () => {
    it('should display loading spinner', () => {
      renderLogoutPage();

      const spinner = screen.queryByRole('status') ?? screen.getByTestId('loading-spinner');
      expect(spinner).toBeInTheDocument();
    });

    it('should show signing out text', () => {
      renderLogoutPage();

      expect(screen.getByText(/signing out/i)).toBeInTheDocument();
    });
  });

  // ============================================================================
  // Test 1.2.3: Success Redirect
  // ============================================================================

  describe('Success Redirect', () => {
    it('should redirect to /auth/login on success', async () => {
      mockSignOut.mockResolvedValue(undefined);

      renderLogoutPage();

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/auth/login');
      });
    });
  });

  // ============================================================================
  // Test 1.2.4: Error Handling (NEW - Critical Gap)
  // ============================================================================

  describe('Error Handling', () => {
    it('should NOT crash if signOut rejects', async () => {
      mockSignOut.mockRejectedValue(new Error('Signout failed'));

      // Should not throw
      expect(() => renderLogoutPage()).not.toThrow();

      // Component should still render loading state
      await waitFor(() => {
        expect(screen.getByText(/signing out/i)).toBeInTheDocument();
      });
    });

    it('should handle signOut callback error', async () => {
      // Mock signOut with callback that errors
      mockSignOut.mockImplementation((options?: any) => {
        if (options?.fetchOptions?.onError) {
          options.fetchOptions.onError({ message: 'Signout failed' });
        }
        return Promise.resolve();
      });

      renderLogoutPage();

      await waitFor(() => {
        // Should still attempt redirect
        expect(mockPush).toHaveBeenCalled();
      });
    });

    it('should handle signOut without callback gracefully', async () => {
      mockSignOut.mockResolvedValue(undefined);

      renderLogoutPage();

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith('/auth/login');
      });
    });
  });

  // ============================================================================
  // Additional Tests
  // ============================================================================

  describe('Component Structure', () => {
    it('should render with correct layout classes', () => {
      renderLogoutPage();

      const container = screen.getByText(/signing out/i).closest('div');
      expect(container).toHaveClass('flex', 'flex-col', 'items-center');
    });

    it('should render spinner with correct styling', () => {
      renderLogoutPage();

      const spinner = document.body.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });
});
