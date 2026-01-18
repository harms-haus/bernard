// core/src/app/(dashboard)/bernard/user/profile/page.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ============================================================================
// Mock useAuth - MUST be hoisted before imports
// ============================================================================

const mockUpdateProfile = vi.fn();
const mockClearError = vi.fn();

// Mutable variable for test-specific auth overrides
let currentUser: {
  id: string;
  displayName: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  status: 'active' | 'disabled' | 'deleted';
  createdAt: string;
  updatedAt: string;
} | null = {
  id: 'user-123',
  displayName: 'Test User',
  email: 'test@example.com',
  role: 'user',
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

let currentLoading = false;
let currentError: string | null = null;

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    state: {
      user: currentUser,
      loading: currentLoading,
      error: currentError,
    },
    updateProfile: mockUpdateProfile,
    clearError: mockClearError,
    login: vi.fn(),
    githubLogin: vi.fn(),
    googleLogin: vi.fn(),
    logout: vi.fn(),
  }),
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
// Import after mocking
// ============================================================================

// Import the Profile component for testing
const ProfilePage = (await import('./page')).default;

describe('Profile Page', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockUpdateProfile.mockClear();
    mockClearError.mockClear();
    mockSetTitle.mockClear();
    mockSetSubtitle.mockClear();
    currentUser = {
      id: 'user-123',
      displayName: 'Test User',
      email: 'test@example.com',
      role: 'user',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    currentLoading = false;
    currentError = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial Render', () => {
    it('should display user email from auth state', async () => {
      render(<ProfilePage />);
      expect(screen.getByLabelText(/email/i)).toHaveValue('test@example.com');
    });

    it('should display user display name', async () => {
      currentUser = {
        ...currentUser!,
        displayName: 'John Doe',
        email: 'john@example.com',
      };
      render(<ProfilePage />);
      expect(screen.getByLabelText(/display name/i)).toHaveValue('John Doe');
    });

    it('should show email as read-only', async () => {
      render(<ProfilePage />);
      const emailInput = screen.getByLabelText(/email/i);
      expect(emailInput).toBeDisabled();
    });
  });

  describe('Profile Updates', () => {
    it('should update displayName on input change', async () => {
      render(<ProfilePage />);
      const displayNameInput = screen.getByLabelText(/display name/i);
      fireEvent.change(displayNameInput, { target: { value: 'New Name' } });
      expect(displayNameInput).toHaveValue('New Name');
    });

    it('should call updateProfile on save', async () => {
      mockUpdateProfile.mockResolvedValue({});
      render(<ProfilePage />);
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
      render(<ProfilePage />);
      const displayNameInput = screen.getByLabelText(/display name/i);
      fireEvent.change(displayNameInput, { target: { value: 'Updated Name' } });
      const saveButton = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(saveButton);
      expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();
    });

    it('should show success message after save', async () => {
      mockUpdateProfile.mockResolvedValue({});
      render(<ProfilePage />);
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
      render(<ProfilePage />);
      const displayNameInput = screen.getByLabelText(/display name/i);
      fireEvent.change(displayNameInput, { target: { value: 'Updated Name' } });
      const saveButton = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(saveButton);
      await waitFor(() => {
        expect(screen.getByText(/profile updated successfully/i)).toBeInTheDocument();
      });
      const resetButton = screen.getByRole('button', { name: /reset/i });
      fireEvent.click(resetButton);
      await waitFor(() => {
        expect(screen.queryByText(/profile updated successfully/i)).not.toBeInTheDocument();
      });
    });

    it('should show error message on save failure', async () => {
      // Mock updateProfile to set error and reject
      mockUpdateProfile.mockImplementation(() => {
        currentError = 'Update failed';
        return Promise.reject(new Error('Update failed'));
      });
      render(<ProfilePage />);
      const displayNameInput = screen.getByLabelText(/display name/i);
      fireEvent.change(displayNameInput, { target: { value: 'Updated Name' } });
      const saveButton = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(saveButton);
      // Wait for the async error to be set
      await waitFor(() => {
        expect(screen.getByText(/update failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('Reset Button', () => {
    it('should reset form to original values', async () => {
      const originalUser = { ...currentUser! };
      render(<ProfilePage />);
      const displayNameInput = screen.getByLabelText(/display name/i);
      fireEvent.change(displayNameInput, { target: { value: 'Changed Name' } });
      const resetButton = screen.getByRole('button', { name: /reset/i });
      fireEvent.click(resetButton);
      expect(displayNameInput).toHaveValue(originalUser.displayName);
    });

    it('should be disabled when no changes made', async () => {
      render(<ProfilePage />);
      const resetButton = screen.getByRole('button', { name: /reset/i });
      expect(resetButton).toBeDisabled();
    });

    it('should be enabled after modifications', async () => {
      render(<ProfilePage />);
      const displayNameInput = screen.getByLabelText(/display name/i);
      fireEvent.change(displayNameInput, { target: { value: 'New Name' } });
      const resetButton = screen.getByRole('button', { name: /reset/i });
      expect(resetButton).not.toBeDisabled();
    });
  });

  describe('Avatar Component', () => {
    it('should show user initials in avatar', async () => {
      currentUser = { ...currentUser!, displayName: 'John Doe' };
      render(<ProfilePage />);
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('should handle missing user gracefully', async () => {
      currentUser = null;
      render(<ProfilePage />);
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });
  });

  describe('Dynamic Header', () => {
    it('should set header title to User Settings', async () => {
      render(<ProfilePage />);
      expect(mockSetTitle).toHaveBeenCalledWith('User Settings');
    });

    it('should set header subtitle to Profile', async () => {
      render(<ProfilePage />);
      expect(mockSetSubtitle).toHaveBeenCalledWith('Profile');
    });
  });

  describe('User ID Display', () => {
    it('should display user ID as read-only', async () => {
      render(<ProfilePage />);
      const userIdInput = screen.getByLabelText(/user id/i);
      expect(userIdInput).toHaveValue('user-123');
      expect(userIdInput).toBeDisabled();
    });
  });

  describe('Account Status Display', () => {
    it('should show active status correctly', async () => {
      render(<ProfilePage />);
      expect(screen.getByText(/active/i)).toBeInTheDocument();
    });

    it('should show disabled status correctly', async () => {
      currentUser = { ...currentUser!, status: 'disabled' };
      render(<ProfilePage />);
      expect(screen.getByText(/disabled/i)).toBeInTheDocument();
    });
  });

  describe('Clear Error Behavior', () => {
    it('should clear error when making changes', async () => {
      currentError = 'Previous error';
      render(<ProfilePage />);
      const displayNameInput = screen.getByLabelText(/display name/i);
      fireEvent.change(displayNameInput, { target: { value: 'New Name' } });
      expect(mockClearError).toHaveBeenCalled();
    });

    it('should show error when state has error', async () => {
      currentError = 'Authentication error';
      render(<ProfilePage />);
      expect(screen.getByText(/authentication error/i)).toBeInTheDocument();
    });
  });
});
