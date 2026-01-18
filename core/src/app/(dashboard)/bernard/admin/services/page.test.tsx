import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import ServicesPage from './page';

const mockUseAuth = vi.fn().mockReturnValue({
  loading: false,
  user: { id: 'admin', role: 'admin' },
});

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

describe('Services Configuration Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      loading: false,
      user: { id: 'admin', role: 'admin' },
    });
  });

  it('should render page title', async () => {
    render(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('page-title')).toHaveTextContent(/Service Configuration/i);
    });
  });

  it('should render page subtitle', async () => {
    render(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('page-subtitle')).toHaveTextContent(/Manage Service Integrations/i);
    });
  });

  it('should render admin layout', async () => {
    render(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
    });
  });

  it('should render Home Assistant section', async () => {
    render(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getByText(/Home Assistant/i)).toBeInTheDocument();
    });
  });

  it('should render Plex section', async () => {
    render(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getByText(/Plex/i)).toBeInTheDocument();
    });
  });

  it('should render TTS section', async () => {
    render(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getByText(/Text-to-Speech/i)).toBeInTheDocument();
    });
  });

  it('should render STT section', async () => {
    render(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getByText(/Speech-to-Text/i)).toBeInTheDocument();
    });
  });

  it('should render Weather section', async () => {
    render(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getByText(/Weather/i)).toBeInTheDocument();
    });
  });

  it('should render Save Changes button', async () => {
    render(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getByText(/Save Changes/i)).toBeInTheDocument();
    });
  });

  it('should load settings on mount', async () => {
    render(<ServicesPage />);

    await waitFor(() => {
      expect(mockAdminApiClient.getServicesSettings).toHaveBeenCalledTimes(1);
    });
  });
});
