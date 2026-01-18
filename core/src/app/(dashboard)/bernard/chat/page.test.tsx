import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Chat from './page';

const mockRouterReplace = vi.fn();

const mockUseAuth = {
  state: { loading: false, user: { id: 'test-user-id', role: 'user' } },
};

const mockUseHealthStream = {
  serviceList: [
    { service: 'redis', name: 'Redis', status: 'up', responseTime: 5 },
    { service: 'whisper', name: 'Whisper', status: 'up', responseTime: 45 },
    { service: 'kokoro', name: 'Kokoro', status: 'down' },
    { service: 'bernard-agent', name: 'Bernard Agent', status: 'up', responseTime: 120 },
  ],
  isConnected: true,
  error: null,
  refresh: vi.fn(),
};

const mockUseThreads = {
  threads: [],
  createThread: vi.fn(),
  deleteThread: vi.fn(),
};

// Search params state
const searchParamsState: { params: Record<string, string> } = { params: {} };

function updateSearchParamsMock(params: Record<string, string>) {
  searchParamsState.params = params;
}

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
    useSearchParams: () => {
      const params = searchParamsState.params;
      return {
        get: (key: string) => (key in params ? params[key] : null),
        getAll: (key: string) => (key in params ? [params[key]] : []),
        has: (key: string) => key in params,
        entries: () => Object.entries(params),
        keys: () => Object.keys(params),
        values: () => Object.values(params),
        toString: () => new URLSearchParams(params).toString(),
      };
    },
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth,
}));

vi.mock('@/hooks/useHealthStream', () => ({
  useHealthStream: () => mockUseHealthStream,
}));

vi.mock('@/components/chat/Thread', () => ({
  Thread: () => <div data-testid="thread-component">Thread Component</div>,
}));

vi.mock('@/providers/StreamProvider', () => ({
  StreamProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="stream-provider">{children}</div>
  ),
}));

vi.mock('@/providers/ThreadProvider', () => ({
  ThreadProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="thread-provider">{children}</div>
  ),
  useThreads: () => mockUseThreads,
}));

vi.mock('@/components/dynamic-sidebar/configs', () => ({
  ChatSidebarConfig: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chat-sidebar-config">{children}</div>
  ),
}));

vi.mock('@/components/dynamic-header/configs', () => ({
  ChatHeaderConfig: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chat-header-config">{children}</div>
  ),
}));

describe('Chat Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSearchParamsMock({});
    mockRouterReplace.mockClear();
  });

  it('should render chat sidebar config', () => {
    render(<Chat />);

    expect(screen.getByTestId('chat-sidebar-config')).toBeInTheDocument();
  });

  it('should render chat header config', () => {
    render(<Chat />);

    expect(screen.getByTestId('chat-header-config')).toBeInTheDocument();
  });

  it('should render stream provider', () => {
    render(<Chat />);

    expect(screen.getByTestId('stream-provider')).toBeInTheDocument();
  });

  it('should render thread component', () => {
    render(<Chat />);

    expect(screen.getByTestId('thread-component')).toBeInTheDocument();
  });

  it('should redirect when threadId is invalid UUID', async () => {
    updateSearchParamsMock({ threadId: 'not-a-valid-uuid' });

    render(<Chat />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/bernard/chat');
    });
  });

  it('should not redirect for valid threadId', async () => {
    updateSearchParamsMock({ threadId: '550e8400-e29b-41d4-a716-446655440000' });

    render(<Chat />);

    await waitFor(() => {
      expect(screen.getByTestId('thread-component')).toBeInTheDocument();
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('should handle empty threadId', async () => {
    updateSearchParamsMock({ threadId: '' });

    render(<Chat />);

    await waitFor(() => {
      expect(screen.getByTestId('thread-component')).toBeInTheDocument();
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});
