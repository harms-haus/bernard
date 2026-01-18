import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Tasks from './page';

const mockUseAuth = vi.fn().mockReturnValue({
  loading: false,
  user: { id: 'test-user-id', role: 'user' },
});

vi.mock('@/hooks/useAuth', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useAuth')>('@/hooks/useAuth');
  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

vi.mock('@/hooks/useDarkMode', () => ({
  DarkModeProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/dynamic-sidebar/configs', () => ({
  UserSidebarConfig: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="user-sidebar-config">{children}</div>
  ),
}));

vi.mock('@/components/DialogManager', () => ({
  useConfirmDialog: () => vi.fn(),
}));

const mockTasks = [
  {
    id: 'task-1',
    name: 'Search movies',
    status: 'completed' as const,
    toolName: 'overseerr-find-media',
    createdAt: '2026-01-18T10:00:00Z',
    runtimeMs: 5000,
    messageCount: 5,
    toolCallCount: 2,
    tokensIn: 1200,
    tokensOut: 800,
    archived: false,
  },
  {
    id: 'task-2',
    name: 'Turn on lights',
    status: 'running' as const,
    toolName: 'home-assistant-toggle-light',
    createdAt: '2026-01-18T11:00:00Z',
    runtimeMs: null,
    messageCount: 2,
    toolCallCount: 1,
    tokensIn: 400,
    tokensOut: 200,
    archived: false,
  },
];

describe('Tasks Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
    mockUseAuth.mockReturnValue({
      loading: false,
      user: { id: 'test-user-id', role: 'user' },
    });
  });

  it('should render page title', () => {
    render(<Tasks />);

    expect(screen.getByText(/Tasks/i)).toBeInTheDocument();
    expect(screen.getByText(/Monitor background task execution/i)).toBeInTheDocument();
  });

  it('should render user sidebar config', () => {
    render(<Tasks />);

    expect(screen.getByTestId('user-sidebar-config')).toBeInTheDocument();
  });

  it('should render Show Archived toggle button', () => {
    render(<Tasks />);

    expect(screen.getByText(/Show Archived/i)).toBeInTheDocument();
  });

  it('should render Refresh button', () => {
    render(<Tasks />);

    expect(screen.getByText(/Refresh/i)).toBeInTheDocument();
  });

  it('should render tasks table', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: mockTasks, total: 2, hasMore: false }),
    });

    render(<Tasks />);

    await waitFor(() => {
      expect(screen.getByText(/Background Tasks/i)).toBeInTheDocument();
    });
  });

  it('should handle loading state', async () => {
    // Create a delayed promise to simulate pending network response
    let resolveResponse: (value: any) => void;
    const delayedResponse = new Promise((resolve) => {
      resolveResponse = resolve;
    });

    global.fetch = vi.fn().mockReturnValue(
      Promise.resolve({
        ok: true,
        json: async () => {
          await delayedResponse;
          return { tasks: mockTasks, total: 2, hasMore: false };
        },
      })
    );

    render(<Tasks />);

    // Assert loading skeleton is present (animate-pulse indicates loading)
    const skeletonContainer = document.querySelector('.animate-pulse');
    expect(skeletonContainer).toBeInTheDocument();

    // Resolve the response
    resolveResponse!({ tasks: mockTasks, total: 2, hasMore: false });

    // Wait for final UI
    await waitFor(() => {
      expect(screen.getByText(/Background Tasks/i)).toBeInTheDocument();
    });
  });

  it('should handle empty state', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: [], total: 0, hasMore: false }),
    });

    render(<Tasks />);

    await waitFor(() => {
      expect(screen.getByText(/No tasks found/i)).toBeInTheDocument();
    });
  });

  it('should handle error state', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    render(<Tasks />);

    await waitFor(() => {
      expect(screen.getByText(/Error loading tasks/i)).toBeInTheDocument();
    });
  });

  it('should render task name in table', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: mockTasks, total: 2, hasMore: false }),
    });

    render(<Tasks />);

    await waitFor(() => {
      expect(screen.getByText(/Search movies/i)).toBeInTheDocument();
      expect(screen.getByText(/Turn on lights/i)).toBeInTheDocument();
    });
  });
});
