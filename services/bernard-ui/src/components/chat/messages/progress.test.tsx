import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Message, Checkpoint } from '@langchain/langgraph-sdk';
import type { ToolProgressEvent } from '@/providers/StreamProvider';

// Create mock context type
interface MockStreamContextType {
  messages: Message[];
  submit: (values: any, options?: any) => void;
  isLoading: boolean;
  stop: () => void;
  latestProgress: ToolProgressEvent | null;
  getMessagesMetadata: (message: Message) => {
    branch?: string;
    branchOptions?: string[];
    firstSeenState?: { parent_checkpoint?: Checkpoint };
  };
  setBranch: (branch: string) => void;
  resetProgress: () => void;
}

// Create mock context
const createMockStreamContext = (overrides: Partial<MockStreamContextType> = {}): MockStreamContextType => ({
  messages: [],
  submit: vi.fn(),
  isLoading: false,
  stop: vi.fn(),
  latestProgress: null,
  getMessagesMetadata: () => ({}),
  setBranch: vi.fn(),
  resetProgress: vi.fn(),
  ...overrides,
});

// Create mock context value
const mockContext = createMockStreamContext();

// Mock the StreamProvider module
vi.mock('@/providers/StreamProvider', () => ({
  useStreamContext: () => mockContext,
  ToolProgressEvent: class ToolProgressEvent {
    type: 'progress' | 'step' | 'complete' | 'error';
    tool: string;
    message: string;
    data?: Record<string, unknown>;
    timestamp: number;
    constructor(type: 'progress' | 'step' | 'complete' | 'error', tool: string, message: string, data?: Record<string, unknown>) {
      this.type = type;
      this.tool = tool;
      this.message = message;
      this.data = data;
      this.timestamp = Date.now();
    }
  },
}));

// Now import the component after mocking
const { ProgressIndicator } = await import('./progress');

// Mock framer-motion - preserve data-testid and other props
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion');
  return {
    ...actual,
    motion: {
      div: ({ children, className, 'data-testid': testid, ...props }: any) => (
        <div className={className} data-testid={testid} {...props}>{children}</div>
      ),
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

describe('ProgressIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock context
    Object.assign(mockContext, createMockStreamContext());
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const createMockProgressEvent = (message: string): ToolProgressEvent => ({
    type: 'progress',
    tool: 'test-tool',
    message,
    timestamp: Date.now(),
  });

  describe('Rendering Conditions', () => {
    it('renders pulsing indicator when no progress is available and not loading', () => {
      mockContext.isLoading = false;
      mockContext.latestProgress = null;

      render(<ProgressIndicator />);

      expect(screen.getByTestId('progress-pulsing-indicator')).toBeInTheDocument();
      expect(screen.queryByTestId('progress-indicator')).not.toBeInTheDocument();
    });

    it('renders progress indicator when progress message is available', () => {
      mockContext.isLoading = true;
      mockContext.latestProgress = createMockProgressEvent('Processing your request...');

      render(<ProgressIndicator />);

      expect(screen.getByTestId('progress-indicator')).toBeInTheDocument();
      expect(screen.getByTestId('progress-message')).toHaveTextContent('Processing your request...');
    });
  });

  describe('Progress Message Display', () => {
    it('displays the progress message correctly', () => {
      mockContext.isLoading = true;
      mockContext.latestProgress = createMockProgressEvent('Searching web...');

      render(<ProgressIndicator />);

      expect(screen.getByTestId('progress-message')).toHaveTextContent('Searching web...');
    });

    it('truncates long progress messages', () => {
      const longMessage = 'This is a very long progress message that should be truncated at some point';
      mockContext.isLoading = true;
      mockContext.latestProgress = createMockProgressEvent(longMessage);

      render(<ProgressIndicator />);

      const progressMessage = screen.getByTestId('progress-message');
      expect(progressMessage).toBeInTheDocument();
      expect(progressMessage).toHaveClass('truncate');
    });

    it('updates when progress changes', () => {
      mockContext.isLoading = true;
      mockContext.latestProgress = createMockProgressEvent('Initial');

      const { rerender } = render(<ProgressIndicator />);

      expect(screen.getByTestId('progress-message')).toHaveTextContent('Initial');

      mockContext.latestProgress = createMockProgressEvent('Updated progress');

      rerender(<ProgressIndicator />);

      expect(screen.getByTestId('progress-message')).toHaveTextContent('Updated progress');
    });
  });

  describe('Loading State', () => {
    it('shows pulsing indicator when loading but no progress', () => {
      mockContext.isLoading = true;
      mockContext.latestProgress = null;

      render(<ProgressIndicator />);

      expect(screen.getByTestId('progress-pulsing-indicator')).toBeInTheDocument();
    });

    it('hides pulsing indicator when progress is available', () => {
      mockContext.isLoading = true;
      mockContext.latestProgress = createMockProgressEvent('Processing...');

      render(<ProgressIndicator />);

      expect(screen.queryByTestId('progress-pulsing-indicator')).not.toBeInTheDocument();
    });

    it('resets when loading completes', () => {
      mockContext.isLoading = false;
      mockContext.latestProgress = null;
      mockContext.messages = [{ id: 'msg-1', type: 'ai', content: 'Done' }] as Message[];

      render(<ProgressIndicator />);

      expect(screen.getByTestId('progress-pulsing-indicator')).toBeInTheDocument();
      expect(screen.queryByTestId('progress-indicator')).not.toBeInTheDocument();
    });
  });

  describe('Animation', () => {
    it('has correct CSS classes for animation', () => {
      mockContext.isLoading = true;
      mockContext.latestProgress = createMockProgressEvent('Processing...');

      render(<ProgressIndicator />);

      const progressIndicator = screen.getByTestId('progress-indicator');
      // The motion.div has the classes directly
      expect(progressIndicator).toHaveClass('flex');
      expect(progressIndicator).toHaveClass('items-start');
      expect(progressIndicator).toHaveClass('mr-auto');
      expect(progressIndicator).toHaveClass('gap-2');
    });

    it('applies correct styling to progress content', () => {
      mockContext.isLoading = true;
      mockContext.latestProgress = createMockProgressEvent('Test');

      render(<ProgressIndicator />);

      const progressContent = screen.getByTestId('progress-content');
      expect(progressContent).toHaveClass('rounded-2xl');
      expect(progressContent).toHaveClass('bg-muted/80');
      expect(progressContent).toHaveClass('px-4');
      expect(progressContent).toHaveClass('py-2');
    });
  });

  describe('Pulsing Indicator', () => {
    it('renders pulsing dots when no progress', () => {
      mockContext.isLoading = true;
      mockContext.latestProgress = null;

      render(<ProgressIndicator />);

      expect(screen.getByTestId('progress-pulsing-indicator')).toBeInTheDocument();
    });

    it('renders pulsing dots with loading but no progress', () => {
      mockContext.isLoading = true;
      mockContext.latestProgress = null;

      render(<ProgressIndicator />);

      const indicator = screen.getByTestId('progress-pulsing-indicator');
      expect(indicator).toBeInTheDocument();
    });
  });

  describe('Context Integration', () => {
    it('uses latestProgress from stream context', () => {
      mockContext.isLoading = true;
      mockContext.latestProgress = createMockProgressEvent('Context progress');

      render(<ProgressIndicator />);

      expect(screen.getByTestId('progress-message')).toHaveTextContent('Context progress');
    });

    it('uses isLoading from stream context', () => {
      mockContext.isLoading = false;
      mockContext.latestProgress = null;

      render(<ProgressIndicator />);

      expect(screen.getByTestId('progress-pulsing-indicator')).toBeInTheDocument();
    });
  });
});
