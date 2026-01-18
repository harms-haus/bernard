import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// ============================================
// MOCKS BEFORE IMPORTS (must be hoisted)
// ============================================

const mockUseAuth = vi.fn().mockReturnValue({
  loading: false,
  user: { id: 'admin', role: 'admin' },
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/hooks/useAdminAuth', () => ({
  useAdminAuth: () => ({
    isAdmin: true,
    isAdminLoading: false,
    user: { id: 'admin', role: 'admin' },
    error: null,
    loading: false,
  }),
}));

const mockAdminApiClient = {
  listUsers: vi.fn().mockResolvedValue([
    { id: '1', email: 'user1@example.com', displayName: 'User 1', role: 'user', status: 'active', createdAt: '2024-01-01' },
    { id: '2', email: 'user2@example.com', displayName: 'User 2', role: 'admin', status: 'active', createdAt: '2024-01-02' },
  ]),
  getUser: vi.fn().mockResolvedValue({ id: '1', email: 'user1@example.com', displayName: 'User 1', role: 'user', status: 'active' }),
  updateUser: vi.fn().mockResolvedValue({}),
  deleteUser: vi.fn().mockResolvedValue({}),
  createUser: vi.fn().mockResolvedValue({ id: '3', email: 'new@example.com', displayName: 'New User', role: 'user', status: 'active' }),
};

vi.mock('@/services/adminApi', () => ({
  adminApiClient: mockAdminApiClient,
}));

vi.mock('@/components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

vi.mock('@/components/dynamic-sidebar/configs', () => ({
  AdminSidebarConfig: ({ children }: any) => <div data-testid="sidebar-config">{children}</div>,
}));

vi.mock('@/components/dynamic-header/configs', () => ({
  PageHeaderConfig: ({ title, subtitle, children }: any) => (
    <div data-testid="page-header-config">
      <span data-testid="page-title">{title}</span>
      <span data-testid="page-subtitle">{subtitle}</span>
      {children}
    </div>
  ),
}));

vi.mock('@/components/DialogManager', () => ({
  useConfirmDialog: () => ({ show: vi.fn() }),
  useAlertDialog: () => ({ show: vi.fn() }),
}));

vi.mock('@/components/ToastManager', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/hooks/useDarkMode', () => ({
  DarkModeProvider: ({ children }: any) => <>{children}</>,
}));

// Mock UI components
vi.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardHeader: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardTitle: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardDescription: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, className, onClick, disabled }: any) => (
    <button className={className} onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: ({ className, value, onChange, placeholder, id, type }: any) => (
    <input className={className} value={value} onChange={onChange} placeholder={placeholder} id={id} type={type} />
  ),
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor, className }: any) => (
    <label htmlFor={htmlFor} className={className}>{children}</label>
  ),
}));

vi.mock('@/components/ui/table', () => ({
  Table: ({ children }: any) => <table>{children}</table>,
  TableBody: ({ children }: any) => <tbody>{children}</tbody>,
  TableCell: ({ children, className }: any) => <td className={className}>{children}</td>,
  TableHead: ({ children, className }: any) => <th className={className}>{children}</th>,
  TableHeader: ({ children }: any) => <thead>{children}</thead>,
  TableRow: ({ children }: any) => <tr>{children}</tr>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-value={value}>{children}</div>
  ),
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children, className }: any) => <div className={className}>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: any) => <span className={className}>{children}</span>,
}));

// ============================================
// IMPORT AFTER MOCKS
// ============================================

const UsersPage = (await import('./page')).default;

describe('Users Management Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      loading: false,
      user: { id: 'admin', role: 'admin' },
    });
  });

  it('should render without crashing', async () => {
    render(<UsersPage />);
    await waitFor(() => {
      expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('should load users on mount', async () => {
    render(<UsersPage />);
    await waitFor(() => {
      expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
    }, { timeout: 5000 });
    // Verify API was called to load users
    expect(mockAdminApiClient.listUsers).toHaveBeenCalledTimes(1);
    // Verify user data is rendered
    await waitFor(() => {
      expect(screen.getByText('User 1')).toBeInTheDocument();
      expect(screen.getByText('user1@example.com')).toBeInTheDocument();
    }, { timeout: 5000 });
  });
});
