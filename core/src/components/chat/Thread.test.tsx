import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Thread } from './Thread';
import type { Message } from '@langchain/langgraph-sdk';

// ============================================
// HOISTED REFERENCES (for proper hoisting)
// ====================================
const mockStreamContext = vi.hoisted(() => ({
  current: {
    messages: [] as Message[],
    getMessagesMetadata: () => ({}) as { branch?: string; branchOptions?: string[]; firstSeenState?: { parent_checkpoint?: any } },
    isLoading: false,
    submit: vi.fn(),
    stop: vi.fn(),
    latestProgress: null,
    setBranch: vi.fn(),
    resetProgress: vi.fn(),
  },
}));

const mockThreadContext = vi.hoisted(() => ({
  current: {
    threads: [] as any[],
    getThreads: vi.fn().mockResolvedValue([]),
    setThreads: vi.fn(),
    createThread: vi.fn(),
    createNewThread: vi.fn().mockResolvedValue('new-thread'),
    updateThread: vi.fn().mockResolvedValue(undefined),
    deleteThread: vi.fn().mockResolvedValue(undefined),
    threadsLoading: false,
  },
}));

// ============================================
// NEXT.JS NAVIGATION MOCK
// ============================================
const mockSetSearchParams = vi.fn();
const mockSearchParams = new URLSearchParams();

const getSearchParamsMock = vi.hoisted(() => {
  return () => mockSearchParams;
});

const mockUseRouter = vi.hoisted(() => {
  return vi.fn();
});

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual('next/navigation');
  return {
    ...actual,
    useSearchParams: getSearchParamsMock,
    useRouter: mockUseRouter,
  };
});

// ============================================
// PROVIDER MOCKS
// ============================================
const getStreamContextMock = vi.hoisted(() => {
  return () => mockStreamContext.current;
});

const getThreadsMock = vi.hoisted(() => {
  return () => ({
    threads: [],
    getThreads: vi.fn().mockResolvedValue([]),
    createNewThread: vi.fn().mockResolvedValue('new-thread'),
    threadsLoading: false,
  });
});

const getAuthMock = vi.hoisted(() => {
  return () => ({
    state: { user: null, loading: false, error: null },
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
  });
});

const getDarkModeMock = vi.hoisted(() => {
  return () => ({
    isDarkMode: false,
    toggleDarkMode: vi.fn(),
    setDarkMode: vi.fn(),
  });
});

vi.mock('../../providers/StreamProvider', async () => {
  const actual = await vi.importActual('../../providers/StreamProvider');
  return {
    ...actual,
    useStreamContext: getStreamContextMock,
  };
});

vi.mock('../../providers/ThreadProvider', async () => {
  const actual = await vi.importActual('../../providers/ThreadProvider');
  return {
    ...actual,
    useThreads: getThreadsMock,
  };
});

vi.mock('../../hooks/useAuth', async () => {
  const actual = await vi.importActual('../../hooks/useAuth');
  return {
    ...actual,
    useAuth: getAuthMock,
  };
});

vi.mock('../../hooks/useDarkMode', async () => {
  const actual = await vi.importActual('../../hooks/useDarkMode');
  return {
    ...actual,
    useDarkMode: getDarkModeMock,
  };
});

// ============================================
// OTHER MOCKS
// ============================================
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    PanelRightOpen: ({ className, onClick, 'aria-label': ariaLabel }: { className?: string; onClick?: () => void; 'aria-label'?: string }) => (
      <button data-testid="sidebar-toggle" className={className} onClick={onClick} aria-label={ariaLabel}>PanelRightOpen</button>
    ),
    PenSquare: ({ className, onClick }: { className?: string; onClick?: () => void }) => (
      <button data-testid="new-chat" className={className} onClick={onClick}>PenSquare</button>
    ),
    MoreVertical: ({ className, onClick }: { className?: string; onClick?: () => void }) => (
      <button data-testid="more-menu" className={className} onClick={onClick}>MoreVertical</button>
    ),
    Ghost: ({ className }: { className?: string }) => <span data-testid="ghost-mode" className={className}>Ghost</span>,
    Plus: ({ className }: { className?: string }) => <span data-testid="plus-icon" className={className}>Plus</span>,
    Copy: ({ className }: { className?: string }) => <span data-testid="copy-icon" className={className}>Copy</span>,
    Download: ({ className }: { className?: string }) => <span data-testid="download-icon" className={className}>Download</span>,
    Sun: ({ className }: { className?: string }) => <span data-testid="sun-icon" className={className}>Sun</span>,
    Moon: ({ className }: { className?: string }) => <span data-testid="moon-icon" className={className}>Moon</span>,
    Send: ({ className }: { className?: string }) => <span data-testid="send-icon" className={className}>Send</span>,
    StopCircle: ({ className }: { className?: string }) => <span data-testid="stop-icon" className={className}>StopCircle</span>,
  };
});

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion');
  return {
    ...actual,
    motion: {
      div: ({ children, className, 'data-testid': dataTestid }: any) => (
        <div className={className} data-testid={dataTestid}>{children}</div>
      ),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// ============================================
// HELPERS
// ============================================
function createMockHumanMessage(content: string = 'Test message'): Message {
  return {
    id: `msg-${Date.now()}`,
    type: 'human',
    content,
  };
}

function createMockAssistantMessage(content: string = 'Test response'): Message {
  return {
    id: `msg-${Date.now()}`,
    type: 'ai',
    content,
  };
}

function createMockMessageThread(length: number = 3): Message[] {
  const messages: Message[] = [];
  for (let i = 0; i < length; i++) {
    messages.push(
      i % 2 === 0 
        ? createMockHumanMessage(`User message ${i}`)
        : createMockAssistantMessage(`Assistant response ${i}`)
    );
  }
  return messages;
}

// ============================================
// TEST SUITE
// ============================================
describe('Thread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock contexts
    mockStreamContext.current.messages = [];
    mockStreamContext.current.getMessagesMetadata = () => ({});
    mockStreamContext.current.isLoading = false;
    mockThreadContext.current.threads = [];
    mockThreadContext.current.threadsLoading = false;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Initial State', () => {
    it('renders welcome message when no messages exist', () => {
      mockStreamContext.current.messages = [];
      
      render(<Thread />);
      
      expect(screen.getByTestId('welcome-message')).toBeInTheDocument();
    });

    it('renders chat input area', () => {
      render(<Thread />);
      
      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    });

    it('renders send button in initial state', () => {
      render(<Thread />);
      
      expect(screen.getByTestId('send-button')).toBeInTheDocument();
    });

    it('disables send button when input is empty', () => {
      render(<Thread />);
      
      const sendButton = screen.getByTestId('send-button');
      expect(sendButton).toBeDisabled();
    });
  });

  describe('Message Rendering', () => {
    it('renders human messages', () => {
      const message = createMockHumanMessage('Hello');
      mockStreamContext.current.messages = [message];
      
      render(<Thread />);
      
      expect(screen.getByTestId('human-message')).toBeInTheDocument();
    });

    it('renders assistant messages', () => {
      const message = createMockAssistantMessage('Hi there!');
      mockStreamContext.current.messages = [message];
      
      render(<Thread />);
      
      expect(screen.getByTestId('assistant-message')).toBeInTheDocument();
    });

    it('hides welcome message when messages exist', () => {
      const message = createMockHumanMessage('Hello');
      mockStreamContext.current.messages = [message];
      
      render(<Thread />);
      
      expect(screen.queryByTestId('welcome-message')).not.toBeInTheDocument();
    });

    it('renders multiple message pairs', () => {
      const messages = createMockMessageThread(4);
      mockStreamContext.current.messages = messages;
      
      render(<Thread />);
      
      expect(screen.getByTestId('chat-messages-list')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator when isLoading is true and no progress', () => {
      mockStreamContext.current.isLoading = true;
      mockStreamContext.current.messages = [];
      mockStreamContext.current.latestProgress = null;
      
      render(<Thread />);
      
      expect(screen.getByTestId('assistant-message-loading')).toBeInTheDocument();
    });

  it('shows progress indicator when progress is available', () => {
    mockStreamContext.current.isLoading = true;
    mockStreamContext.current.messages = [];
    mockStreamContext.current.latestProgress = {
      type: 'progress',
      tool: 'search',
      message: 'Searching...',
      timestamp: Date.now(),
    } as any;
    
    render(<Thread />);
    
    expect(screen.getByTestId('progress-indicator')).toBeInTheDocument();
  });

    it('shows stop button during loading', () => {
      mockStreamContext.current.isLoading = true;
      mockStreamContext.current.messages = [];
      
      render(<Thread />);
      
      expect(screen.getByTestId('stop-button')).toBeInTheDocument();
    });
  });

  describe('User Input', () => {
    it('enables send button when input has content', () => {
      render(<Thread />);
      
      const input = screen.getByTestId('chat-input');
      fireEvent.change(input, { target: { value: 'Hello' } });
      
      const sendButton = screen.getByTestId('send-button');
      expect(sendButton).not.toBeDisabled();
    });

    it('calls submit when form is submitted', async () => {
      mockStreamContext.current.messages = [];
      
      render(<Thread />);
      
      const input = screen.getByTestId('chat-input');
      const sendButton = screen.getByTestId('send-button');
      
      fireEvent.change(input, { target: { value: 'Hello' } });
      fireEvent.click(sendButton);
      
      await waitFor(() => {
        expect(mockStreamContext.current.submit).toHaveBeenCalled();
      });
    });

    it('clears input after submission', async () => {
      mockStreamContext.current.messages = [];
      
      render(<Thread />);
      
      const input = screen.getByTestId('chat-input');
      const sendButton = screen.getByTestId('send-button');
      
      fireEvent.change(input, { target: { value: 'Hello' } });
      fireEvent.click(sendButton);
      
      await waitFor(() => {
        expect(input).toHaveValue('');
      });
    });

    it('does not submit empty messages', () => {
      mockStreamContext.current.messages = [];
      
      render(<Thread />);
      
      const sendButton = screen.getByTestId('send-button');
      fireEvent.click(sendButton);
      
      expect(mockStreamContext.current.submit).not.toHaveBeenCalled();
    });
  });

  describe('Stop Button', () => {
    it('calls stop function when stop button is clicked', () => {
      mockStreamContext.current.isLoading = true;
      mockStreamContext.current.messages = [];
      
      render(<Thread />);
      
      const stopButton = screen.getByTestId('stop-button');
      fireEvent.click(stopButton);
      
      expect(mockStreamContext.current.stop).toHaveBeenCalled();
    });
  });

  describe('Message Content', () => {
    it('renders human message content', () => {
      const message = createMockHumanMessage('Test message');
      mockStreamContext.current.messages = [message];
      
      render(<Thread />);
      
      expect(screen.getByTestId('human-message')).toHaveTextContent('Test message');
    });

    it('renders assistant message content', () => {
      const message = createMockAssistantMessage('Test response');
      mockStreamContext.current.messages = [message];
      
      render(<Thread />);
      
      expect(screen.getByTestId('assistant-message')).toHaveTextContent('Test response');
    });
  });
});
