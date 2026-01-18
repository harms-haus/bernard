import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import ModelsPage from './page';

const mockUseAuth = vi.fn().mockReturnValue({
  loading: false,
  user: { id: 'admin', role: 'admin' },
});

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

vi.mock('@/components/DialogManager', () => ({
  useConfirmDialog: vi.fn(),
  useAlertDialog: vi.fn(),
}));

vi.mock('@/components/ToastManager', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Models Management Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      loading: false,
      user: { id: 'admin', role: 'admin' },
    });
  });

  it('should render page title', async () => {
    render(<ModelsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('page-title')).toHaveTextContent(/Model Management/i);
    });
  });

  it('should render page subtitle', async () => {
    render(<ModelsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('page-subtitle')).toHaveTextContent(/Configure AI Models/i);
    });
  });

  it('should render admin layout', async () => {
    render(<ModelsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
    });
  });

  it('should render Providers section', async () => {
    render(<ModelsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Providers/i)).toBeInTheDocument();
    });
  });

  it('should render Response Models section', async () => {
    render(<ModelsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Response Models/i)).toBeInTheDocument();
    });
  });

  it('should render Router Models section', async () => {
    render(<ModelsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Router Models/i)).toBeInTheDocument();
    });
  });

  it('should render Utility Models section', async () => {
    render(<ModelsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Utility Models/i)).toBeInTheDocument();
    });
  });

  it('should show Add Provider button', async () => {
    render(<ModelsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Add Provider/i)).toBeInTheDocument();
    });
  });

  it('should show Save Changes button', async () => {
    render(<ModelsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Save Changes/i)).toBeInTheDocument();
    });
  });

  it('should show Test All Providers button', async () => {
    render(<ModelsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Test All Providers/i)).toBeInTheDocument();
    });
  });

  it('should load settings on mount', async () => {
    render(<ModelsPage />);

    await waitFor(() => {
      expect(mockAdminApiClient.getModelsSettings).toHaveBeenCalledTimes(1);
      expect(mockAdminApiClient.listProviders).toHaveBeenCalledTimes(1);
    });
  });
});
