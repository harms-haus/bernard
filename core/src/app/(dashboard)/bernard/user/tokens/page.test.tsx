// core/src/app/(dashboard)/bernard/user/tokens/page.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ============================================================================
// Mock navigator.clipboard globally
// ============================================================================

const mockWriteText = vi.fn().mockResolvedValue(undefined);

Object.defineProperty(global, 'navigator', {
  value: {
    clipboard: {
      writeText: mockWriteText,
    },
  },
  writable: true,
});

// ============================================================================
// Mock apiClient
// ============================================================================

const mockListTokens = vi.fn().mockResolvedValue([]);
const mockCreateToken = vi.fn();
const mockUpdateToken = vi.fn();
const mockDeleteToken = vi.fn();

vi.mock('@/services/api', () => ({
  apiClient: {
    listTokens: mockListTokens,
    createToken: mockCreateToken,
    updateToken: mockUpdateToken,
    deleteToken: mockDeleteToken,
  },
}));

// ============================================================================
// Mock toast
// ============================================================================

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
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

import { RouterTestProvider } from '@/test/providers';

// Import the KeysPage component for testing
const KeysPage = (await import('./page')).default;

// ============================================================================
// Test Setup
// ============================================================================

describe('TokensPage', () => {
  beforeEach(() => {
    // Reset mock implementations but keep default return values
    mockListTokens.mockReset().mockResolvedValue([]);
    mockCreateToken.mockReset();
    mockUpdateToken.mockReset();
    mockDeleteToken.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    mockSetTitle.mockReset();
    mockSetSubtitle.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderTokensPage = () => {
    return render(
      <RouterTestProvider router={{ push: vi.fn(), replace: vi.fn() }}>
        <KeysPage />
      </RouterTestProvider>
    );
  };

  // ============================================================================
  // Test 2.2.1: Token List Render
  // ============================================================================

  describe('Token List', () => {
    it('should fetch tokens on mount', async () => {
      mockListTokens.mockResolvedValue([]);
      renderTokensPage();
      await waitFor(() => {
        expect(mockListTokens).toHaveBeenCalledTimes(1);
      }, { timeout: 2000 });
    });

    it('should display tokens in table', async () => {
      const mockTokens = [
        { id: 'token-1', name: 'Token 1', status: 'active', createdAt: new Date().toISOString(), lastUsedAt: null },
        { id: 'token-2', name: 'Token 2', status: 'disabled', createdAt: new Date().toISOString(), lastUsedAt: new Date().toISOString() },
      ];
      mockListTokens.mockResolvedValue(mockTokens);
      renderTokensPage();
      await waitFor(() => {
        expect(screen.getByText('Token 1')).toBeInTheDocument();
        expect(screen.getByText('Token 2')).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('should show empty state when no tokens', async () => {
      mockListTokens.mockResolvedValue([]);
      renderTokensPage();
      await waitFor(() => {
        expect(screen.getByText(/no tokens yet/i)).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('should handle token fetch error', async () => {
      mockListTokens.mockRejectedValue(new Error('Failed to load tokens'));
      renderTokensPage();
      await waitFor(() => {
        expect(screen.getByText(/failed to load tokens/i)).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('should show loading state with spinner', async () => {
      // Make listTokens hang so loading state is visible
      let resolveTokens: () => void;
      mockListTokens.mockImplementation(() => new Promise(resolve => {
        resolveTokens = () => resolve([]);
      }));
      renderTokensPage();
      // Check for loading spinner with animate-spin class
      await waitFor(() => {
        const spinner = document.body.querySelector('.animate-spin');
        expect(spinner).toBeInTheDocument();
      }, { timeout: 100 });
      // Resolve the promise
      resolveTokens!();
    });
  });

  // ============================================================================
  // Test 2.2.2: Token Creation
  // ============================================================================

  describe('Token Creation', () => {
    it('should open create dialog', async () => {
      mockListTokens.mockResolvedValue([]);
      renderTokensPage();
      await waitFor(() => {
        const createButton = screen.getByRole('button', { name: /create token/i });
        fireEvent.click(createButton);
        expect(screen.getByRole('heading', { name: /create new token/i })).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('should create token with name', async () => {
      mockListTokens.mockResolvedValue([]);
      mockCreateToken.mockResolvedValue({ id: 'new-token', name: 'My Token', token: 'tok_new123', status: 'active', createdAt: new Date().toISOString(), lastUsedAt: null });
      renderTokensPage();
      await waitFor(() => {
        const createButton = screen.getByRole('button', { name: /create token/i });
        fireEvent.click(createButton);
      });
      await waitFor(() => {
        const nameInput = screen.getByLabelText(/token name/i);
        fireEvent.change(nameInput, { target: { value: 'My Token' } });
      });
      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /create token/i });
        fireEvent.click(submitButton);
      });
      await waitFor(() => {
        expect(mockCreateToken).toHaveBeenCalledWith({ name: 'My Token' });
      }, { timeout: 2000 });
    });

    it('should show secret dialog after creation', async () => {
      mockListTokens.mockResolvedValue([]);
      mockCreateToken.mockResolvedValue({ id: 'new-token', name: 'My Token', token: 'tok_secret123', status: 'active', createdAt: new Date().toISOString(), lastUsedAt: null });
      renderTokensPage();
      await waitFor(() => {
        const createButton = screen.getByRole('button', { name: /create token/i });
        fireEvent.click(createButton);
      });
      await waitFor(() => {
        const nameInput = screen.getByLabelText(/token name/i);
        fireEvent.change(nameInput, { target: { value: 'My Token' } });
      });
      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /create token/i });
        fireEvent.click(submitButton);
      });
      await waitFor(() => {
        // Secret dialog should open
        expect(screen.getByRole('heading', { name: /your new api key/i })).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('should handle creation error', async () => {
      mockListTokens.mockResolvedValue([]);
      mockCreateToken.mockRejectedValue(new Error('Failed to create token'));
      renderTokensPage();
      await waitFor(() => {
        const createButton = screen.getByRole('button', { name: /create token/i });
        fireEvent.click(createButton);
      });
      await waitFor(() => {
        const nameInput = screen.getByLabelText(/token name/i);
        fireEvent.change(nameInput, { target: { value: 'My Token' } });
      });
      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /create token/i });
        fireEvent.click(submitButton);
      });
      await waitFor(() => {
        expect(screen.getByText(/failed to create token/i)).toBeInTheDocument();
      }, { timeout: 2000 });
    });
  });

  // ============================================================================
  // Test 2.2.3: Token Actions
  // ============================================================================

  describe('Token Actions', () => {
    it('should toggle token status', async () => {
      const mockTokens = [{ id: 'token-1', name: 'Token 1', status: 'active', createdAt: new Date().toISOString(), lastUsedAt: null }];
      mockListTokens.mockResolvedValue(mockTokens);
      mockUpdateToken.mockResolvedValue({ id: 'token-1', name: 'Token 1', status: 'disabled', createdAt: new Date().toISOString(), lastUsedAt: null });
      renderTokensPage();
      await waitFor(() => {
        const moreButton = screen.getByRole('button', { name: /token actions/i });
        fireEvent.click(moreButton);
      });
      await waitFor(() => {
        const disableOption = screen.getByText(/disable/i);
        fireEvent.click(disableOption);
      });
      await waitFor(() => {
        expect(mockUpdateToken).toHaveBeenCalledWith('token-1', { status: 'disabled' });
      }, { timeout: 2000 });
    });

    it('should delete token', async () => {
      const mockTokens = [{ id: 'token-1', name: 'Token 1', status: 'active', createdAt: new Date().toISOString(), lastUsedAt: null }];
      mockListTokens.mockResolvedValue(mockTokens);
      mockDeleteToken.mockResolvedValue(undefined);
      renderTokensPage();
      await waitFor(() => {
        const moreButton = screen.getByRole('button', { name: /token actions/i });
        fireEvent.click(moreButton);
      });
      await waitFor(() => {
        const deleteOption = screen.getByText(/delete/i);
        fireEvent.click(deleteOption);
      });
      await waitFor(() => {
        expect(mockDeleteToken).toHaveBeenCalledWith('token-1');
      }, { timeout: 2000 });
    });

    it('should copy token ID to clipboard', async () => {
      const mockTokens = [{ id: 'token-123', name: 'Token 1', status: 'active', createdAt: new Date().toISOString(), lastUsedAt: null }];
      mockListTokens.mockResolvedValue(mockTokens);
      // Use the global mock for clipboard
      vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
      renderTokensPage();
      await waitFor(() => {
        const moreButton = screen.getByRole('button', { name: /token actions/i });
        fireEvent.click(moreButton);
      });
      await waitFor(() => {
        const copyOption = screen.getByText(/copy id/i);
        fireEvent.click(copyOption);
      });
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('token-123');
      });
    });
  });

  // ============================================================================
  // Test 2.2.4: Toast Notifications
  // ============================================================================

  describe('Toast Notifications', () => {
    it('should show success toast on create', async () => {
      mockListTokens.mockResolvedValue([]);
      mockCreateToken.mockResolvedValue({ id: 'new-token', name: 'My Token', token: 'tok_new123', status: 'active', createdAt: new Date().toISOString(), lastUsedAt: null });
      renderTokensPage();
      await waitFor(() => {
        const createButton = screen.getByRole('button', { name: /create token/i });
        fireEvent.click(createButton);
      });
      await waitFor(() => {
        const nameInput = screen.getByLabelText(/token name/i);
        fireEvent.change(nameInput, { target: { value: 'My Token' } });
      });
      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /create token/i });
        fireEvent.click(submitButton);
      });
      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('Token created successfully');
      }, { timeout: 2000 });
    });
  });

  // ============================================================================
  // Additional Tests
  // ============================================================================

  describe('Dynamic Header', () => {
    it('should set header title to User Settings', () => {
      renderTokensPage();
      expect(mockSetTitle).toHaveBeenCalledWith('User Settings');
    });

    it('should set header subtitle to Access Tokens', () => {
      renderTokensPage();
      expect(mockSetSubtitle).toHaveBeenCalledWith('Access Tokens');
    });
  });

  describe('Token Status Badge', () => {
    it('should show active badge for active tokens', async () => {
      const mockTokens = [{ id: 'token-1', name: 'Token 1', status: 'active', createdAt: new Date().toISOString(), lastUsedAt: null }];
      mockListTokens.mockResolvedValue(mockTokens);
      renderTokensPage();
      await waitFor(() => {
        expect(screen.getByText(/active/i)).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('should show disabled badge for disabled tokens', async () => {
      const mockTokens = [{ id: 'token-1', name: 'Token 1', status: 'disabled', createdAt: new Date().toISOString(), lastUsedAt: null }];
      mockListTokens.mockResolvedValue(mockTokens);
      renderTokensPage();
      await waitFor(() => {
        expect(screen.getByText(/disabled/i)).toBeInTheDocument();
      }, { timeout: 2000 });
    });
  });
});
