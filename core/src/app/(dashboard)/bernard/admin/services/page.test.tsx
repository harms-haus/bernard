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
  getServicesSettings: vi.fn().mockResolvedValue({
    homeAssistant: { enabled: true, url: 'http://ha.local:8123', token: 'test-token' },
    plex: { enabled: false, url: '', token: '' },
    tts: { enabled: true, provider: 'kokoro' },
    stt: { enabled: true, provider: 'whisper' },
    overseerr: { enabled: false, url: '', apiKey: '' },
    weather: { provider: 'openweathermap', apiKey: '' },
  }),
  updateServicesSettings: vi.fn().mockResolvedValue({}),
  testHomeAssistantConnection: vi.fn().mockResolvedValue({ success: true }),
  testPlexConnection: vi.fn().mockResolvedValue({ success: true }),
  testTtsConnection: vi.fn().mockResolvedValue({ success: true }),
  testSttConnection: vi.fn().mockResolvedValue({ success: true }),
  testOverseerrConnection: vi.fn().mockResolvedValue({ success: true }),
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

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: any) => (
    <input type="checkbox" checked={checked} onChange={() => onCheckedChange?.(!checked)} />
  ),
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

// ============================================
// IMPORT AFTER MOCKS
// ============================================

const ServicesPage = (await import('./page')).default;

describe('Services Management Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      loading: false,
      user: { id: 'admin', role: 'admin' },
    });
  });

  it('should render without crashing', async () => {
    render(<ServicesPage />);
    await waitFor(() => {
      expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('should load settings on mount', async () => {
    render(<ServicesPage />);
    // Verify render worked and API was called
    await waitFor(() => {
      expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
    }, { timeout: 5000 });
    expect(mockAdminApiClient.getServicesSettings).toHaveBeenCalledTimes(1);
  });
});
