import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdminLayout, AdminLayoutWrapper } from './AdminLayout';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DynamicSidebarProvider } from './dynamic-sidebar';
import { DynamicHeaderProvider } from './dynamic-header';

// ============================================
// HOISTED MOCKS (must be hoisted)
// ============================================
const mockAuthState = vi.hoisted(() => ({
  loading: false,
  user: null as { id: string; role: string } | null,
}));

const mockUseAuth = vi.hoisted(() => ({
  state: mockAuthState,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth,
}));

vi.mock('@/hooks/useDarkMode', () => ({
  useDarkMode: () => ({ isDarkMode: false }),
}));

vi.mock('./dynamic-sidebar/configs', async () => {
  const actual = await vi.importActual('./dynamic-sidebar/configs');
  return {
    ...actual,
  };
});

// ============================================
// TEST COMPONENTS
// ============================================
function TestContent() {
  return <div data-testid="admin-content">Admin Content</div>;
}

function TestAdminRoute() {
  return (
    <DynamicSidebarProvider>
      <DynamicHeaderProvider>
        <MemoryRouter initialEntries={['/bernard/admin']}>
          <Routes>
            <Route path="/bernard/admin" element={<AdminLayoutWrapper />}>
              <Route index element={<TestContent />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </DynamicHeaderProvider>
    </DynamicSidebarProvider>
  );
}

// ============================================
// TEST SUITE
// ============================================
describe('AdminLayoutWrapper (Auth Checks)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.loading = false;
    mockAuthState.user = null;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Loading State', () => {
    it('does not render content while loading', () => {
      mockAuthState.loading = true;

      render(<TestAdminRoute />);

      expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
    });
  });

  describe('Access Denied', () => {
    it('does not render content when user is not authenticated', () => {
      mockAuthState.loading = false;
      mockAuthState.user = null;

      render(<TestAdminRoute />);

      expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
    });

    it('does not render content when user is not admin', () => {
      mockAuthState.loading = false;
      mockAuthState.user = { id: '1', role: 'user' };

      render(<TestAdminRoute />);

      expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
    });
  });

  describe('Admin Access', () => {
    it('renders content when user is admin', () => {
      mockAuthState.loading = false;
      mockAuthState.user = { id: '1', role: 'admin' };

      render(<TestAdminRoute />);

      expect(screen.getByTestId('admin-content')).toBeInTheDocument();
      expect(screen.getByText('Admin Content')).toBeInTheDocument();
    });
  });
});

describe('AdminLayout (Layout Structure)', () => {
  describe('Component Structure', () => {
    it('renders children in min-h-screen container', () => {
      render(
        <DynamicSidebarProvider>
          <DynamicHeaderProvider>
            <AdminLayout>
              <TestContent />
            </AdminLayout>
          </DynamicHeaderProvider>
        </DynamicSidebarProvider>
      );

      expect(screen.getByTestId('admin-content')).toBeInTheDocument();
      expect(screen.getByText('Admin Content')).toBeInTheDocument();
    });
  });
});
