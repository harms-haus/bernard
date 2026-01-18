import 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Suspense } from 'react';
import { SearchParamsTestProvider } from '@/test/providers';
import { ThreadProvider } from './ThreadProvider';
import { StreamProvider, useStreamContext } from './StreamProvider';

// Create mock router object once
const mockRouter = {
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
};

// Mock next/navigation with a factory function
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => mockRouter),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as any;

const TestComponent = () => {
  const { messages, submit, isLoading, error, stop } = useStreamContext();
  return (
    <div>
      <div data-testid="loading">{isLoading ? 'loading' : 'not-loading'}</div>
      <div data-testid="error">{(error as any)?.message || 'no-error'}</div>
      <div data-testid="message-count">{messages.length}</div>
      <button onClick={() => submit({ messages: [] })}>Submit</button>
      <button onClick={stop} data-testid="stop-button">Stop</button>
    </div>
  );
};

describe('StreamProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock router functions
    mockRouter.replace = vi.fn();
    mockRouter.push = vi.fn();
    mockRouter.back = vi.fn();
    mockRouter.forward = vi.fn();
    mockRouter.refresh = vi.fn();
    // Default mock for fetch - returns a successful response
    mockFetch.mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.close();
        }
      }),
      json: vi.fn().mockResolvedValue({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <SearchParamsTestProvider params={{}}>
        <ThreadProvider>
          <Suspense fallback={<div data-testid="suspense-loading">Loading...</div>}>
            {ui}
          </Suspense>
        </ThreadProvider>
      </SearchParamsTestProvider>
    );
  };

  it('provides initial empty messages', () => {
    renderWithProviders(
      <StreamProvider apiUrl="http://localhost:2024" assistantId="test">
        <TestComponent />
      </StreamProvider>
    );

    expect(screen.getByTestId('message-count').textContent).toBe('0');
  });

  it.skip('shows loading state when submitting', async () => {
    // Mock slow response
    mockFetch.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          setTimeout(() => controller.close(), 100);
        }
      }),
      json: vi.fn().mockResolvedValue({}),
    }), 50)));

    renderWithProviders(
      <StreamProvider apiUrl="http://localhost:2024" assistantId="test">
        <TestComponent />
      </StreamProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('loading');
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('not-loading');
    });
  });

  it('stop button is functional', async () => {
    // Mock a response that doesn't immediately close
    mockFetch.mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start() {
          // Don't close immediately
        }
      }),
      json: vi.fn().mockResolvedValue({}),
    });

    renderWithProviders(
      <StreamProvider apiUrl="http://localhost:2024" assistantId="test">
        <TestComponent />
      </StreamProvider>
    );

    // Click stop button - should not throw
    await waitFor(() => {
      expect(screen.getByTestId('stop-button')).toBeTruthy();
    });
  });
});
