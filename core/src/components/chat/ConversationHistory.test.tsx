import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ThreadListItem } from '@/services/api';

// ============================================
// LOCALSTORAGE MOCK (must be hoisted)
// ============================================
const localStorageMock = vi.hoisted(() => ({
  getItem: vi.fn((key: string): string | null => {
    if (key === 'bernard-chat-sidebar-open') {
      return '"true"';
    }
    return null;
  }),
  setItem: vi.fn((): void => { }),
  removeItem: vi.fn((): void => { }),
  clear: vi.fn((): void => { }),
  get length() { return 0; },
  key: vi.fn((): null => null),
}));

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ============================================
// HOISTED MOCK CONTEXTS (must be hoisted)
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

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => {
      const params = new URLSearchParams();
      const setParams = vi.fn();
      return [params, setParams] as const;
    },
    useNavigate: () => vi.fn(),
    Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
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
import { ConversationHistory, SIDEBAR_STORAGE_KEY } from './ConversationHistory';

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

// ============================================
// TEST SUITE
// ============================================
describe('ConversationHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThreadContext.threads = [];
    mockThreadContext.threadsLoading = false;
    mockAuthContext.state = { user: null, loading: false, error: null };
    localStorageMock.getItem.mockReturnValue('"true"');
    localStorageMock.setItem.mockClear();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Sidebar Toggle', () => {
    it('renders sidebar in default open state', () => {
      render(<ConversationHistory />);

      expect(screen.getByTestId('conversation-history-sidebar')).toBeInTheDocument();
    });

    it('toggles sidebar when toggle button is clicked', async () => {
      render(<ConversationHistory />);

      const toggleButton = screen.getByTestId('sidebar-toggle-button');
      fireEvent.click(toggleButton);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        SIDEBAR_STORAGE_KEY,
        JSON.stringify(false)
      );
    });
  });

  describe('Thread List', () => {
    it('renders thread list when threads are loaded', () => {
      mockThreadContext.threads = [
        createMockThread({ id: 'thread-1', name: 'Test Thread 1' }),
        createMockThread({ id: 'thread-2', name: 'Test Thread 2' }),
      ];
      mockThreadContext.threadsLoading = false;

      render(<ConversationHistory />);

      const sidebar = screen.getByTestId('conversation-history-sidebar');
      const threadList = within(sidebar).getByTestId('thread-list-component');
      expect(threadList).toBeInTheDocument();
      expect(within(sidebar).getByTestId('thread-item-button-thread-1')).toBeInTheDocument();
      expect(within(sidebar).getByTestId('thread-item-button-thread-2')).toBeInTheDocument();
    });

    it('shows loading skeleton when threads are loading', () => {
      mockThreadContext.threadsLoading = true;

      render(<ConversationHistory />);

      const sidebar = screen.getByTestId('conversation-history-sidebar');
      expect(within(sidebar).getByTestId('thread-history-loading')).toBeInTheDocument();
    });

    it('shows empty state when no threads exist', () => {
      mockThreadContext.threads = [];
      mockThreadContext.threadsLoading = false;

      render(<ConversationHistory />);

      const sidebar = screen.getByTestId('conversation-history-sidebar');
      expect(within(sidebar).getByTestId('no-threads-message')).toBeInTheDocument();
      expect(within(sidebar).getByText('No chats yet')).toBeInTheDocument();
    });
  });

  describe('New Chat Button', () => {
    it('creates new thread when new chat button is clicked', async () => {
      mockThreadContext.createNewThread = vi.fn().mockResolvedValue('new-thread-id');
      mockThreadContext.threads = [];
      mockThreadContext.threadsLoading = false;

      render(<ConversationHistory />);

      const newChatButton = screen.getByTestId('new-chat-button');
      fireEvent.click(newChatButton);

      await waitFor(() => {
        expect(mockThreadContext.createNewThread).toHaveBeenCalled();
      });
    });
  });

  describe('Mobile Sidebar', () => {
    it('renders mobile toggle button', () => {
      render(<ConversationHistory />);

      expect(screen.getByTestId('mobile-sidebar-toggle')).toBeInTheDocument();
    });

    it('opens mobile sidebar when toggle is clicked', () => {
      render(<ConversationHistory />);

      const toggleButton = screen.getByTestId('mobile-sidebar-toggle');
      fireEvent.click(toggleButton);

      expect(screen.getByTestId('mobile-sidebar')).toBeInTheDocument();
    });
  });
});

describe('useSidebarState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockClear();
  });

  it('initializes with default open state', () => {
    render(<ConversationHistory />);

    expect(screen.getByTestId('conversation-history-sidebar')).toBeInTheDocument();
  });

  it('persists sidebar state to localStorage', () => {
    render(<ConversationHistory />);

    const toggleButton = screen.getByTestId('sidebar-toggle-button');
    fireEvent.click(toggleButton);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      SIDEBAR_STORAGE_KEY,
      JSON.stringify(false)
    );
  });
});
