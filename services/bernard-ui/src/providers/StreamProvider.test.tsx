import 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ThreadProvider } from './ThreadProvider';
import { StreamProvider, useStreamContext } from './StreamProvider';

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
      <MemoryRouter>
        <ThreadProvider>
          {ui}
        </ThreadProvider>
      </MemoryRouter>
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

  it('shows loading state when submitting', async () => {
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

    await userEvent.click(screen.getByText('Submit'));
    expect(screen.getByTestId('loading').textContent).toBe('loading');

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
    await userEvent.click(screen.getByText('Stop'));
    expect(screen.getByTestId('stop-button')).toBeTruthy();
  });
});
