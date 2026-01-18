import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StatusPage from './page';

const mockRouterReplace = vi.fn();

const mockUseAuth = vi.fn();

const mockUseHealthStream = vi.fn().mockReturnValue({
  serviceList: [
    { service: 'redis', name: 'Redis', status: 'up', responseTime: 5 },
    { service: 'whisper', name: 'Whisper', status: 'up', responseTime: 45 },
    { service: 'kokoro', name: 'Kokoro', status: 'down' },
    { service: 'bernard-agent', name: 'Bernard Agent', status: 'up', responseTime: 120 },
  ],
  isConnected: true,
  error: null,
  refresh: vi.fn(),
});

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
      replace: mockRouterReplace,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    }),
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/useHealthStream', () => ({
  useHealthStream: () => mockUseHealthStream(),
}));

vi.mock('@/components/dashboard/LogViewer', () => ({
  LogViewer: ({ service, height }: any) => (
    <div data-testid="log-viewer" data-service={service} data-height={height}>
      Log Viewer
    </div>
  ),
}));

describe('Status Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouterReplace.mockClear();
    mockUseAuth.mockClear();
    mockUseHealthStream.mockClear();
    mockUseHealthStream.mockReturnValue({
      serviceList: [
        { service: 'redis', name: 'Redis', status: 'up', responseTime: 5 },
        { service: 'whisper', name: 'Whisper', status: 'up', responseTime: 45 },
        { service: 'kokoro', name: 'Kokoro', status: 'down' },
        { service: 'bernard-agent', name: 'Bernard Agent', status: 'up', responseTime: 120 },
      ],
      isConnected: true,
      error: null,
      refresh: vi.fn(),
    });
  });

  describe('Authentication', () => {
    it('should redirect to login when not authenticated', async () => {
      mockUseAuth.mockReturnValue({
        loading: false,
        user: null,
      });

      render(<StatusPage />);

      await waitFor(() => {
        expect(mockRouterReplace).toHaveBeenCalledWith('/auth/login');
      });
    });

    it('should show loading state while checking auth', () => {
      mockUseAuth.mockReturnValue({
        loading: true,
        user: null,
      });

      render(<StatusPage />);

      expect(screen.getByText(/Checking authentication/i)).toBeInTheDocument();
    });

    it('should render for authenticated user', () => {
      mockUseAuth.mockReturnValue({
        loading: false,
        user: { id: 'test', role: 'user' },
      });

      render(<StatusPage />);

      expect(screen.getByText(/Service Status/i)).toBeInTheDocument();
    });
  });

  describe('Service List', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        loading: false,
        user: { id: 'test', role: 'user' },
      });
    });

    it('should render service cards', () => {
      render(<StatusPage />);

      expect(screen.getByText(/Redis/i)).toBeInTheDocument();
      expect(screen.getByText(/Whisper/i)).toBeInTheDocument();
      expect(screen.getByText(/Kokoro/i)).toBeInTheDocument();
    });

    it('should show healthy count', () => {
      render(<StatusPage />);

      expect(screen.getByText(/3\/4 services healthy/i)).toBeInTheDocument();
    });

    it('should show service status badges', () => {
      render(<StatusPage />);

      expect(screen.getByText(/UP/i)).toBeInTheDocument();
      expect(screen.getByText(/DOWN/i)).toBeInTheDocument();
    });
  });

  describe('Service Actions', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        loading: false,
        user: { id: 'test', role: 'admin' },
      });
    });

    it('should show action buttons for admin', () => {
      render(<StatusPage />);

      expect(screen.getByText(/Select Action/i)).toBeInTheDocument();
      expect(screen.getByText(/Refresh/i)).toBeInTheDocument();
      expect(screen.getByText(/Start All/i)).toBeInTheDocument();
    });

    it('should hide action buttons for non-admin', () => {
      mockUseAuth.mockReturnValue({
        loading: false,
        user: { id: 'test', role: 'user' },
      });

      render(<StatusPage />);

      expect(screen.queryByText(/Start All/i)).not.toBeInTheDocument();
    });
  });

  describe('Log Viewer', () => {
    it('should render log viewer component', () => {
      mockUseAuth.mockReturnValue({
        loading: false,
        user: { id: 'test', role: 'admin' },
      });

      render(<StatusPage />);

      expect(screen.getByTestId('log-viewer')).toBeInTheDocument();
      expect(screen.getByTestId('log-viewer')).toHaveAttribute('data-service', 'all');
    });
  });
});
