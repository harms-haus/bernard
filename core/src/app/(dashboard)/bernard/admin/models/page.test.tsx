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
  getModelsSettings: vi.fn().mockResolvedValue({
    providers: [],
    responseModel: 'gpt-4',
    routerModel: 'gpt-4o',
    utilityModel: 'gpt-4o-mini',
    aggregationModel: 'gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small',
  }),
  updateModelsSettings: vi.fn().mockResolvedValue({}),
  listProviders: vi.fn().mockResolvedValue([]),
  createProvider: vi.fn().mockResolvedValue({}),
  updateProvider: vi.fn().mockResolvedValue({}),
  deleteProvider: vi.fn().mockResolvedValue({}),
  testProvider: vi.fn().mockResolvedValue({ success: true }),
  getProviderModels: vi.fn().mockResolvedValue([]),
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
  useConfirmDialog: () => ({
    show: vi.fn(),
  }),
  useAlertDialog: () => ({
    show: vi.fn(),
  }),
}));

vi.mock('@/components/ToastManager', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
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
  Input: ({ className, value, onChange, placeholder, id }: any) => (
    <input className={className} value={value} onChange={onChange} placeholder={placeholder} id={id} />
  ),
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor, className }: any) => (
    <label htmlFor={htmlFor} className={className}>{children}</label>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: any) => (
    <span className={className} data-variant={variant}>{children}</span>
  ),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }: any) => <div data-open={open}>{children}</div>,
  DialogContent: ({ children, className }: any) => <div className={className}>{children}</div>,
  DialogDescription: ({ children, className }: any) => <div className={className}>{children}</div>,
  DialogFooter: ({ children, className }: any) => <div className={className}>{children}</div>,
  DialogHeader: ({ children, className }: any) => <div className={className}>{children}</div>,
  DialogTitle: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children, className, align }: any) => <div className={className} data-align={align}>{children}</div>,
  DropdownMenuItem: ({ children, className, onClick }: any) => (
    <div className={className} onClick={onClick}>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
}));

// ============================================
// IMPORT AFTER MOCKS
// ============================================

const ModelsPage = (await import('./page')).default;

describe('Models Management Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      loading: false,
      user: { id: 'admin', role: 'admin' },
    });
  });

  it('should render without crashing', async () => {
    render(<ModelsPage />);
    // Just verify the component renders
    await waitFor(() => {
      expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('should load settings on mount', async () => {
    render(<ModelsPage />);

    await waitFor(() => {
      expect(mockAdminApiClient.getModelsSettings).toHaveBeenCalledTimes(1);
    }, { timeout: 5000 });
  });
});
