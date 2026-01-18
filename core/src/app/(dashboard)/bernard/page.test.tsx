import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from './page';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/components/dynamic-sidebar/configs', () => ({
  UserSidebarConfig: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="user-sidebar-config">{children}</div>
  ),
}));

describe('Bernard Welcome Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render welcome heading', () => {
    render(<Home />);

    expect(screen.getByText(/Welcome to Bernard/i)).toBeInTheDocument();
    expect(screen.getByText(/AI agent platform/i)).toBeInTheDocument();
  });

  it('should render quick actions section', () => {
    render(<Home />);

    expect(screen.getByText(/Quick Actions/i)).toBeInTheDocument();
    expect(screen.getByText(/Start a conversation/i)).toBeInTheDocument();
    expect(screen.getByText(/View task history/i)).toBeInTheDocument();
    expect(screen.getByText(/Check system status/i)).toBeInTheDocument();
  });

  it('should render recent activity section', () => {
    render(<Home />);

    expect(screen.getByText(/Recent Activity/i)).toBeInTheDocument();
    expect(screen.getByText(/No recent conversations/i)).toBeInTheDocument();
  });

  it('should wrap content in UserSidebarConfig', () => {
    render(<Home />);

    expect(screen.getByTestId('user-sidebar-config')).toBeInTheDocument();
  });

  it('should render Bernard AI Platform card', () => {
    render(<Home />);

    expect(screen.getByText(/Bernard AI Platform/i)).toBeInTheDocument();
    expect(screen.getByText(/A production-grade AI agent platform/i)).toBeInTheDocument();
  });
});
