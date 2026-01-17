import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Suspense } from 'react';
import type { ThreadListItem } from '@/services/api';

// ============================================
// HOISTED MOCK CONTEXTS (must be hoisted for vi.mock)
// ============================================
const mockThreadContext = vi.hoisted(() => ({
  threads: [] as ThreadListItem[],
  getThreads: vi.fn().mockResolvedValue([]),
  setThreads: vi.fn(),
  createThread: vi.fn(),
  createNewThread: vi.fn().mockResolvedValue('new-thread'),
  updateThread: vi.fn().mockResolvedValue(undefined),
  deleteThread: vi.fn().mockResolvedValue(undefined),
  threadsLoading: false,
}));

const mockAuthContext = vi.hoisted(() => ({
  state: { user: null, loading: false, error: null },
  login: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
}));

// ============================================
// NEXT.JS NAVIGATION MOCK (must be hoisted)
// ============================================
const mockSearchParams = vi.hoisted(() => new URLSearchParams());
const mockRouterReplace = vi.hoisted(() => vi.fn());
const mockRouterPush = vi.hoisted(() => vi.fn());
const mockRouterBack = vi.hoisted(() => vi.fn());
const mockRouterForward = vi.hoisted(() => vi.fn());
const mockRouterRefresh = vi.hoisted(() => vi.fn());
const mockRouter = vi.hoisted(() => ({
  replace: mockRouterReplace,
  push: mockRouterPush,
  back: mockRouterBack,
  forward: mockRouterForward,
  refresh: mockRouterRefresh,
}));
const mockUseRouter = vi.hoisted(() => () => mockRouter);

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual('next/navigation');
  return {
    ...actual,
    useSearchParams: () => mockSearchParams,
    useRouter: mockUseRouter,
  };
});

// ============================================
// MOCKS (must be hoisted)
// ============================================
vi.mock('../../providers/ThreadProvider', async () => {
  const actual = await vi.importActual('../../providers/ThreadProvider');
  return {
    ...actual,
    useThreads: () => mockThreadContext,
  };
});

vi.mock('../../hooks/useAuth', async () => {
  const actual = await vi.importActual('../../hooks/useAuth');
  return {
    ...actual,
    useAuth: () => mockAuthContext,
  };
});

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion');
  return {
    ...actual,
    motion: {
      div: ({ children, className, 'data-testid': testid, ...props }: any) => (
        <div className={className} data-testid={testid} {...props}>{children}</div>
      ),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    PanelRight: ({ className, onClick, 'data-testid': testId }: any) => (
      <svg data-testid={testId || 'panel-right'} className={className} onClick={onClick}>PanelRight</svg>
    ),
    PanelRightOpen: ({ className, onClick, 'data-testid': testId }: any) => (
      <svg data-testid={testId || 'panel-right-open'} className={className} onClick={onClick}>PanelRightOpen</svg>
    ),
    Plus: ({ className }: any) => <span data-testid="plus-icon" className={className}>Plus</span>,
    Shield: ({ className }: any) => <span data-testid="shield-icon" className={className}>Shield</span>,
    X: ({ className, onClick }: any) => (
      <svg data-testid="close-sidebar" className={className} onClick={onClick}>X</svg>
    ),
    MoreVertical: ({ className }: any) => <span data-testid="more-vertical" className={className}>MoreVertical</span>,
    Trash2: ({ className }: any) => <span data-testid="trash2" className={className}>Trash2</span>,
    Pencil: ({ className }: any) => <span data-testid="pencil" className={className}>Pencil</span>,
    Check: ({ className }: any) => <span data-testid="check" className={className}>Check</span>,
    Wand2: ({ className }: any) => <span data-testid="wand2" className={className}>Wand2</span>,
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./TypedText', () => ({
  TypedText: ({ text, className }: { text: string; className?: string }) => (
    <span className={className} data-testid="typed-text">{text}</span>
  ),
}));

// ============================================
// IMPORTS AFTER MOCKS
// ============================================
import { ConversationHistory } from './ConversationHistory';
import { SIDEBAR_STORAGE_KEY } from './SidebarProvider';

// ============================================
// HELPERS
// ============================================
function createMockThread(overrides: Partial<ThreadListItem> = {}): ThreadListItem {
  const now = new Date().toISOString();
  return {
    id: `thread-${Date.now()}`,
    name: 'Test Thread',
    createdAt: now,
    lastTouchedAt: now,
    messageCount: 0,
    ...overrides,
  };
}

// Helper to render with Suspense for useSearchParams
function renderWithSuspense(ui: React.ReactElement) {
  return render(
    <Suspense fallback={<div data-testid="loading">Loading...</div>}>
      {ui}
    </Suspense>
  );
}

// ============================================
// TEST SUITE
// ============================================
describe('ConversationHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThreadContext.threads = [];
    mockThreadContext.threadsLoading = false;
    mockAuthContext.state = { user: null, loading: false, error: null };
    mockRouterReplace.mockClear();
    mockRouterPush.mockClear();
  });

  afterEach(() => {
    vi.resetAllMocks();
    cleanup();
  });

  describe('Sidebar Toggle', () => {
    afterEach(() => {
      cleanup();
    });

    it('renders sidebar in default open state', () => {
      renderWithSuspense(<ConversationHistory />);

      expect(screen.getByTestId('conversation-history-sidebar')).toBeInTheDocument();
    });

    it('toggles sidebar when toggle button is clicked', async () => {
      renderWithSuspense(<ConversationHistory />);

      const sidebar = screen.getByTestId('conversation-history-sidebar');
      const toggleButton = screen.getByTestId('sidebar-toggle-button');
      
      // Initially sidebar should be open
      expect(within(sidebar).getByTestId('thread-list-component')).toBeInTheDocument();
      
      fireEvent.click(toggleButton);

      // Verify sidebar was toggled closed by checking for hidden classes
      await waitFor(() => {
        expect(sidebar).toHaveClass('w-0', 'overflow-hidden');
      });
    });
  });

  describe('Thread List', () => {
    afterEach(() => {
      cleanup();
    });

    it('renders thread list when threads are loaded', () => {
      mockThreadContext.threads = [
        createMockThread({ id: 'thread-1', name: 'Test Thread 1' }),
        createMockThread({ id: 'thread-2', name: 'Test Thread 2' }),
      ];
      mockThreadContext.threadsLoading = false;

      renderWithSuspense(<ConversationHistory />);

      const sidebar = screen.getByTestId('conversation-history-sidebar');
      const threadList = within(sidebar).getByTestId('thread-list-component');
      expect(threadList).toBeInTheDocument();
      expect(within(sidebar).getByTestId('thread-item-button-thread-1')).toBeInTheDocument();
      expect(within(sidebar).getByTestId('thread-item-button-thread-2')).toBeInTheDocument();
    });

    it('shows loading skeleton when threads are loading', () => {
      mockThreadContext.threadsLoading = true;

      renderWithSuspense(<ConversationHistory />);

      const sidebar = screen.getByTestId('conversation-history-sidebar');
      expect(within(sidebar).getByTestId('thread-history-loading')).toBeInTheDocument();
    });

    it('shows empty state when no threads exist', () => {
      mockThreadContext.threads = [];
      mockThreadContext.threadsLoading = false;

      renderWithSuspense(<ConversationHistory />);

      const sidebar = screen.getByTestId('conversation-history-sidebar');
      expect(within(sidebar).getByTestId('no-threads-message')).toBeInTheDocument();
      expect(within(sidebar).getByText('No chats yet')).toBeInTheDocument();
    });
  });

  describe('New Chat Button', () => {
    afterEach(() => {
      cleanup();
    });

    it('creates new thread when new chat button is clicked', async () => {
      mockThreadContext.createNewThread = vi.fn().mockResolvedValue('new-thread-id');
      mockThreadContext.threads = [];
      mockThreadContext.threadsLoading = false;

      renderWithSuspense(<ConversationHistory />);

      const newChatButton = screen.getByTestId('new-chat-button');
      fireEvent.click(newChatButton);

      await waitFor(() => {
        expect(mockThreadContext.createNewThread).toHaveBeenCalled();
      });
    });
  });

  describe('Mobile Sidebar', () => {
    afterEach(() => {
      cleanup();
    });

    it('renders mobile toggle button', () => {
      renderWithSuspense(<ConversationHistory />);

      expect(screen.getByTestId('mobile-sidebar-toggle')).toBeInTheDocument();
    });

    it('opens mobile sidebar when toggle is clicked', () => {
      renderWithSuspense(<ConversationHistory />);

      const toggleButton = screen.getByTestId('mobile-sidebar-toggle');
      fireEvent.click(toggleButton);

      expect(screen.getByTestId('mobile-sidebar')).toBeInTheDocument();
    });
  });
});

describe('useSidebarState', () => {
  afterEach(() => {
    cleanup();
  });

  it('initializes with default open state', () => {
    renderWithSuspense(<ConversationHistory />);

    const sidebar = screen.getByTestId('conversation-history-sidebar');
    expect(sidebar).toBeInTheDocument();
    // Thread list should be visible initially in the desktop sidebar
    expect(within(sidebar).getByTestId('thread-list-component')).toBeInTheDocument();
  });

  it('toggles sidebar state', async () => {
    renderWithSuspense(<ConversationHistory />);

    const toggleButton = screen.getByTestId('sidebar-toggle-button');
    const sidebar = screen.getByTestId('conversation-history-sidebar');

    // Initially, sidebar should be open (default state is true)
    expect(sidebar).toHaveClass('w-[300px]');
    expect(sidebar).not.toHaveClass('w-0', 'overflow-hidden');

    // Click the toggle button to close sidebar
    fireEvent.click(toggleButton);

    // Verify sidebar is now closed
    await waitFor(() => {
      expect(sidebar).toHaveClass('w-0', 'overflow-hidden');
      expect(sidebar).not.toHaveClass('w-[300px]');
    });

    // Verify toggle button is still accessible
    expect(toggleButton).toBeInTheDocument();
  });
});
