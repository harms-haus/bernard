import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ErrorState, MessageErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('renders error message', () => {
    const errorMessage = 'Test error occurred';
    render(<ErrorState message={errorMessage} />);

    expect(screen.getByText(errorMessage)).toBeTruthy();
    expect(screen.getByText(errorMessage).classList.contains('text-destructive')).toBe(true);
  });

  it('renders alert icon', () => {
    render(<ErrorState message="Error" />);

    // Check for svg icon with destructive color
    const svgIcon = document.querySelector('svg.text-destructive');
    expect(svgIcon).toBeTruthy();
  });

  it('does not render retry button when onRetry is not provided', () => {
    render(<ErrorState message="Error" />);

    expect(screen.queryByText(/retry/i)).toBeNull();
  });

  it('renders retry button when onRetry is provided', () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Error" onRetry={onRetry} />);

    const retryButton = screen.getByText(/retry/i);
    expect(retryButton).toBeTruthy();
  });

  it('calls onRetry when retry button is clicked', () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Error" onRetry={onRetry} />);

    const retryButton = screen.getByText(/retry/i);
    fireEvent.click(retryButton);

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('applies custom className', () => {
    const { container } = render(
      <ErrorState message="Error" className="custom-class" />
    );

    const element = container.firstElementChild as Element;
    expect(element.classList.contains('custom-class')).toBe(true);
  });
});

describe('MessageErrorState', () => {
  it('renders error state for messages', () => {
    render(<MessageErrorState />);

    // Should have error styling
    expect(screen.getByText(/failed to load/i)).toBeTruthy();
  });

  it('renders retry button', () => {
    const onRetry = vi.fn();
    render(<MessageErrorState onRetry={onRetry} />);

    expect(screen.getByText(/retry/i)).toBeTruthy();
  });
});
