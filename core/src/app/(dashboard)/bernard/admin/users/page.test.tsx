import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import UsersPage from './page';

const mockUseAuth = vi.fn().mockReturnValue({
  loading: false,
  user: { id: 'admin', role: 'admin' },
});

const mockUsers = [
  {
    id: 'user-1',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-2',
    email: 'user@example.com',
    name: 'Regular User',
    role: 'user',
    status: 'active',
    createdAt: '2026-01-15T00:00:00Z',
  },
];

const mockAdminApiClient = {
  listUsers: vi.fn().mockResolvedValue(mockUsers),
  createUser: vi.fn().mockResolvedValue(mockUsers[1]),
  updateUser: vi.fn().mockResolvedValue({}),
  deleteUser: vi.fn().mockResolvedValue({}),
  getLimitsSettings: vi.fn().mockResolvedValue({ allowSignups: true }),
  updateLimitsSettings: vi.fn().mockResolvedValue({}),
  resetUser: vi.fn().mockResolvedValue({}),
};

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/services/adminApi', () => ({
  adminApiClient: mockAdminApiClient,
}));

vi.mock('@/components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

vi.mock('@/components/dynamic-header/configs', () => ({
  PageHeaderConfig: ({ title, subtitle }: any) => (
    <div data-testid="page-header-config">
      <span data-testid="page-title">{title}</span>
      <span data-testid="page-subtitle">{subtitle}</span>
    </div>
  ),
}));

vi.mock('@/components/ToastManager', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/components/DialogManager', () => ({
  useConfirmDialog: vi.fn(),
}));

describe('Users Management Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      loading: false,
      user: { id: 'admin', role: 'admin' },
    });
  });

  it('should render page title', async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByTestId('page-title')).toHaveTextContent(/User Management/i);
    });
  });

  it('should render page subtitle', async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByTestId('page-subtitle')).toHaveTextContent(/Manage User Accounts/i);
    });
  });

  it('should render admin layout', async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
    });
  });

  it('should render user table', async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText(/admin@example.com/i)).toBeInTheDocument();
      expect(screen.getByText(/user@example.com/i)).toBeInTheDocument();
    });
  });

  it('should show user roles', async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText(/Admin/i)).toBeInTheDocument();
      expect(screen.getByText(/User/i)).toBeInTheDocument();
    });
  });

  it('should show Add User button', async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText(/Add User/i)).toBeInTheDocument();
    });
  });

  it('should load users on mount', async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(mockAdminApiClient.listUsers).toHaveBeenCalledTimes(1);
    });
  });

  it('should render user names', async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText(/Admin User/i)).toBeInTheDocument();
      expect(screen.getByText(/Regular User/i)).toBeInTheDocument();
    });
  });

  it('should show user status badges', async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText(/Active/i)).toBeInTheDocument();
    });
  });
});
