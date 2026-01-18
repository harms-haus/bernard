// core/src/app/(dashboard)/bernard/user/tokens/page.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import KeysPage from './page';
import { RouterTestProvider } from '@/test/providers';

// ============================================================================
// Mock apiClient
// ============================================================================

const mockListTokens = vi.fn();
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

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
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
// Mock navigator.clipboard
// ============================================================================

const mockWriteText = vi.fn();

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: mockWriteText,
  },
  writable: true,
});

// ============================================================================
// Test Setup
// ============================================================================

const renderTokensPage = () => {
  return render(
    <RouterTestProvider router={{ push: vi.fn(), replace: vi.fn() }}>
      <KeysPage />
    </RouterTestProvider>
  );
};

describe('TokensPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListTokens.mockClear();
    mockCreateToken.mockClear();
    mockUpdateToken.mockClear();
    mockDeleteToken.mockClear();
    mockWriteText.mockClear();
    mockSetTitle.mockClear();
    mockSetSubtitle.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Test 2.2.1: Token List Render
  // ============================================================================

  describe('Token List', () => {
    it('should fetch tokens on mount', async () => {
      mockListTokens.mockResolvedValue([]);

      renderTokensPage();

      await waitFor(() => {
        expect(mockListTokens).toHaveBeenCalledTimes(1);
      });
    });

    it('should display tokens in table', async () => {
      const mockTokens = [
        {
          id: 'token-1',
          name: 'Token 1',
          token: 'tok_abc123',
          status: 'active',
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        },
        {
          id: 'token-2',
          name: 'Token 2',
          token: 'tok_def456',
          status: 'disabled',
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
        },
      ];
      mockListTokens.mockResolvedValue(mockTokens);

      renderTokensPage();

      await waitFor(() => {
        expect(screen.getByText('Token 1')).toBeInTheDocument();
        expect(screen.getByText('Token 2')).toBeInTheDocument();
      });
    });

    it('should show empty state when no tokens', async () => {
      mockListTokens.mockResolvedValue([]);

      renderTokensPage();

      await waitFor(() => {
        expect(screen.getByText(/no tokens yet/i)).toBeInTheDocument();
      });
    });

    it('should handle token fetch error', async () => {
      mockListTokens.mockRejectedValue(new Error('Failed to load tokens'));

      renderTokensPage();

      await waitFor(() => {
        expect(screen.getByText(/failed to load tokens/i)).toBeInTheDocument();
      });
    });

    it('should show loading state', () => {
      mockListTokens.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

      renderTokensPage();

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
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
      });
    });

    it('should create token with name', async () => {
      mockListTokens.mockResolvedValue([]);
      mockCreateToken.mockResolvedValue({
        id: 'new-token',
        name: 'My Token',
        token: 'tok_new123',
        status: 'active',
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      });

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
      });
    });

    it('should show secret only once after creation', async () => {
      mockListTokens.mockResolvedValue([]);
      mockCreateToken.mockResolvedValue({
        id: 'new-token',
        name: 'My Token',
        token: 'tok_secret123',
        status: 'active',
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      });

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
        expect(screen.getByRole('heading', { name: /your new api key/i })).toBeInTheDocument();
      });
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
      });
    });

    it('should clear form after creation', async () => {
      mockListTokens.mockResolvedValue([]);
      mockCreateToken.mockResolvedValue({
        id: 'new-token',
        name: 'My Token',
        token: 'tok_new123',
        status: 'active',
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      });

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
        // Open dialog again
        const createButton = screen.getByRole('button', { name: /create token/i });
        fireEvent.click(createButton);
      });

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/token name/i);
        expect(nameInput).toHaveValue('');
      });
    });
  });

  // ============================================================================
  // Test 2.2.3: Token Display & Masking
  // ============================================================================

  describe('Token Display', () => {
    it('should mask token in list', async () => {
      const mockTokens = [
        {
          id: 'token-1',
          name: 'Token 1',
          token: 'tok_abc123def456',
          status: 'active',
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        },
      ];
      mockListTokens.mockResolvedValue(mockTokens);

      renderTokensPage();

      await waitFor(() => {
        // Tokens should be masked
        const tokenCell = screen.getByText('tok_abc...456');
        expect(tokenCell).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // Test 2.2.4: Token Actions
  // ============================================================================

  describe('Token Actions', () => {
    it('should toggle token status', async () => {
      const mockTokens = [
        {
          id: 'token-1',
          name: 'Token 1',
          token: 'tok_abc123',
          status: 'active',
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        },
      ];
      mockListTokens.mockResolvedValue(mockTokens);
      mockUpdateToken.mockResolvedValue({
        id: 'token-1',
        name: 'Token 1',
        token: 'tok_abc123',
        status: 'disabled',
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      });

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
      });
    });

    it('should delete token', async () => {
      const mockTokens = [
        {
          id: 'token-1',
          name: 'Token 1',
          token: 'tok_abc123',
          status: 'active',
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        },
      ];
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
      });
    });

    it('should copy token ID to clipboard', async () => {
      const mockTokens = [
        {
          id: 'token-123',
          name: 'Token 1',
          token: 'tok_abc123',
          status: 'active',
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        },
      ];
      mockListTokens.mockResolvedValue(mockTokens);

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
        expect(mockWriteText).toHaveBeenCalledWith('token-123');
      });
    });
  });

  // ============================================================================
  // Test 2.2.5: Toast Notifications
  // ============================================================================

  describe('Toast Notifications', () => {
    it('should show success toast on create', async () => {
      mockListTokens.mockResolvedValue([]);
      mockCreateToken.mockResolvedValue({
        id: 'new-token',
        name: 'My Token',
        token: 'tok_new123',
        status: 'active',
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      });

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
        // Toast should be called with success message
        const { toast } = require('sonner');
        expect(toast.success).toHaveBeenCalledWith('Token created successfully');
      });
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
      const mockTokens = [
        {
          id: 'token-1',
          name: 'Token 1',
          token: 'tok_abc123',
          status: 'active',
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        },
      ];
      mockListTokens.mockResolvedValue(mockTokens);

      renderTokensPage();

      await waitFor(() => {
        expect(screen.getByText(/active/i)).toBeInTheDocument();
      });
    });

    it('should show disabled badge for disabled tokens', async () => {
      const mockTokens = [
        {
          id: 'token-1',
          name: 'Token 1',
          token: 'tok_abc123',
          status: 'disabled',
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        },
      ];
      mockListTokens.mockResolvedValue(mockTokens);

      renderTokensPage();

      await waitFor(() => {
        expect(screen.getByText(/disabled/i)).toBeInTheDocument();
      });
    });
  });
});
