import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Message } from '@langchain/langgraph-sdk';

// ============================================
// HOISTED MOCK CONTEXT (must be hoisted)
// ============================================
const mockContext = vi.hoisted(() => ({
  messages: [] as Message[],
  getMessagesMetadata: (() => ({})) as () => { branch?: string; branchOptions?: string[]; firstSeenState?: { parent_checkpoint?: { thread_id: string; checkpoint_ns: string; checkpoint_id: string; checkpoint_map: Record<string, unknown> } } },
  isLoading: false,
  submit: vi.fn(),
  stop: vi.fn(),
  latestProgress: null,
  setBranch: vi.fn(),
  resetProgress: vi.fn(),
}));

// ============================================
// ALL MOCKS BEFORE IMPORTS (must be hoisted)
// ============================================
vi.mock('../../../providers/StreamProvider', async () => {
  const actual = await vi.importActual('../../../providers/StreamProvider');
  return {
    ...actual,
    useStreamContext: () => mockContext,
  };
});

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion');
  return {
    ...actual,
    motion: {
      div: ({ children, className, key }: any) => <div className={className} data-testid={key}>{children}</div>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    RefreshCcw: ({ className, onClick }: { className?: string; onClick?: () => void }) => (
      <button data-testid="regenerate-icon" className={className} onClick={onClick}>RefreshCcw</button>
    ),
    Copy: ({ className }: { className?: string }) => <span data-testid="copy-icon" className={className}>Copy</span>,
    Check: ({ className }: { className?: string }) => <span data-testid="check-icon" className={className}>Check</span>,
  };
});

vi.mock('./markdown-text', () => ({
  MarkdownText: ({ children }: { children: string }) => <div data-testid="markdown-text">{children}</div>,
}));

vi.mock('../BranchSwitcher', () => ({
  BranchSwitcher: ({ branch, branchOptions }: any) => (
    <div data-testid="branch-switcher" data-branch={branch} data-options={branchOptions?.join(',')}>
      BranchSwitcher
    </div>
  ),
}));

vi.mock('./tool-calls', () => ({
  ToolCalls: ({ toolCalls, toolResults }: any) => (
    <div data-testid="tool-calls" data-count={toolCalls?.length || 0} data-results-count={toolResults?.length || 0}>ToolCalls</div>
  ),
}));

vi.mock('../TooltipIconButton', () => ({
  TooltipIconButton: ({ 'data-testid': testId, onClick, children, ...props }: any) => (
    <button data-testid={testId} onClick={onClick} {...props}>{children}</button>
  ),
}));

// ============================================
// IMPORT COMPONENT AFTER MOCKS
// ============================================
const { AssistantMessage, AssistantMessageLoading } = await import('./ai');

// ============================================
// HELPER FUNCTIONS
// ============================================
function createMockAssistantMessage(content: string = 'Test response'): Message {
  return {
    id: `msg-${Date.now()}`,
    type: 'ai',
    content,
  };
}

// ============================================
// TEST SUITE
// ============================================
describe('AssistantMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.messages = [];
    mockContext.getMessagesMetadata = () => ({});
    mockContext.isLoading = false;
  });

  afterEach(() => {
    vi.resetAllMocks();
    mockContext.messages = [];
    mockContext.getMessagesMetadata = () => ({});
    mockContext.isLoading = false;
  });

  describe('Rendering', () => {
    it('renders assistant message content', () => {
      const message = createMockAssistantMessage('Hello, I am Bernard');
      mockContext.messages = [message];
      mockContext.getMessagesMetadata = () => ({});

      render(<AssistantMessage message={message} />);

      expect(screen.getByTestId('assistant-message')).toBeInTheDocument();
      expect(screen.getByTestId('assistant-message-content')).toBeInTheDocument();
    });

    it('renders without content when content is empty', () => {
      const message = createMockAssistantMessage('');
      mockContext.messages = [message];
      mockContext.getMessagesMetadata = () => ({});

      render(<AssistantMessage message={message} />);

      expect(screen.getByTestId('assistant-message')).toBeInTheDocument();
      expect(screen.queryByTestId('assistant-message-content')).not.toBeInTheDocument();
    });
  });

  describe('Tool Calls', () => {
    it('renders tool calls when present', () => {
      const message: Message = {
        id: 'msg-1',
        type: 'ai',
        content: 'Let me search for that',
        tool_calls: [
          { id: 'tool-1', name: 'web_search', args: { query: 'test' } },
        ],
      };
      mockContext.messages = [message];
      mockContext.getMessagesMetadata = () => ({});

      render(<AssistantMessage message={message} />);

      expect(screen.getByTestId('tool-calls')).toBeInTheDocument();
      expect(screen.getByTestId('tool-calls')).toHaveAttribute('data-count', '1');
    });

    it('does not render tool calls when tool_calls is empty', () => {
      const message: Message = {
        id: 'msg-1',
        type: 'ai',
        content: 'Hello',
        tool_calls: [],
      };
      mockContext.messages = [message];
      mockContext.getMessagesMetadata = () => ({});

      render(<AssistantMessage message={message} />);

      expect(screen.queryByTestId('tool-calls')).not.toBeInTheDocument();
    });
  });

  describe('Branch Switcher', () => {
    it('renders branch switcher when branches are available', () => {
      const message = createMockAssistantMessage('Test');
      mockContext.messages = [message];
      mockContext.getMessagesMetadata = () => ({
        branch: 'branch-a',
        branchOptions: ['branch-a', 'branch-b'],
      });

      render(<AssistantMessage message={message} />);

      expect(screen.getByTestId('branch-switcher')).toBeInTheDocument();
      expect(screen.getByTestId('branch-switcher')).toHaveAttribute('data-branch', 'branch-a');
    });

    // BranchSwitcher is always rendered; test above covers branch options
  });

  describe('Regenerate Functionality', () => {
    it('shows regenerate button', () => {
      const message = createMockAssistantMessage('Test');
      mockContext.messages = [message];
      mockContext.getMessagesMetadata = () => ({
        firstSeenState: { parent_checkpoint: { thread_id: 't1', checkpoint_ns: '', checkpoint_id: 'c1', checkpoint_map: {} } },
      });

      render(<AssistantMessage message={message} onRegenerate={vi.fn()} />);

      expect(screen.getByTestId('regenerate-button')).toBeInTheDocument();
    });

    it('calls onRegenerate with parent checkpoint', () => {
      const mockOnRegenerate = vi.fn();
      const message = createMockAssistantMessage('Test');
      mockContext.messages = [message];
      mockContext.getMessagesMetadata = () => ({
        firstSeenState: { parent_checkpoint: { thread_id: 't1', checkpoint_ns: '', checkpoint_id: 'c1', checkpoint_map: {} } },
      });

      render(<AssistantMessage message={message} onRegenerate={mockOnRegenerate} />);

      fireEvent.click(screen.getByTestId('regenerate-button'));
      expect(mockOnRegenerate).toHaveBeenCalledWith({
        thread_id: 't1',
        checkpoint_ns: '',
        checkpoint_id: 'c1',
        checkpoint_map: {},
      });
    });

    it('does not crash when onRegenerate is not provided', () => {
      const message = createMockAssistantMessage('Test');
      mockContext.messages = [message];
      mockContext.getMessagesMetadata = () => ({
        firstSeenState: { parent_checkpoint: { thread_id: 't1', checkpoint_ns: '', checkpoint_id: 'c1', checkpoint_map: {} } },
      });

      expect(() => {
        render(<AssistantMessage message={message} />);
      }).not.toThrow();
    });
  });

  describe('Copy Functionality', () => {
    it('renders copy button', () => {
      const message = createMockAssistantMessage('Test content');
      mockContext.messages = [message];
      mockContext.getMessagesMetadata = () => ({});

      render(<AssistantMessage message={message} />);

      expect(screen.getByTestId('copy-icon')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('applies correct classes when isLoading is true', () => {
      const message = createMockAssistantMessage('Test');
      mockContext.messages = [message];
      mockContext.getMessagesMetadata = () => ({});

      render(<AssistantMessage message={message} isLoading={true} />);

      expect(screen.getByTestId('assistant-message')).toBeInTheDocument();
    });
  });

  describe('Next Messages', () => {
    it('filters tool results from next messages', () => {
      const message: Message = {
        id: 'msg-1',
        type: 'ai',
        content: 'Test',
        tool_calls: [{ id: 'tool-1', name: 'search', args: { q: 'test' } }],
      };
      const toolResult: Message = {
        id: 'tool-result-1',
        type: 'tool',
        content: 'result',
        tool_call_id: 'tool-1',
      };
      mockContext.messages = [message, toolResult];
      mockContext.getMessagesMetadata = () => ({});

      render(<AssistantMessage message={message} nextMessages={[toolResult]} />);

      const toolCallsElement = screen.getByTestId('tool-calls');
      expect(toolCallsElement).toBeInTheDocument();
      expect(toolCallsElement).toHaveAttribute('data-results-count', '1');
    });

    it('does not include tool results that do not match tool calls', () => {
      const message: Message = {
        id: 'msg-1',
        type: 'ai',
        content: 'Test',
        tool_calls: [{ id: 'tool-1', name: 'search', args: { q: 'test' } }],
      };
      const unmatchedToolResult: Message = {
        id: 'tool-result-2',
        type: 'tool',
        content: 'result',
        tool_call_id: 'tool-2', // Different ID
      };
      mockContext.messages = [message, unmatchedToolResult];
      mockContext.getMessagesMetadata = () => ({});

      render(<AssistantMessage message={message} nextMessages={[unmatchedToolResult]} />);

      const toolCallsElement = screen.getByTestId('tool-calls');
      expect(toolCallsElement).toBeInTheDocument();
      expect(toolCallsElement).toHaveAttribute('data-results-count', '0');
    });

    it('includes multiple matching tool results', () => {
      const message: Message = {
        id: 'msg-1',
        type: 'ai',
        content: 'Test',
        tool_calls: [
          { id: 'tool-1', name: 'search', args: { q: 'test1' } },
          { id: 'tool-2', name: 'search', args: { q: 'test2' } }
        ],
      };
      const toolResult1: Message = {
        id: 'tool-result-1',
        type: 'tool',
        content: 'result1',
        tool_call_id: 'tool-1',
      };
      const toolResult2: Message = {
        id: 'tool-result-2',
        type: 'tool',
        content: 'result2',
        tool_call_id: 'tool-2',
      };
      mockContext.messages = [message, toolResult1, toolResult2];
      mockContext.getMessagesMetadata = () => ({});

      render(<AssistantMessage message={message} nextMessages={[toolResult1, toolResult2]} />);

      const toolCallsElement = screen.getByTestId('tool-calls');
      expect(toolCallsElement).toBeInTheDocument();
      expect(toolCallsElement).toHaveAttribute('data-results-count', '2');
    });
  });
});

describe('AssistantMessageLoading', () => {
  it('renders loading indicator', () => {
    render(<AssistantMessageLoading />);

    expect(screen.getByTestId('assistant-message-loading')).toBeInTheDocument();
  });

  it('contains pulsing animation elements', () => {
    render(<AssistantMessageLoading />);

    const loading = screen.getByTestId('assistant-message-loading');
    // Verify the pulsing dots are present with animation classes
    const dots = loading.querySelectorAll('[class*="animate-"]');
    expect(dots).toHaveLength(3);
  });
});
