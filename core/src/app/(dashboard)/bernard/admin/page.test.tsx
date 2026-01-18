import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import DashboardPage from './page';

vi.mock('@/components/dynamic-header/configs', () => ({
  PageHeaderConfig: ({ title, subtitle, children }: any) => (
    <div data-testid="page-header-config">
      <span data-testid="page-title">{title}</span>
      <span data-testid="page-subtitle">{subtitle}</span>
      {children}
    </div>
  ),
}));

vi.mock('@/components/ServiceStatusPanel', () => ({
  ServiceStatusPanel: ({ title, showLogs }: any) => (
    <div data-testid="service-status-panel" data-title={title} data-show-logs={showLogs}>
      Service Status Panel
    </div>
  ),
}));

vi.mock('@/components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

describe('Admin Dashboard Page', () => {
  it('should render admin layout wrapper', () => {
    render(<DashboardPage />);

    expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
  });

  it('should set page header to Admin Panel', () => {
    render(<DashboardPage />);

    expect(screen.getByTestId('page-title')).toHaveTextContent(/Admin Panel/i);
    expect(screen.getByTestId('page-subtitle')).toHaveTextContent(/System Status/i);
  });

  it('should render ServiceStatusPanel', () => {
    render(<DashboardPage />);

    expect(screen.getByTestId('service-status-panel')).toBeInTheDocument();
    expect(screen.getByTestId('service-status-panel')).toHaveAttribute('data-title', 'Service Status');
    expect(screen.getByTestId('service-status-panel')).toHaveAttribute('data-show-logs', 'true');
  });
});
