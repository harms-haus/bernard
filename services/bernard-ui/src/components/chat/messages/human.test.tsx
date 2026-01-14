import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HumanMessage } from './human';
import { createMockHumanMessage } from '../../../test/providers/StreamProvider';
import { updateMockContext, mockStreamContextContainer } from '../../../test/setup';

vi.mock('../../../providers/StreamProvider', async () => {
  const actual = await vi.importActual('../../../providers/StreamProvider');
  return {
    ...actual,
    useStreamContext: vi.fn(() => mockStreamContextContainer.current),
  };
});

// Mock framer-motion
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion');
  return {
    ...actual,
    motion: {
      div: ({ children, className }: any) => <div className={className}>{children}</div>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

// Mock lucide-react icons
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    Pencil: ({ className, onClick }: { className?: string; onClick?: () => void }) => (
      <button data-testid="edit-message-button" className={className} onClick={onClick}>Pencil</button>
    ),
    X: ({ className, onClick }: { className?: string; onClick?: () => void }) => (
      <button data-testid="cancel-edit-button" className={className} onClick={onClick}>X</button>
    ),
    Send: ({ className, onClick }: { className?: string; onClick?: () => void }) => (
      <button data-testid="submit-edit-button" className={className} onClick={onClick}>Send</button>
    ),
  };
});

// Mock BranchSwitcher (path must match the import in human.tsx: '../BranchSwitcher')
vi.mock('../BranchSwitcher', () => ({
  BranchSwitcher: ({ branch, branchOptions }: any) => (
    <div data-testid="branch-switcher" data-branch={branch} data-options={branchOptions?.join(',')}>
      BranchSwitcher
    </div>
  ),
}));

describe('HumanMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock context to default via setup file
    updateMockContext({
      messages: [],
      submit: vi.fn(),
      isLoading: false,
      stop: vi.fn(),
      latestProgress: null,
      getMessagesMetadata: () => ({}),
      setBranch: vi.fn(),
      resetProgress: vi.fn(),
    });
  });

  describe('Rendering', () => {
    it('renders human message content', () => {
      const message = createMockHumanMessage('Hello, I need help');
      updateMockContext({ messages: [message] });

      render(<HumanMessage message={message} />);

      expect(screen.getByTestId('human-message')).toBeInTheDocument();
      expect(screen.getByTestId('message-content')).toHaveTextContent('Hello, I need help');
    });

    it('renders correct alignment for human messages', () => {
      const message = createMockHumanMessage('Test message');
      updateMockContext({ messages: [message] });

      render(<HumanMessage message={message} />);

      const messageContainer = screen.getByTestId('human-message');
      // The container has flex-col class for vertical stacking
      expect(messageContainer).toHaveClass('flex flex-col');
    });
  });

  describe('Edit Mode', () => {
    it('enters edit mode when edit button is clicked', () => {
      const message = createMockHumanMessage('Original message');
      updateMockContext({ messages: [message] });

      render(<HumanMessage message={message} />);

      fireEvent.click(screen.getByTestId('edit-message-button'));

      expect(screen.getByTestId('edit-textarea')).toBeInTheDocument();
    });

    it('populates textarea with original content when entering edit mode', () => {
      const message = createMockHumanMessage('Test message content');
      updateMockContext({ messages: [message] });

      render(<HumanMessage message={message} />);

      fireEvent.click(screen.getByTestId('edit-message-button'));

      expect(screen.getByTestId('edit-textarea')).toHaveValue('Test message content');
    });

    it('cancels edit mode when cancel button is clicked', () => {
      const message = createMockHumanMessage('Test message');
      updateMockContext({ messages: [message] });

      render(<HumanMessage message={message} />);

      fireEvent.click(screen.getByTestId('edit-message-button'));
      fireEvent.click(screen.getByTestId('cancel-edit-button'));

      expect(screen.queryByTestId('edit-textarea')).not.toBeInTheDocument();
      expect(screen.getByTestId('message-content')).toBeInTheDocument();
    });

    it('submits edit when submit button is clicked', async () => {
      const mockSubmit = vi.fn();
      const message = createMockHumanMessage('Original message');
      updateMockContext({ messages: [message], submit: mockSubmit });

      render(<HumanMessage message={message} />);

      fireEvent.click(screen.getByTestId('edit-message-button'));
      
      const textarea = screen.getByTestId('edit-textarea');
      fireEvent.change(textarea, { target: { value: 'Updated message' } });
      
      fireEvent.click(screen.getByTestId('submit-edit-button'));

      await waitFor(() => {
        expect(mockSubmit).toHaveBeenCalled();
      });
    });

    it('does not submit when content is unchanged', async () => {
      const mockSubmit = vi.fn();
      const message = createMockHumanMessage('Same message');
      updateMockContext({ messages: [message], submit: mockSubmit });

      render(<HumanMessage message={message} />);

      fireEvent.click(screen.getByTestId('edit-message-button'));
      fireEvent.click(screen.getByTestId('submit-edit-button'));

      await waitFor(() => {
        expect(screen.queryByTestId('edit-textarea')).not.toBeInTheDocument();
        expect(mockSubmit).not.toHaveBeenCalled();
      });
    });

    it('does not submit when content is only whitespace', async () => {
      const mockSubmit = vi.fn();
      const message = createMockHumanMessage('Original message');
      updateMockContext({ messages: [message], submit: mockSubmit });

      render(<HumanMessage message={message} />);

      fireEvent.click(screen.getByTestId('edit-message-button'));
      
      const textarea = screen.getByTestId('edit-textarea');
      fireEvent.change(textarea, { target: { value: '   ' } });
      
      fireEvent.click(screen.getByTestId('submit-edit-button'));

      await waitFor(() => {
        expect(mockSubmit).not.toHaveBeenCalled();
      });
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('submits edit when Ctrl+Enter is pressed', async () => {
      const mockSubmit = vi.fn();
      const message = createMockHumanMessage('Test message');
      updateMockContext({ messages: [message], submit: mockSubmit });

      render(<HumanMessage message={message} />);

      fireEvent.click(screen.getByTestId('edit-message-button'));
      
      const textarea = screen.getByTestId('edit-textarea');
      fireEvent.change(textarea, { target: { value: 'Updated message' } });
      
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

      await waitFor(() => {
        expect(mockSubmit).toHaveBeenCalled();
      });
    });

    it('submits edit when Cmd+Enter is pressed (Mac)', async () => {
      const mockSubmit = vi.fn();
      const message = createMockHumanMessage('Test message');
      updateMockContext({ messages: [message], submit: mockSubmit });

      render(<HumanMessage message={message} />);

      fireEvent.click(screen.getByTestId('edit-message-button'));
      
      const textarea = screen.getByTestId('edit-textarea');
      fireEvent.change(textarea, { target: { value: 'Updated message' } });
      
      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

      await waitFor(() => {
        expect(mockSubmit).toHaveBeenCalled();
      });
    });
  });

  describe('Branch Switcher', () => {
    it('renders branch switcher when multiple branches exist', () => {
      const message = createMockHumanMessage('Test');
      updateMockContext({
        messages: [message],
        getMessagesMetadata: () => ({
          branch: 'main',
          branchOptions: ['main', 'dev'],
        }),
      });

      render(<HumanMessage message={message} />);

      expect(screen.getByTestId('human-message')).toBeInTheDocument();
      expect(screen.getByTestId('branch-switcher')).toBeInTheDocument();
    });

    it('does not render branch switcher when single branch', () => {
      const message = createMockHumanMessage('Test');
      updateMockContext({
        messages: [message],
        getMessagesMetadata: () => ({
          branch: 'main',
          branchOptions: ['main'],
        }),
      });

      render(<HumanMessage message={message} />);

      expect(screen.queryByTestId('branch-switcher')).not.toBeInTheDocument();
    });
  });
});
