import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BranchSwitcher } from './BranchSwitcher';

// Mock lucide-react icons
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    ChevronLeft: ({ className, onClick, disabled }: { className?: string; onClick?: () => void; disabled?: boolean }) => (
      <button data-testid="chevron-left" className={className} onClick={onClick} disabled={disabled}>ChevronLeft</button>
    ),
    ChevronRight: ({ className, onClick, disabled }: { className?: string; onClick?: () => void; disabled?: boolean }) => (
      <button data-testid="chevron-right" className={className} onClick={onClick} disabled={disabled}>ChevronRight</button>
    ),
  };
});

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className }: any) => <div className={className}>{children}</div>,
  },
}));

describe('BranchSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Rendering Conditions', () => {
    it('returns null when branchOptions is undefined', () => {
      const { container } = render(
        <BranchSwitcher
          branch="main"
          branchOptions={undefined}
          onSelect={vi.fn()}
          isLoading={false}
        />
      );
      expect(container).toBeEmptyDOMElement();
    });

    it('returns null when branch is undefined', () => {
      const { container } = render(
        <BranchSwitcher
          branch={undefined}
          branchOptions={['main', 'dev']}
          onSelect={vi.fn()}
          isLoading={false}
        />
      );
      expect(container).toBeEmptyDOMElement();
    });

    it('returns null when only one branch option exists', () => {
      const { container } = render(
        <BranchSwitcher
          branch="main"
          branchOptions={['main']}
          onSelect={vi.fn()}
          isLoading={false}
        />
      );
      expect(container).toBeEmptyDOMElement();
    });

    it('renders when multiple branch options exist', () => {
      render(
        <BranchSwitcher
          branch="main"
          branchOptions={['main', 'dev', 'feature']}
          onSelect={vi.fn()}
          isLoading={false}
        />
      );

      expect(screen.getByTestId('chevron-left')).toBeInTheDocument();
      expect(screen.getByTestId('chevron-right')).toBeInTheDocument();
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });
  });

  describe('Branch Navigation', () => {
    it('displays correct branch position', () => {
      render(
        <BranchSwitcher
          branch="dev"
          branchOptions={['main', 'dev', 'feature']}
          onSelect={vi.fn()}
          isLoading={false}
        />
      );

      expect(screen.getByText('2 / 3')).toBeInTheDocument();
    });

    it('calls onSelect when clicking previous branch button', () => {
      const mockOnSelect = vi.fn();
      render(
        <BranchSwitcher
          branch="dev"
          branchOptions={['main', 'dev', 'feature']}
          onSelect={mockOnSelect}
          isLoading={false}
        />
      );

      const leftButton = screen.getByTestId('chevron-left');
      fireEvent.click(leftButton);

      expect(mockOnSelect).toHaveBeenCalledWith('main');
    });

    it('calls onSelect when clicking next branch button', () => {
      const mockOnSelect = vi.fn();
      render(
        <BranchSwitcher
          branch="dev"
          branchOptions={['main', 'dev', 'feature']}
          onSelect={mockOnSelect}
          isLoading={false}
        />
      );

      const rightButton = screen.getByTestId('chevron-right');
      fireEvent.click(rightButton);

      expect(mockOnSelect).toHaveBeenCalledWith('feature');
    });

    it('does not call onSelect when clicking previous button on first branch', () => {
      const mockOnSelect = vi.fn();
      render(
        <BranchSwitcher
          branch="main"
          branchOptions={['main', 'dev', 'feature']}
          onSelect={mockOnSelect}
          isLoading={false}
        />
      );

      const leftButton = screen.getByTestId('chevron-left');
      fireEvent.click(leftButton);

      expect(mockOnSelect).not.toHaveBeenCalled();
    });

    it('does not call onSelect when clicking next button on last branch', () => {
      const mockOnSelect = vi.fn();
      render(
        <BranchSwitcher
          branch="feature"
          branchOptions={['main', 'dev', 'feature']}
          onSelect={mockOnSelect}
          isLoading={false}
        />
      );

      const rightButton = screen.getByTestId('chevron-right');
      fireEvent.click(rightButton);

      expect(mockOnSelect).not.toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    it('disables buttons when isLoading is true', () => {
      render(
        <BranchSwitcher
          branch="dev"
          branchOptions={['main', 'dev', 'feature']}
          onSelect={vi.fn()}
          isLoading={true}
        />
      );

      const leftButton = screen.getByTestId('chevron-left');
      const rightButton = screen.getByTestId('chevron-right');

      expect(leftButton).toBeDisabled();
      expect(rightButton).toBeDisabled();
    });

    it('enables buttons when isLoading is false', () => {
      render(
        <BranchSwitcher
          branch="dev"
          branchOptions={['main', 'dev', 'feature']}
          onSelect={vi.fn()}
          isLoading={false}
        />
      );

      const leftButton = screen.getByTestId('chevron-left');
      const rightButton = screen.getByTestId('chevron-right');

      expect(leftButton).not.toBeDisabled();
      expect(rightButton).not.toBeDisabled();
    });
  });

  describe('Custom ClassName', () => {
    it('applies custom className', () => {
      render(
        <BranchSwitcher
          branch="main"
          branchOptions={['main', 'dev']}
          onSelect={vi.fn()}
          isLoading={false}
          className="custom-branch-switcher"
        />
      );

      // Navigate up the DOM: span -> div1 -> div2 -> div3 -> outer div with className
      const span = screen.getByText('1 / 2');
      const outerDiv = span.closest('div')?.parentElement?.parentElement?.parentElement;
      expect(outerDiv).toHaveClass('custom-branch-switcher');
    });
  });
});
