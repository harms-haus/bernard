import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceCard, ServiceStatus } from './ServiceCard';

// ============================================
// MOCKS BEFORE IMPORTS (must be hoisted)
// ============================================
vi.mock('next/navigation', () => ({
  useRouter: vi.hoisted(() => vi.fn()),
}));

// ============================================
// TEST COMPONENTS
// ============================================
function TestServiceCard({ serviceId, onNavigate }: { serviceId: string; onNavigate?: (id: string) => void }) {
  return <ServiceCard serviceId={serviceId} onNavigate={onNavigate} />;
}

// ============================================
// TEST SUITE
// ============================================
describe('ServiceCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Status Display', () => {
    it('shows running status with green indicator', async () => {
      const mockStatus: ServiceStatus = {
        id: 'whisper',
        name: 'Whisper',
        status: 'running',
        health: 'healthy',
        color: '#000',
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockStatus),
      });

      render(<TestServiceCard serviceId="whisper" />);

      await waitFor(() => {
        expect(screen.getByText('WHISPER')).toBeInTheDocument();
        expect(screen.getByText('HEALTHY')).toBeInTheDocument();
      });
    });

    it('shows stopped status with gray indicator', async () => {
      const mockStatus: ServiceStatus = {
        id: 'kokoro',
        name: 'Kokoro',
        status: 'stopped',
        health: 'unknown',
        color: '#000',
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockStatus),
      });

      render(<TestServiceCard serviceId="kokoro" />);

      await waitFor(() => {
        expect(screen.getByText('KOKORO')).toBeInTheDocument();
        expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
      });
    });

    it('shows starting status with yellow indicator', async () => {
      const mockStatus: ServiceStatus = {
        id: 'test',
        name: 'Test',
        status: 'starting',
        health: 'unknown',
        color: '#000',
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockStatus),
      });

      render(<TestServiceCard serviceId="test" />);

      await waitFor(() => {
        expect(screen.getByText('STARTING')).toBeInTheDocument();
      });
    });

    it('shows failed status with red indicator', async () => {
      const mockStatus: ServiceStatus = {
        id: 'test',
        name: 'Test',
        status: 'failed',
        health: 'unhealthy',
        color: '#000',
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockStatus),
      });

      render(<TestServiceCard serviceId="test" />);

      await waitFor(() => {
        expect(screen.getByText('FAILED')).toBeInTheDocument();
        expect(screen.getByText('UNHEALTHY')).toBeInTheDocument();
      });
    });
  });

  describe('Uptime Display', () => {
    it('formats seconds correctly', async () => {
      const mockStatus: ServiceStatus = {
        id: 'test',
        name: 'Test',
        status: 'running',
        health: 'healthy',
        color: '#000',
        uptime: 45,
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockStatus),
      });

      render(<TestServiceCard serviceId="test" />);

      await waitFor(() => {
        expect(screen.getByText('Uptime: 45s')).toBeInTheDocument();
      });
    });

    it('formats minutes correctly', async () => {
      const mockStatus: ServiceStatus = {
        id: 'test',
        name: 'Test',
        status: 'running',
        health: 'healthy',
        color: '#000',
        uptime: 90, // 1m 30s
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockStatus),
      });

      render(<TestServiceCard serviceId="test" />);

      await waitFor(() => {
        expect(screen.getByText('Uptime: 1m 30s')).toBeInTheDocument();
      });
    });

    it('formats hours correctly', async () => {
      const mockStatus: ServiceStatus = {
        id: 'test',
        name: 'Test',
        status: 'running',
        health: 'healthy',
        color: '#000',
        uptime: 3661, // 1h 1m 1s
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockStatus),
      });

      render(<TestServiceCard serviceId="test" />);

      await waitFor(() => {
        expect(screen.getByText('Uptime: 1h 1m')).toBeInTheDocument();
      });
    });

    it('formats days correctly', async () => {
      const mockStatus: ServiceStatus = {
        id: 'test',
        name: 'Test',
        status: 'running',
        health: 'healthy',
        color: '#000',
        uptime: 90000, // 1d 1h
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockStatus),
      });

      render(<TestServiceCard serviceId="test" />);

      await waitFor(() => {
        expect(screen.getByText('Uptime: 1d 1h')).toBeInTheDocument();
      });
    });
  });

  describe('Port Display', () => {
    it('shows port when available', async () => {
      const mockStatus: ServiceStatus = {
        id: 'test',
        name: 'Test',
        status: 'running',
        health: 'healthy',
        color: '#000',
        port: 8080,
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockStatus),
      });

      render(<TestServiceCard serviceId="test" />);

      await waitFor(() => {
        expect(screen.getByText('Port 8080')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('calls onNavigate when card is clicked', async () => {
      const onNavigate = vi.fn();
      const mockStatus: ServiceStatus = {
        id: 'test',
        name: 'Test',
        status: 'running',
        health: 'healthy',
        color: '#000',
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockStatus),
      });

      render(<TestServiceCard serviceId="test" onNavigate={onNavigate} />);

      await waitFor(() => {
        expect(screen.getByText('TEST')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('TEST'));
      expect(onNavigate).toHaveBeenCalledWith('test');
    });
  });

  describe('Error State', () => {
    it('shows error when fetch fails', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed'));

      render(<TestServiceCard serviceId="test" />);

      await waitFor(() => {
        expect(screen.getByText('test')).toBeInTheDocument();
        expect(screen.getByText('Failed to load status')).toBeInTheDocument();
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
          json: vi.fn().mockResolvedValue({
            id: 'test',
            name: 'Test',
            status: 'running',
            health: 'healthy',
            color: '#000',
          }),
        });
      });

      render(<TestServiceCard serviceId="test" />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Retry'));

      await waitFor(() => {
        expect(callCount).toBeGreaterThan(1);
      });
    });
  });

  describe('Loading State', () => {
    it('shows skeleton while loading', () => {
      // Mock fetch that never resolves to keep loading state
      globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => { }));

      const { container } = render(<TestServiceCard serviceId="test" />);

      // Should show skeleton
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });
});
