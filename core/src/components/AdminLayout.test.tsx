import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdminLayout } from './AdminLayout';

// ============================================
// HOISTED MOCKS (must be hoisted)
// ============================================
const mockUseAdminAuth = vi.hoisted(() => ({
  isAdmin: false,
  isAdminLoading: false,
  user: null as { id: string; role: string } | null,
}));

vi.mock('@/hooks/useAdminAuth', () => ({
  useAdminAuth: () => mockUseAdminAuth,
}));

vi.mock('@/hooks/useAuth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-provider">{children}</div>
  ),
}));

vi.mock('@/hooks/useDarkMode', () => ({
  DarkModeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dark-mode-provider">{children}</div>
  ),
}));

vi.mock('./ToastManager', () => ({
  ToastManagerProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="toast-manager">{children}</div>
  ),
}));

vi.mock('./DialogManager', () => ({
  DialogManagerProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-manager">{children}</div>
  ),
}));

vi.mock('./dynamic-sidebar/configs', () => ({
  AdminSidebarConfig: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-sidebar-config">{children}</div>
  ),
}));

vi.mock('./dynamic-header/configs', () => ({
  PageHeaderConfig: ({ title, subtitle, children }: any) => (
    <div data-testid="page-header-config" data-title={title} data-subtitle={subtitle}>
      {children}
    </div>
  ),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className, ...props }: any) => (
    <a href={href} className={className} {...props}>{children}</a>
  ),
}));

vi.mock('lucide-react', () => ({
  Home: () => <span data-testid="home-icon">Home</span>,
}));

// ============================================
// TEST COMPONENTS
// ============================================
function TestContent() {
  return <div data-testid="admin-content">Admin Content</div>;
}

// ============================================
// TEST SUITE
// ============================================
describe('AdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to defaults
    mockUseAdminAuth.isAdmin = false;
    mockUseAdminAuth.isAdminLoading = false;
    mockUseAdminAuth.user = null;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Loading State', () => {
    it('shows loading spinner while checking admin privileges', () => {
      mockUseAdminAuth.isAdminLoading = true;

      render(
        <AdminLayout>
          <TestContent />
        </AdminLayout>
      );

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('Checking admin privileges...')).toBeInTheDocument();
      expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
    });

    it('does not render admin content while loading', () => {
      mockUseAdminAuth.isAdminLoading = true;

      render(
        <AdminLayout>
          <TestContent />
        </AdminLayout>
      );

      expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    });
  });

  describe('Access Denied', () => {
    it('shows access denied card when user is not admin', () => {
      mockUseAdminAuth.isAdmin = false;
      mockUseAdminAuth.isAdminLoading = false;

      render(
        <AdminLayout>
          <TestContent />
        </AdminLayout>
      );

      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(
        screen.getByText("You don't have admin privileges to access this area.")
      ).toBeInTheDocument();
      expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    });

    it('shows back to home button', () => {
      mockUseAdminAuth.isAdmin = false;
      mockUseAdminAuth.isAdminLoading = false;

      render(
        <AdminLayout>
          <TestContent />
        </AdminLayout>
      );

      expect(screen.getByText('Back to Home')).toBeInTheDocument();
    });

    it('does not render admin sidebar config when access denied', () => {
      mockUseAdminAuth.isAdmin = false;
      mockUseAdminAuth.isAdminLoading = false;

      render(
        <AdminLayout>
          <TestContent />
        </AdminLayout>
      );

      expect(screen.queryByTestId('admin-sidebar-config')).not.toBeInTheDocument();
    });
  });

  describe('Admin Access', () => {
    it('renders children when user is admin', () => {
      mockUseAdminAuth.isAdmin = true;
      mockUseAdminAuth.isAdminLoading = false;
      mockUseAdminAuth.user = { id: '1', role: 'admin' };

      render(
        <AdminLayout>
          <TestContent />
        </AdminLayout>
      );

      expect(screen.getByTestId('admin-content')).toBeInTheDocument();
      expect(screen.getByText('Admin Content')).toBeInTheDocument();
    });

    it('renders admin sidebar config when admin', () => {
      mockUseAdminAuth.isAdmin = true;
      mockUseAdminAuth.isAdminLoading = false;
      mockUseAdminAuth.user = { id: '1', role: 'admin' };

      render(
        <AdminLayout>
          <TestContent />
        </AdminLayout>
      );

      expect(screen.getByTestId('admin-sidebar-config')).toBeInTheDocument();
    });

    it('renders page header config with Admin Panel title', () => {
      mockUseAdminAuth.isAdmin = true;
      mockUseAdminAuth.isAdminLoading = false;
      mockUseAdminAuth.user = { id: '1', role: 'admin' };

      render(
        <AdminLayout>
          <TestContent />
        </AdminLayout>
      );

      expect(screen.getByTestId('page-header-config')).toHaveAttribute(
        'data-title',
        'Admin Panel'
      );
    });
  });

  describe('Provider Wrapping', () => {
    it('wraps content with AuthProvider', () => {
      mockUseAdminAuth.isAdmin = true;
      mockUseAdminAuth.isAdminLoading = false;

      render(
        <AdminLayout>
          <TestContent />
        </AdminLayout>
      );

      expect(screen.getByTestId('auth-provider')).toBeInTheDocument();
    });

    it('wraps content with DarkModeProvider', () => {
      mockUseAdminAuth.isAdmin = true;
      mockUseAdminAuth.isAdminLoading = false;

      render(
        <AdminLayout>
          <TestContent />
        </AdminLayout>
      );

      expect(screen.getByTestId('dark-mode-provider')).toBeInTheDocument();
    });

    it('wraps content with ToastManagerProvider', () => {
      mockUseAdminAuth.isAdmin = true;
      mockUseAdminAuth.isAdminLoading = false;

      render(
        <AdminLayout>
          <TestContent />
        </AdminLayout>
      );

      expect(screen.getByTestId('toast-manager')).toBeInTheDocument();
    });

    it('wraps content with DialogManagerProvider', () => {
      mockUseAdminAuth.isAdmin = true;
      mockUseAdminAuth.isAdminLoading = false;

      render(
        <AdminLayout>
          <TestContent />
        </AdminLayout>
      );

      expect(screen.getByTestId('dialog-manager')).toBeInTheDocument();
    });
  });
});
