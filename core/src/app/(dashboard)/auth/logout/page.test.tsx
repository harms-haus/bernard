// core/src/app/(dashboard)/auth/logout/page.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

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
// Import after mocking
// ============================================================================

import { RouterTestProvider } from '@/test/providers';

// Import the LogoutPage component for testing
const LogoutPage = (await import('./page')).default;

// ============================================================================
// Test Setup
// ============================================================================

describe('LogoutPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
    mockSignOut.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderLogoutPage = () => {
    return render(
      <RouterTestProvider router={{ push: mockPush }}>
        <LogoutPage />
      </RouterTestProvider>
    );
  };

  // ============================================================================
  // Test 1.2.1: Auto-Logout on Mount
  // ============================================================================

  describe('Auto Logout', () => {
    it('should call signOut on mount', async () => {
      mockSignOut.mockResolvedValue(undefined);
      renderLogoutPage();
      // Wait for useEffect to run (it's async)
      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledTimes(1);
      }, { timeout: 2000 });
    });

    it('should only call signOut once per render cycle', async () => {
      mockSignOut.mockResolvedValue(undefined);
      renderLogoutPage();
      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledTimes(1);
      }, { timeout: 2000 });
    });
  });

  // ============================================================================
  // Test 1.2.2: Loading State
  // ============================================================================

  describe('Loading State', () => {
    it('should display loading spinner', () => {
      renderLogoutPage();
      // Component uses animate-spin class for spinner
      const spinner = document.body.querySelector('.animate-spin');
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
      mockSignOut.mockImplementation((options?: any) => {
        // Simulate the onSuccess callback being called
        if (options?.fetchOptions?.onSuccess) {
          options.fetchOptions.onSuccess();
        }
        return Promise.resolve();
      });
      renderLogoutPage();
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/auth/login');
      }, { timeout: 2000 });
    });
  });

  // ============================================================================
  // Test 1.2.4: Error Handling
  // ============================================================================

  describe('Error Handling', () => {
    it('should NOT crash if signOut rejects', async () => {
      // Suppress console.error for this test since we're testing error handling
      const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockSignOut.mockRejectedValue(new Error('Signout failed'));
      expect(() => renderLogoutPage()).not.toThrow();
      await waitFor(() => {
        expect(screen.getByText(/signing out/i)).toBeInTheDocument();
      }, { timeout: 2000 });
      // Clean up the console.error mock
      consoleErrorMock.mockRestore();
    });

    it('should handle signOut callback error', async () => {
      mockSignOut.mockImplementation((options?: any) => {
        if (options?.fetchOptions?.onError) {
          options.fetchOptions.onError({ message: 'Signout failed' });
        }
        return Promise.resolve();
      });
      renderLogoutPage();
      await waitFor(() => {
        // Should still call signOut
        expect(mockSignOut).toHaveBeenCalled();
      }, { timeout: 2000 });
    });

    it('should handle signOut without callback gracefully', async () => {
      mockSignOut.mockImplementation((options?: any) => {
        // Simulate the onSuccess callback being called
        if (options?.fetchOptions?.onSuccess) {
          options.fetchOptions.onSuccess();
        }
        return Promise.resolve();
      });
      renderLogoutPage();
      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith('/auth/login');
      }, { timeout: 2000 });
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
