import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserLayout } from './UserLayout';

// ============================================
// HOISTED MOCKS (must be hoisted)
// ============================================
const mockUseDarkMode = vi.hoisted(() => ({
  isDarkMode: false,
  toggleDarkMode: vi.fn(),
}));

vi.mock('@/hooks/useDarkMode', () => ({
  useDarkMode: () => mockUseDarkMode,
}));

vi.mock('./dynamic-sidebar/configs', () => ({
  UserSidebarConfig: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="user-sidebar-config">{children}</div>
  ),
}));

vi.mock('./dynamic-header/configs', () => ({
  PageHeaderConfig: ({ title, subtitle, children }: any) => (
    <div data-testid="page-header-config" data-title={title} data-subtitle={subtitle}>
      {children}
    </div>
  ),
}));

// ============================================
// TEST COMPONENTS
// ============================================
function TestContent() {
  return <div data-testid="user-content">User Content</div>;
}

// ============================================
// TEST SUITE
// ============================================
describe('UserLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to defaults
    mockUseDarkMode.isDarkMode = false;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Dark Mode', () => {
    it('applies dark class when dark mode is enabled', () => {
      mockUseDarkMode.isDarkMode = true;

      const { container } = render(
        <UserLayout>
          <TestContent />
        </UserLayout>
      );

      expect(container.firstChild).toHaveClass('dark');
    });

    it('does not apply dark class when dark mode is disabled', () => {
      mockUseDarkMode.isDarkMode = false;

      const { container } = render(
        <UserLayout>
          <TestContent />
        </UserLayout>
      );

      expect(container.firstChild).not.toHaveClass('dark');
    });
  });

  describe('Rendering', () => {
    it('renders children without errors', () => {
      mockUseDarkMode.isDarkMode = false;

      render(
        <UserLayout>
          <TestContent />
        </UserLayout>
      );

      expect(screen.getByTestId('user-content')).toBeInTheDocument();
      expect(screen.getByText('User Content')).toBeInTheDocument();
    });

    it('wraps content with user sidebar config', () => {
      mockUseDarkMode.isDarkMode = false;

      render(
        <UserLayout>
          <TestContent />
        </UserLayout>
      );

      expect(screen.getByTestId('user-sidebar-config')).toBeInTheDocument();
    });

    it('renders page header config with Bernard title', () => {
      mockUseDarkMode.isDarkMode = false;

      render(
        <UserLayout>
          <TestContent />
        </UserLayout>
      );

      expect(screen.getByTestId('page-header-config')).toHaveAttribute(
        'data-title',
        'Bernard'
      );
    });

    it('renders page header config with Dashboard subtitle', () => {
      mockUseDarkMode.isDarkMode = false;

      render(
        <UserLayout>
          <TestContent />
        </UserLayout>
      );

      expect(screen.getByTestId('page-header-config')).toHaveAttribute(
        'data-subtitle',
        'Dashboard'
      );
    });
  });

  describe('Structure', () => {
    it('has min-h-screen on wrapper', () => {
      mockUseDarkMode.isDarkMode = false;

      const { container } = render(
        <UserLayout>
          <TestContent />
        </UserLayout>
      );

      expect(container.firstChild).toHaveClass('min-h-screen');
    });

    it('renders content inside layout', () => {
      mockUseDarkMode.isDarkMode = false;

      render(
        <UserLayout>
          <TestContent />
        </UserLayout>
      );

      expect(screen.getByTestId('user-content')).toBeInTheDocument();
    });
  });
});
