// core/src/test/helpers/render-helpers.ts
import { render, type RenderResult, screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';
import type { Mock } from 'vitest';
import { vi } from 'vitest';

// ============================================================================
// Render with Auth
// ============================================================================

export function renderWithAuth(
  ui: React.ReactElement,
  authState?: {
    user: Record<string, unknown> | null;
    loading: boolean;
    error: string | null;
  }
): RenderResult {
  vi.doMock('@/hooks/useAuth', () => ({
    useAuth: () => authState || { user: null, loading: false, error: null },
  }));

  return render(ui);
}

// ============================================================================
// Render with Admin
// ============================================================================

export function renderWithAdmin(ui: React.ReactElement): RenderResult {
  vi.doMock('@/hooks/useAuth', () => ({
    useAuth: () => ({
      user: { id: 'admin', role: 'admin' },
      loading: false,
      error: null,
    }),
  }));

  vi.doMock('@/hooks/useAdminAuth', () => ({
    useAdminAuth: () => ({
      isAdmin: true,
      isAdminLoading: false,
      user: { id: 'admin', role: 'admin' },
      loading: false,
      error: null,
    }),
  }));

  return render(ui);
}

// ============================================================================
// Render with Health Stream
// ============================================================================

export function renderWithHealthStream(
  ui: React.ReactElement,
  healthState?: {
    isConnected: boolean;
    error: string | null;
    serviceList?: unknown[];
  }
): RenderResult {
  vi.doMock('@/hooks/useHealthStream', () => ({
    useHealthStream: () => ({
      services: {},
      serviceList: healthState?.serviceList || [],
      isConnected: healthState?.isConnected ?? true,
      error: healthState?.error ?? null,
      refresh: vi.fn(),
    }),
  }));

  return render(ui);
}

// ============================================================================
// Render with Router
// ============================================================================

export function renderWithRouter(
  ui: React.ReactElement,
  router?: {
    push?: Mock;
    replace?: Mock;
    back?: Mock;
  }
): RenderResult {
  vi.doMock('next/navigation', () => ({
    useRouter: () => ({
      push: router?.push || vi.fn(),
      replace: router?.replace || vi.fn(),
      back: router?.back || vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    }),
    useSearchParams: () => mockUseSearchParams(),
  }));

  return render(ui);
}

// Helper
import { mockUseSearchParams } from '@/test/mocks/hooks';

// ============================================================================
// Async Helpers
// ============================================================================

export async function waitForLoadingComplete(timeout = 5000): Promise<void> {
  await waitFor(
    () => {
      expect(screen.queryByText(/loading/i, { exact: false })).not.toBeInTheDocument();
    },
    { timeout }
  );
}

export async function waitForAsyncOperation(ms = 100): Promise<void> {
  await waitFor(
    () => {},
    { timeout: ms }
  );
}
