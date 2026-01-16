import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MessageListLoading, ThreadLoading } from './loading';

describe('MessageListLoading', () => {
  it('renders message list loading skeleton', () => {
    render(<MessageListLoading />);

    // Should have skeleton elements
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders human message skeletons (right-aligned)', () => {
    const { container } = render(<MessageListLoading />);

    // Human messages are right-aligned (justify-end)
    const rightAligned = container.querySelectorAll('.justify-end');
    expect(rightAligned.length).toBe(3); // 3 human messages out of 5
  });

  it('renders assistant message skeletons (left-aligned)', () => {
    const { container } = render(<MessageListLoading />);

    // Assistant messages are left-aligned with avatar
    const leftAligned = container.querySelectorAll('.justify-start');
    expect(leftAligned.length).toBe(2); // 2 assistant messages out of 5
  });
});

describe('ThreadLoading', () => {
  it('renders sidebar skeleton', () => {
    render(<ThreadLoading />);

    // Should have sidebar skeletons
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders header skeleton', () => {
    const { container } = render(<ThreadLoading />);

    // Header should have avatar and button skeletons
    expect(container.querySelector('.border-b')).toBeTruthy();
  });

  it('renders message area skeleton', () => {
    render(<ThreadLoading />);

    // Should render MessageListLoading inside thread
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(10); // Sidebar + header + messages
  });
});
