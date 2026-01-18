// core/src/app/(dashboard)/bernard/user/profile/page.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// Import TestAuthContext from useAuth
const { TestAuthContext } = await import('@/hooks/useAuth');

// Mutable variable for test-specific auth overrides
let currentAuthOverrides: {
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
} = {};

const mockUpdateProfile = vi.fn();
const mockClearError = vi.fn();

const createMockUseAuth = (overrides: {
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
    user: overrides.user || {
      id: 'user-123',
      displayName: 'Test User',
      email: 'test@example.com',
      role: 'user',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    loading: overrides.loading || false,
    error: overrides.error || null,
  },
  updateProfile: mockUpdateProfile,
  clearError: mockClearError,
  login: vi.fn(),
  githubLogin: vi.fn(),
  googleLogin: vi.fn(),
  logout: vi.fn(),
});

// Create a getter function that always reads from currentAuthOverrides
const getMockAuth = () => createMockUseAuth(currentAuthOverrides);

vi.mock('@/hooks/useAuth', () => ({
  useAuth: getMockAuth,
}));

// ============================================================================
// Mock useDynamicHeader
// ============================================================================

const mockSetTitle = vi.fn();
const mockSetSubtitle = vi.fn();

vi.mock('@/components/dynamic-header', () => ({
  useDynamicHeader: () => ({
    setTitle: mockSetTitle,
    setSubtitle: mockSetSubtitle,
  }),
}));

// ============================================================================
// Test Setup
// ============================================================================

const renderProfilePage = async (authOverrides: {
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
} = {}) => {
  currentAuthOverrides = authOverrides as typeof currentAuthOverrides;

  const mockAuth = createMockUseAuth(authOverrides);

  // Re-import Profile to get fresh useAuth mock with updated currentAuthOverrides
  const ProfileModule = await import('./page');
  const Profile = ProfileModule.default;

  return render(
    <TestAuthContext.Provider
      value={{
        state: mockAuth.state,
        updateProfile: mockAuth.updateProfile,
        clearError: mockAuth.clearError,
        login: mockAuth.login,
        githubLogin: mockAuth.githubLogin,
        googleLogin: mockAuth.googleLogin,
        logout: mockAuth.logout,
      }}
    >
      <Profile />
    </TestAuthContext.Provider>
  );
};

describe('Profile Page', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockUpdateProfile.mockClear();
    mockClearError.mockClear();
    mockSetTitle.mockClear();
    mockSetSubtitle.mockClear();
    currentAuthOverrides = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Test 2.1.1: Initial Render
  // ============================================================================

  describe('Initial Render', () => {
    it('should display user email from auth state', async () => {
      await renderProfilePage({
        user: {
          id: 'user-123',
          displayName: 'Test User',
          email: 'test@example.com',
          role: 'user',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      expect(screen.getByLabelText(/email/i)).toHaveValue('test@example.com');
    });

    it('should display user display name', async () => {
      await renderProfilePage({
        user: {
          id: 'user-123',
          displayName: 'John Doe',
          email: 'john@example.com',
          role: 'user',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      expect(screen.getByLabelText(/display name/i)).toHaveValue('John Doe');
    });

    it('should show email as read-only', async () => {
      await renderProfilePage({
        user: {
          id: 'user-123',
          displayName: 'Test User',
          email: 'test@example.com',
          role: 'user',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      const emailInput = screen.getByLabelText(/email/i);
      expect(emailInput).toBeDisabled();
    });
  });

  // ============================================================================
  // Test 2.1.2: Profile Update
  // ============================================================================

  describe('Profile Updates', () => {
    it('should update displayName on input change', async () => {
      await renderProfilePage();

      const displayNameInput = screen.getByLabelText(/display name/i);
      fireEvent.change(displayNameInput, { target: { value: 'New Name' } });

      expect(displayNameInput).toHaveValue('New Name');
    });

    it('should call updateProfile on save', async () => {
      mockUpdateProfile.mockResolvedValue({});

      await renderProfilePage();

      const displayNameInput = screen.getByLabelText(/display name/i);
      fireEvent.change(displayNameInput, { target: { value: 'Updated Name' } });

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalledWith({
          displayName: 'Updated Name',
          email: 'test@example.com',
        });
      });
    });

    it('should show loading state during save', async () => {
      mockUpdateProfile.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

      await renderProfilePage();

      const displayNameInput = screen.getByLabelText(/display name/i);
      fireEvent.change(displayNameInput, { target: { value: 'Updated Name' } });

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(saveButton);

      // After clicking save, the button should be disabled and show "Saving..."
      const savingButton = screen.getByRole('button', { name: /saving/i });
      expect(savingButton).toBeInTheDocument();
    });

    it('should show success message after save', async () => {
      mockUpdateProfile.mockResolvedValue({});

      await renderProfilePage();

      const displayNameInput = screen.getByLabelText(/display name/i);
      fireEvent.change(displayNameInput, { target: { value: 'Updated Name' } });

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/profile updated successfully/i)).toBeInTheDocument();
      });
    });

    it('should clear success message when reset is clicked', async () => {
      mockUpdateProfile.mockResolvedValue({});

      await renderProfilePage();

      const displayNameInput = screen.getByLabelText(/display name/i);
      fireEvent.change(displayNameInput, { target: { value: 'Updated Name' } });

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(saveButton);

      // Wait for success message to appear
      await waitFor(() => {
        expect(screen.getByText(/profile updated successfully/i)).toBeInTheDocument();
      });

      // Clear the success message by clicking reset
      const resetButton = screen.getByRole('button', { name: /reset/i });
      fireEvent.click(resetButton);

      await waitFor(() => {
        expect(screen.queryByText(/profile updated successfully/i)).not.toBeInTheDocument();
      });
    });

    it('should show error message on save failure', async () => {
      // Set up mock to update auth state error when updateProfile is called
      let authError: string | null = null;
      const mockUpdateProfileWithError = vi.fn().mockImplementation(async () => {
        authError = 'Update failed';
        currentAuthOverrides.error = 'Update failed';
        throw new Error('Update failed');
      });
      mockUpdateProfile.mockImplementation(mockUpdateProfileWithError);

      // Render once with initial state
      const ProfileModule = await import('./page');
      const Profile = ProfileModule.default;
      const mockAuth = createMockUseAuth({ error: null });
      mockAuth.updateProfile = mockUpdateProfileWithError;

      const { rerender } = render(
        <TestAuthContext.Provider
          value={{
            state: { ...mockAuth.state, error: authError },
            updateProfile: mockAuth.updateProfile,
            clearError: mockAuth.clearError,
            login: mockAuth.login,
            githubLogin: mockAuth.githubLogin,
            googleLogin: mockAuth.googleLogin,
            logout: mockAuth.logout,
          }}
        >
          <Profile />
        </TestAuthContext.Provider>
      );

      const displayNameInput = screen.getByLabelText(/display name/i);
      fireEvent.change(displayNameInput, { target: { value: 'Updated Name' } });

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(saveButton);

      // Wait for updateProfile to be called and error to be set
      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalled();
      });

      // Update the context with error state (simulating auth hook update)
      rerender(
        <TestAuthContext.Provider
          value={{
            state: { ...mockAuth.state, error: 'Update failed' },
            updateProfile: mockAuth.updateProfile,
            clearError: mockAuth.clearError,
            login: mockAuth.login,
            githubLogin: mockAuth.githubLogin,
            googleLogin: mockAuth.googleLogin,
            logout: mockAuth.logout,
          }}
        >
          <Profile />
        </TestAuthContext.Provider>
      );

      // Wait for error to appear in UI
      await waitFor(() => {
        expect(screen.getByText(/update failed/i)).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // Test 2.1.3: Reset Functionality
  // ============================================================================

  describe('Reset Button', () => {
    it('should reset form to original values', async () => {
      const originalUser = {
        id: 'user-123',
        displayName: 'Original Name',
        email: 'test@example.com',
        role: 'user' as const,
        status: 'active' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await renderProfilePage({ user: originalUser });

      const displayNameInput = screen.getByLabelText(/display name/i);
      fireEvent.change(displayNameInput, { target: { value: 'Changed Name' } });

      const resetButton = screen.getByRole('button', { name: /reset/i });
      fireEvent.click(resetButton);

      expect(displayNameInput).toHaveValue('Original Name');
    });

    it('should be disabled when no changes made', async () => {
      await renderProfilePage();

      const resetButton = screen.getByRole('button', { name: /reset/i });
      expect(resetButton).toBeDisabled();
    });

    it('should be enabled after modifications', async () => {
      await renderProfilePage();

      const displayNameInput = screen.getByLabelText(/display name/i);
      fireEvent.change(displayNameInput, { target: { value: 'New Name' } });

      const resetButton = screen.getByRole('button', { name: /reset/i });
      expect(resetButton).not.toBeDisabled();
    });
  });

  // ============================================================================
  // Test 2.1.4: Avatar Display
  // ============================================================================

  describe('Avatar Component', () => {
    it('should show user initials in avatar', async () => {
      await renderProfilePage({
        user: {
          id: 'user-123',
          displayName: 'John Doe',
          email: 'john@example.com',
          role: 'user',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      const avatar = screen.getByText('JD');
      expect(avatar).toBeInTheDocument();
    });

    it('should handle missing user gracefully', async () => {
      await renderProfilePage({ user: null });

      // When user is null, the component shows a loading spinner
      const spinner = screen.getByTestId('loading-spinner');
      expect(spinner).toBeInTheDocument();
    });
  });

  // ============================================================================
  // Test 2.1.5: Dynamic Header
  // ============================================================================

  describe('Dynamic Header', () => {
    it('should set header title to User Settings', async () => {
      await renderProfilePage();

      expect(mockSetTitle).toHaveBeenCalledWith('User Settings');
    });

    it('should set header subtitle to Profile', async () => {
      await renderProfilePage();

      expect(mockSetSubtitle).toHaveBeenCalledWith('Profile');
    });
  });

  // ============================================================================
  // Additional Tests
  // ============================================================================

  describe('User ID Display', () => {
    it('should display user ID as read-only', async () => {
      await renderProfilePage({
        user: {
          id: 'user-123',
          displayName: 'Test User',
          email: 'test@example.com',
          role: 'user',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      const userIdInput = screen.getByLabelText(/user id/i);
      expect(userIdInput).toHaveValue('user-123');
      expect(userIdInput).toBeDisabled();
    });
  });

  describe('Account Status Display', () => {
    it('should show active status correctly', async () => {
      await renderProfilePage({
        user: {
          id: 'user-123',
          displayName: 'Test User',
          email: 'test@example.com',
          role: 'user',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      expect(screen.getByText(/active/i)).toBeInTheDocument();
    });

    it('should show disabled status correctly', async () => {
      await renderProfilePage({
        user: {
          id: 'user-123',
          displayName: 'John Doe',
          email: 'john@example.com',
          role: 'user',
          status: 'disabled',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      expect(screen.getByText(/disabled/i)).toBeInTheDocument();
    });
  });

  describe('Clear Error Behavior', () => {
    it('should clear error when making changes', async () => {
      await renderProfilePage({
        error: 'Previous error',
      });

      const displayNameInput = screen.getByLabelText(/display name/i);
      fireEvent.change(displayNameInput, { target: { value: 'New Name' } });

      expect(mockClearError).toHaveBeenCalled();
    });

    it('should show error when state has error', async () => {
      await renderProfilePage({
        error: 'Authentication error',
      });

      expect(screen.getByText(/authentication error/i)).toBeInTheDocument();
    });
  });
});
