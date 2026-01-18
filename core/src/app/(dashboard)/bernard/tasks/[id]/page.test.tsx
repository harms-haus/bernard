// core/src/app/(dashboard)/bernard/tasks/[id]/page.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import TaskDetail from './page';
import { RouterTestProvider } from '@/test/providers';
import { enableGlobalMockFetch, disableGlobalMockFetch, createMockFetch } from '@/test/mocks/fetch';

// ============================================================================
// Mock API response
// ============================================================================

const mockTaskResponse = {
  task: {
    id: 'task-123',
    name: 'Search movies',
    status: 'completed' as const,
    toolName: 'overseerr-find-media',
    createdAt: '2026-01-18T10:00:00Z',
    startedAt: '2026-01-18T10:00:05Z',
    completedAt: '2026-01-18T10:00:45Z',
    runtimeMs: 40000,
    errorMessage: null,
    messageCount: 5,
    toolCallCount: 2,
    tokensIn: 1200,
    tokensOut: 800,
    archived: false,
  },
  events: [
    {
      type: 'task_started',
      timestamp: '2026-01-18T10:00:05Z',
      data: {},
    },
    {
      type: 'message_recorded',
      timestamp: '2026-01-18T10:00:10Z',
      data: { content: 'Searching for popular sci-fi movies...' },
    },
    {
      type: 'task_completed',
      timestamp: '2026-01-18T10:00:45Z',
      data: {},
    },
  ],
  sections: {},
  messages: [
    {
      id: 'msg-1',
      role: 'user' as const,
      content: 'Find me some sci-fi movies to watch',
      createdAt: '2026-01-18T10:00:00Z',
    },
    {
      id: 'msg-2',
      role: 'assistant' as const,
      content: 'I\'ll search for sci-fi movies for you.',
      createdAt: '2026-01-18T10:00:01Z',
    },
  ],
};

// ============================================================================
// Mock hooks and components
// ============================================================================

const mockUseAuth = vi.fn().mockReturnValue({
  loading: false,
  user: { id: 'test-user-id', role: 'user' },
});

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useParams: () => ({ id: 'task-123' }),
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      refresh: vi.fn(),
    }),
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/useDarkMode', () => ({
  DarkModeProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ============================================================================
// Test setup
// ============================================================================

const renderTaskDetail = () => {
  return render(
    <RouterTestProvider router={{ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }}>
      <TaskDetail />
    </RouterTestProvider>
  );
};

describe('Task Detail Page', () => {
  let mockFetch: ReturnType<typeof createMockFetch>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      loading: false,
      user: { id: 'test-user-id', role: 'user' },
    });
    mockFetch = enableGlobalMockFetch();
  });

  afterEach(() => {
    disableGlobalMockFetch();
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Test 1: Initial render and loading state
  // ============================================================================

  describe('Initial Render', () => {
    it('should render loading skeleton while fetching task', async () => {
      // Set up a delayed response to keep loading state
      let resolveResponse: (value: any) => void;
      const delayedResponse = new Promise((resolve) => {
        resolveResponse = resolve;
      });

      mockFetch.setResponse('/api/tasks/task-123', {
        json: async () => {
          await delayedResponse;
          return mockTaskResponse;
        },
      });

      renderTaskDetail();

      // Assert skeleton is present (animate-pulse class indicates loading state)
      const skeletonContainer = document.querySelector('.animate-pulse');
      expect(skeletonContainer).toBeInTheDocument();

      // Resolve the response
      resolveResponse!(mockTaskResponse);

      // Wait for final UI
      await waitFor(() => {
        expect(screen.getByText(/Tasks/i)).toBeInTheDocument();
      });
    });

    it('should fetch task data on mount', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { json: mockTaskResponse });

      renderTaskDetail();

      await waitFor(() => {
        expect(mockFetch.callCount()).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ============================================================================
  // Test 2: Task data display
  // ============================================================================

  describe('Task Data Display', () => {
    it('should render task name in header', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { json: mockTaskResponse });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/Search movies/i)).toBeInTheDocument();
      });
    });

    it('should render task ID', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { json: mockTaskResponse });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/Task ID: task-123/i)).toBeInTheDocument();
      });
    });

    it('should render task status badge', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { json: mockTaskResponse });

      renderTaskDetail();

      await waitFor(() => {
        const badges = screen.getAllByText(/completed/i);
        expect(badges.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should render tool name', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { json: mockTaskResponse });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/overseerr-find-media/i)).toBeInTheDocument();
      });
    });

    it('should render runtime duration', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { json: mockTaskResponse });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/40s/i)).toBeInTheDocument();
      });
    });

    it('should render task statistics', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { json: mockTaskResponse });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/2 tool calls/i)).toBeInTheDocument();
        expect(screen.getByText(/5 messages/i)).toBeInTheDocument();
        expect(screen.getByText(/1200 input tokens/i)).toBeInTheDocument();
        expect(screen.getByText(/800 output tokens/i)).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // Test 3: Execution log
  // ============================================================================

  describe('Execution Log', () => {
    it('should render Execution Log section', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { json: mockTaskResponse });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/Execution Log/i)).toBeInTheDocument();
      });
    });

    it('should render task started event', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { json: mockTaskResponse });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/Task Started/i)).toBeInTheDocument();
      });
    });

    it('should render task message events', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { json: mockTaskResponse });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/Task Message/i)).toBeInTheDocument();
        expect(screen.getByText(/Searching for popular sci-fi movies/i)).toBeInTheDocument();
      });
    });

    it('should render task completed event', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { json: mockTaskResponse });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/Task Completed/i)).toBeInTheDocument();
      });
    });

    it('should render chat messages', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { json: mockTaskResponse });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/user/i)).toBeInTheDocument();
        expect(screen.getByText(/assistant/i)).toBeInTheDocument();
        expect(screen.getByText(/Find me some sci-fi movies to watch/i)).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // Test 4: Navigation
  // ============================================================================

  describe('Navigation', () => {
    it('should render back button', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { json: mockTaskResponse });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/Back to Tasks/i)).toBeInTheDocument();
      });
    });

    it('should link to tasks list page', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { json: mockTaskResponse });

      renderTaskDetail();

      await waitFor(() => {
        const backLink = screen.getByRole('link', { name: /Back to Tasks/i });
        expect(backLink).toHaveAttribute('href', '/bernard/tasks');
      });
    });
  });

  // ============================================================================
  // Test 5: Refresh functionality
  // ============================================================================

  describe('Refresh Functionality', () => {
    it('should render refresh button', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { json: mockTaskResponse });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
      });
    });

    it('should refetch task data on refresh click', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { json: mockTaskResponse });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
      });

      const refreshButton = screen.getByRole('button', { name: /Refresh/i });
      mockFetch.reset();
      mockFetch.setResponse('/api/tasks/task-123', { json: mockTaskResponse });
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(mockFetch.callCount()).toBeGreaterThan(0);
      });
    });
  });

  // ============================================================================
  // Test 6: Error handling
  // ============================================================================

  describe('Error Handling', () => {
    it('should display error message on fetch failure', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { ok: false, json: { error: 'Failed to load task' } });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/Failed to load task/i)).toBeInTheDocument();
      });
    });

    it('should show task not found when task is null', async () => {
      mockFetch.setResponse('/api/tasks/task-123', {
        json: { task: null, events: [], sections: {}, messages: [] },
      });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/Task not found/i)).toBeInTheDocument();
      });
    });

    it('should show back button on error state', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { ok: false, json: { error: 'Error' } });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /Back to Tasks/i })).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // Test 7: Different task statuses
  // ============================================================================

  describe('Task Status Variations', () => {
    it('should display running status', async () => {
      const runningTask = {
        ...mockTaskResponse,
        task: { ...mockTaskResponse.task, status: 'running' as const },
      };
      mockFetch.setResponse('/api/tasks/task-123', { json: runningTask });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/running/i)).toBeInTheDocument();
      });
    });

    it('should display errored status', async () => {
      const erroredTask = {
        ...mockTaskResponse,
        task: { ...mockTaskResponse.task, status: 'errored' as const, errorMessage: 'Connection failed' },
      };
      mockFetch.setResponse('/api/tasks/task-123', { json: erroredTask });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/errored/i)).toBeInTheDocument();
        expect(screen.getByText(/Connection failed/i)).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // Test 8: Task Details sidebar
  // ============================================================================

  describe('Task Details Sidebar', () => {
    it('should render Task Details section', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { json: mockTaskResponse });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/Task Details/i)).toBeInTheDocument();
      });
    });

    it('should render created date label', async () => {
      mockFetch.setResponse('/api/tasks/task-123', { json: mockTaskResponse });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/Created/i)).toBeInTheDocument();
      });
    });

    it('should show archived badge when task is archived', async () => {
      const archivedTask = {
        ...mockTaskResponse,
        task: { ...mockTaskResponse.task, archived: true },
      };
      mockFetch.setResponse('/api/tasks/task-123', { json: archivedTask });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/Archived/i)).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // Test 9: Sections display
  // ============================================================================

  describe('Sections Display', () => {
    it('should render sections content when available', async () => {
      const taskWithSections = {
        ...mockTaskResponse,
        sections: {
          result: {
            name: 'Search Results',
            description: 'Movies found by the search',
            content: 'Found 5 movies matching your criteria.',
          },
        },
      };
      mockFetch.setResponse('/api/tasks/task-123', { json: taskWithSections });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/Search Results/i)).toBeInTheDocument();
        expect(screen.getByText(/Movies found by the search/i)).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // Test 10: Empty execution data
  // ============================================================================

  describe('Empty Execution Data', () => {
    it('should show message when no execution data available', async () => {
      const emptyTask = {
        ...mockTaskResponse,
        events: [],
        messages: [],
      };
      mockFetch.setResponse('/api/tasks/task-123', { json: emptyTask });

      renderTaskDetail();

      await waitFor(() => {
        expect(screen.getByText(/No execution data available/i)).toBeInTheDocument();
      });
    });
  });
});
