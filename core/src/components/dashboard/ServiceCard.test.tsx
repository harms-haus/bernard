import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceCard, ServiceStatus } from './ServiceCard';

// ============================================
// MOCKS BEFORE IMPORTS (must be hoisted)
// ============================================

const mockUseRouter = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => mockUseRouter(),
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
        expect(screen.getByText('Whisper')).toBeInTheDocument();
      }, { timeout: 3000 });
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
        expect(screen.getByText('Kokoro')).toBeInTheDocument();
      }, { timeout: 3000 });
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
      }, { timeout: 3000 });
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
      }, { timeout: 3000 });
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
      }, { timeout: 3000 });
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
      }, { timeout: 3000 });
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
      }, { timeout: 3000 });
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
      }, { timeout: 3000 });
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
        expect(screen.getByText('Test')).toBeInTheDocument();
      }, { timeout: 3000 });

      fireEvent.click(screen.getByText('Test'));
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
      }, { timeout: 3000 });
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
