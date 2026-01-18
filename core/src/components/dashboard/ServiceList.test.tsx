import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceList, ServiceStatus } from './ServiceList';

// ============================================
// HOISTED MOCKS (must be hoisted)
// ============================================
const mockRouter = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

// ============================================
// MOCKS BEFORE IMPORTS (must be hoisted)
// ============================================
vi.mock('./ServiceCard', () => ({
  ServiceCard: ({ serviceId, onNavigate }: { serviceId: string; onNavigate?: (id: string) => void }) => (
    <div data-testid={`service-card-${serviceId}`}>
      <span data-testid={`service-name-${serviceId}`}>{serviceId}</span>
      <button onClick={() => onNavigate?.(serviceId)}>Navigate</button>
    </div>
  ),
}));

// ============================================
// TEST COMPONENTS
// ============================================
function TestServiceList({ onServiceClick }: { onServiceClick?: (id: string) => void }) {
  return <ServiceList onServiceClick={onServiceClick} />;
}

// ============================================
// TEST SUITE
// ============================================
describe('ServiceList', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage
    localStorage.clear();
    // Save original fetch
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    vi.resetAllMocks();
    // Restore original fetch
    globalThis.fetch = originalFetch;
  });

  describe('Loading State', () => {
    it('shows loading skeleton when loading and no statuses', () => {
      // Mock fetch to return empty
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([]),
      }) as any;

      const { container } = render(<TestServiceList />);

      // Check for skeleton elements (animate-pulse)
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not show skeleton when loading but statuses exist', async () => {
      const mockStatuses: ServiceStatus[] = [
        {
          id: 'whisper',
          name: 'Whisper',
          status: 'running',
          health: 'healthy',
          color: '#000',
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockStatuses),
      });

      const { container } = render(<TestServiceList />);

      // After statuses load, no skeleton should be shown
      await waitFor(() => {
        const skeletons = container.querySelectorAll('.animate-pulse');
        expect(skeletons).toHaveLength(0);
      });
    });
  });

  describe('Error State', () => {
    it('shows error message when fetch fails', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

      render(<TestServiceList />);

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByText('Failed to load services')).toBeInTheDocument();
      });
    });

    it('shows retry button on error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed'));

      render(<TestServiceList />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('retries on button click', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Failed'));
        }
        return Promise.resolve({
          ok: true,
          json: vi.fn().mockResolvedValue([]),
        });
      });

      render(<TestServiceList />);

      // Wait for error and retry button
      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      // Click retry
      fireEvent.click(screen.getByText('Retry'));

      // Should have made another fetch call
      await waitFor(() => {
        expect(callCount).toBeGreaterThan(1);
      });
    });
  });

  describe('Service Rendering', () => {
    it('renders service cards for each status', async () => {
      const mockStatuses: ServiceStatus[] = [
        {
          id: 'whisper',
          name: 'Whisper',
          status: 'running',
          health: 'healthy',
          color: '#000',
        },
        {
          id: 'kokoro',
          name: 'Kokoro',
          status: 'stopped',
          health: 'unknown',
          color: '#000',
        },
      ];

      // Mock fetch to return our test data
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockStatuses),
      });

      render(<TestServiceList />);

      // Wait for services to load
      await waitFor(() => {
        expect(screen.getByTestId('service-card-whisper')).toBeInTheDocument();
        expect(screen.getByTestId('service-card-kokoro')).toBeInTheDocument();
      });
    });

    it('shows running count', async () => {
      const mockStatuses: ServiceStatus[] = [
        {
          id: 'whisper',
          name: 'Whisper',
          status: 'running',
          health: 'healthy',
          color: '#000',
        },
        {
          id: 'kokoro',
          name: 'Kokoro',
          status: 'stopped',
          health: 'unknown',
          color: '#000',
        },
        {
          id: 'bernard',
          name: 'Bernard',
          status: 'running',
          health: 'healthy',
          color: '#000',
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockStatuses),
      });

      render(<TestServiceList />);

      await waitFor(() => {
        expect(screen.getByText('2/3 running')).toBeInTheDocument();
      });
    });

    it('calls onServiceClick when service card is clicked', async () => {
      const onServiceClick = vi.fn();
      const mockStatuses: ServiceStatus[] = [
        {
          id: 'whisper',
          name: 'Whisper',
          status: 'running',
          health: 'healthy',
          color: '#000',
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockStatuses),
      });

      render(<TestServiceList onServiceClick={onServiceClick} />);

      await waitFor(() => {
        expect(screen.getByTestId('service-card-whisper')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('service-card-whisper').querySelector('button')!);
      expect(onServiceClick).toHaveBeenCalledWith('whisper');
    });
  });

  describe('Refresh', () => {
    it('shows refresh button', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([]),
      });

      render(<TestServiceList />);

      // Wait for loading to complete before checking for Refresh button
      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });
    });

    it('refreshes on button click', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: vi.fn().mockResolvedValue([]),
        });
      });

      render(<TestServiceList />);

      // Wait for initial load
      await waitFor(() => {
        expect(callCount).toBeGreaterThanOrEqual(1);
      });

      const refreshButton = screen.getByText('Refresh');
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(callCount).toBeGreaterThan(1);
      });
    });
  });
});

describe('ServiceStatus Interface', () => {
  it('accepts all valid status values', () => {
    const statuses: ServiceStatus[] = [
      { id: 's1', name: 'Service 1', status: 'running', health: 'healthy', color: '#000' },
      { id: 's2', name: 'Service 2', status: 'stopped', health: 'unhealthy', color: '#000' },
      { id: 's3', name: 'Service 3', status: 'starting', health: 'unknown', color: '#000' },
      { id: 's4', name: 'Service 4', status: 'failed', health: 'unknown', color: '#000' },
    ];

    expect(statuses).toHaveLength(4);
  });

  it('accepts optional fields', () => {
    const status: ServiceStatus = {
      id: 's1',
      name: 'Service 1',
      status: 'running',
      health: 'healthy',
      color: '#000',
      port: 8080,
      uptime: 3600,
      lastStarted: new Date(),
      lastStopped: new Date(),
    };

    expect(status.port).toBe(8080);
    expect(status.uptime).toBe(3600);
  });
});
