import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DynamicSidebarProvider } from './DynamicSidebarProvider';
import { useDynamicSidebar } from './DynamicSidebarContext';
import { DynamicSidebarMenuItemConfig, DynamicSidebarHeaderConfig } from './types';

// ============================================
// TEST COMPONENTS
// ============================================
function TestSidebarConsumer() {
  const {
    header,
    menuItems,
    isOpen,
    setHeader,
    addMenuItem,
    removeMenuItem,
    setIsOpen,
    toggle,
    reset,
  } = useDynamicSidebar();

  return (
    <div>
      <div data-testid="is-open">{isOpen.toString()}</div>
      <div data-testid="menu-items-count">{menuItems.length.toString()}</div>
      <div data-testid="header-content">{header?.content ?? 'no-header'}</div>
      <button
        data-testid="set-header"
        onClick={() =>
          setHeader({ type: 'text', content: 'Test Header' })
        }
      >
        Set Header
      </button>
      <button
        data-testid="add-item"
        onClick={() =>
          addMenuItem({ id: 'test-item', children: 'Test Item' })
        }
      >
        Add Item
      </button>
      <button
        data-testid="remove-item"
        onClick={() => removeMenuItem('test-item')}
      >
        Remove Item
      </button>
      <button
        data-testid="set-open"
        onClick={() => setIsOpen(false)}
      >
        Set Closed
      </button>
      <button data-testid="toggle" onClick={toggle}>
        Toggle
      </button>
      <button data-testid="reset" onClick={reset}>
        Reset
      </button>
    </div>
  );
}

// ============================================
// TEST SUITE
// ============================================
describe('DynamicSidebarProvider', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Initialization', () => {
    it('renders children without errors', () => {
      render(
        <DynamicSidebarProvider>
          <div data-testid="children">Child Content</div>
        </DynamicSidebarProvider>
      );

      expect(screen.getByTestId('children')).toBeInTheDocument();
    });

    it('provides sidebar context to consumers', () => {
      render(
        <DynamicSidebarProvider>
          <TestSidebarConsumer />
        </DynamicSidebarProvider>
      );

      expect(screen.getByTestId('is-open')).toBeInTheDocument();
      expect(screen.getByTestId('menu-items-count')).toBeInTheDocument();
    });

    it('initializes with default isOpen state as true', () => {
      render(
        <DynamicSidebarProvider>
          <TestSidebarConsumer />
        </DynamicSidebarProvider>
      );

      expect(screen.getByTestId('is-open')).toHaveTextContent('true');
    });
  });

  describe('State Persistence', () => {
    it('loads isOpen state from localStorage', () => {
      // Set localStorage before rendering
      localStorage.setItem('bernard-sidebar-state', 'false');

      render(
        <DynamicSidebarProvider>
          <TestSidebarConsumer />
        </DynamicSidebarProvider>
      );

      expect(screen.getByTestId('is-open')).toHaveTextContent('false');
    });

    it('saves isOpen state to localStorage on change', () => {
      render(
        <DynamicSidebarProvider>
          <TestSidebarConsumer />
        </DynamicSidebarProvider>
      );

      fireEvent.click(screen.getByTestId('set-open'));

      const saved = localStorage.getItem('bernard-sidebar-state');
      expect(saved).toBe('false');
    });

    it('handles invalid localStorage value gracefully', () => {
      localStorage.setItem('bernard-sidebar-state', 'invalid');

      render(
        <DynamicSidebarProvider>
          <TestSidebarConsumer />
        </DynamicSidebarProvider>
      );

      // Should default to true
      expect(screen.getByTestId('is-open')).toHaveTextContent('true');
    });
  });

  describe('Header Management', () => {
    it('setHeader updates header state', () => {
      render(
        <DynamicSidebarProvider>
          <TestSidebarConsumer />
        </DynamicSidebarProvider>
      );

      expect(screen.getByTestId('header-content')).toHaveTextContent('no-header');

      fireEvent.click(screen.getByTestId('set-header'));

      expect(screen.getByTestId('header-content')).toHaveTextContent('Test Header');
    });
  });

  describe('Menu Items', () => {
    it('addMenuItem adds item to menuItems array', () => {
      render(
        <DynamicSidebarProvider>
          <TestSidebarConsumer />
        </DynamicSidebarProvider>
      );

      expect(screen.getByTestId('menu-items-count')).toHaveTextContent('0');

      fireEvent.click(screen.getByTestId('add-item'));

      expect(screen.getByTestId('menu-items-count')).toHaveTextContent('1');
    });

    it('removeMenuItem removes item by ID', () => {
      render(
        <DynamicSidebarProvider>
          <TestSidebarConsumer />
        </DynamicSidebarProvider>
      );

      fireEvent.click(screen.getByTestId('add-item'));
      expect(screen.getByTestId('menu-items-count')).toHaveTextContent('1');

      fireEvent.click(screen.getByTestId('remove-item'));
      expect(screen.getByTestId('menu-items-count')).toHaveTextContent('0');
    });
  });

  describe('Sidebar State', () => {
    it('setIsOpen updates isOpen state', () => {
      render(
        <DynamicSidebarProvider>
          <TestSidebarConsumer />
        </DynamicSidebarProvider>
      );

      expect(screen.getByTestId('is-open')).toHaveTextContent('true');
      fireEvent.click(screen.getByTestId('set-open'));
      expect(screen.getByTestId('is-open')).toHaveTextContent('false');
    });

    it('toggle inverts isOpen state', () => {
      render(
        <DynamicSidebarProvider>
          <TestSidebarConsumer />
        </DynamicSidebarProvider>
      );

      expect(screen.getByTestId('is-open')).toHaveTextContent('true');
      fireEvent.click(screen.getByTestId('toggle'));
      expect(screen.getByTestId('is-open')).toHaveTextContent('false');
      fireEvent.click(screen.getByTestId('toggle'));
      expect(screen.getByTestId('is-open')).toHaveTextContent('true');
    });
  });

  describe('Reset', () => {
    it('reset clears all state', () => {
      render(
        <DynamicSidebarProvider>
          <TestSidebarConsumer />
        </DynamicSidebarProvider>
      );

      // Set up some state first
      fireEvent.click(screen.getByTestId('set-header'));
      fireEvent.click(screen.getByTestId('add-item'));
      fireEvent.click(screen.getByTestId('set-open'));

      expect(screen.getByTestId('header-content')).toHaveTextContent('Test Header');
      expect(screen.getByTestId('menu-items-count')).toHaveTextContent('1');
      expect(screen.getByTestId('is-open')).toHaveTextContent('false');

      // Reset
      fireEvent.click(screen.getByTestId('reset'));

      expect(screen.getByTestId('header-content')).toHaveTextContent('no-header');
      expect(screen.getByTestId('menu-items-count')).toHaveTextContent('0');
      // Verify isOpen state is restored to default (true) after reset
      expect(screen.getByTestId('is-open')).toHaveTextContent('true');
    });
  });
});

describe('DynamicSidebarProvider - Direct State Tests', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('initializes with default isOpen = true when no localStorage', () => {
    function TestConsumerDirect() {
      const { isOpen } = useDynamicSidebar();
      return <div data-testid="direct-is-open">{isOpen.toString()}</div>;
    }

    render(
      <DynamicSidebarProvider>
        <TestConsumerDirect />
      </DynamicSidebarProvider>
    );

    expect(screen.getByTestId('direct-is-open')).toHaveTextContent('true');
  });

  it('persists isOpen state through localStorage', () => {
    function TestConsumerPersist() {
      const { isOpen, setIsOpen } = useDynamicSidebar();
      return (
        <div>
          <div data-testid="persist-is-open">{isOpen.toString()}</div>
          <button
            data-testid="persist-toggle"
            onClick={() => setIsOpen(!isOpen)}
          >
            Toggle
          </button>
        </div>
      );
    }

    const { unmount } = render(
      <DynamicSidebarProvider>
        <TestConsumerPersist />
      </DynamicSidebarProvider>
    );

    expect(screen.getByTestId('persist-is-open')).toHaveTextContent('true');

    // Toggle to false
    fireEvent.click(screen.getByTestId('persist-toggle'));
    expect(screen.getByTestId('persist-is-open')).toHaveTextContent('false');

    unmount();

    // Re-render and check persistence
    render(
      <DynamicSidebarProvider>
        <TestConsumerPersist />
      </DynamicSidebarProvider>
    );

    expect(screen.getByTestId('persist-is-open')).toHaveTextContent('false');
  });
});
