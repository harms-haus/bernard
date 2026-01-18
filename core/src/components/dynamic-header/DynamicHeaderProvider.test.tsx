import React, { useState, useCallback, ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DynamicHeaderProvider } from './DynamicHeaderProvider';
import { useDynamicHeader } from './DynamicHeaderContext';
import { DynamicHeaderAction } from './types';

// ============================================
// HOISTED MOCK CONTEXT (must be hoisted)
// ============================================
const mockContext = vi.hoisted(() => ({
  title: 'Bernard' as string,
  subtitle: null as string | null,
  actions: [] as DynamicHeaderAction[],
  setTitle: vi.fn<(title: string) => void>(),
  setSubtitle: vi.fn<(subtitle: string | null) => void>(),
  setActions: vi.fn<(actions: DynamicHeaderAction[]) => void>(),
  reset: vi.fn<() => void>(),
}));

// ============================================
// MOCKS BEFORE IMPORTS (must be hoisted)
// ============================================
vi.mock('./DynamicHeaderContext', async () => {
  const actual = await vi.importActual('./DynamicHeaderContext');
  return {
    ...actual,
    useDynamicHeader: () => mockContext,
  };
});

// ============================================
// TEST COMPONENTS
// ============================================
function TestHeaderConsumer() {
  const { title, subtitle, actions, setTitle, setSubtitle, setActions, reset } =
    useDynamicHeader();

  return (
    <div>
      <div data-testid="title">{title}</div>
      <div data-testid="subtitle">{subtitle || 'no-subtitle'}</div>
      <div data-testid="actions-count">{actions.length.toString()}</div>
      <button
        data-testid="set-title"
        onClick={() => setTitle('New Title')}
      >
        Set Title
      </button>
      <button
        data-testid="set-subtitle"
        onClick={() => setSubtitle('New Subtitle')}
      >
        Set Subtitle
      </button>
      <button
        data-testid="clear-subtitle"
        onClick={() => setSubtitle(null)}
      >
        Clear Subtitle
      </button>
      <button
        data-testid="set-actions"
        onClick={() =>
          setActions([
            {
              id: 'action-1',
              label: 'Action 1',
              onClick: vi.fn(),
            },
          ])
        }
      >
        Set Actions
      </button>
      <button data-testid="reset" onClick={reset}>
        Reset
      </button>
    </div>
  );
}

function TestHeaderWithActions() {
  const { actions } = useDynamicHeader();

  return (
    <div>
      {actions.map((action: DynamicHeaderAction) => (
        <button
          key={action.id}
          data-testid={`action-${action.id}`}
          onClick={action.onClick}
          disabled={action.disabled}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

// ============================================
// TEST SUITE
// ============================================
describe('DynamicHeaderProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock context to defaults
    mockContext.title = 'Bernard';
    mockContext.subtitle = null;
    mockContext.actions = [];
    mockContext.setTitle.mockImplementation((title) => {
      mockContext.title = title;
    });
    mockContext.setSubtitle.mockImplementation((subtitle) => {
      mockContext.subtitle = subtitle;
    });
    mockContext.setActions.mockImplementation((actions) => {
      mockContext.actions = actions;
    });
    mockContext.reset.mockImplementation(() => {
      mockContext.title = 'Bernard';
      mockContext.subtitle = null;
      mockContext.actions = [];
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Initialization', () => {
    it('renders children without errors', () => {
      render(
        <DynamicHeaderProvider>
          <div data-testid="children">Child Content</div>
        </DynamicHeaderProvider>
      );

      expect(screen.getByTestId('children')).toBeInTheDocument();
    });

    it('provides header context to consumers', () => {
      render(
        <DynamicHeaderProvider>
          <TestHeaderConsumer />
        </DynamicHeaderProvider>
      );

      expect(screen.getByTestId('title')).toBeInTheDocument();
      expect(screen.getByTestId('subtitle')).toBeInTheDocument();
      expect(screen.getByTestId('actions-count')).toBeInTheDocument();
    });

    it('initializes with default title as "Bernard"', () => {
      render(
        <DynamicHeaderProvider>
          <TestHeaderConsumer />
        </DynamicHeaderProvider>
      );

      expect(screen.getByTestId('title')).toHaveTextContent('Bernard');
    });

    it('initializes with null subtitle', () => {
      render(
        <DynamicHeaderProvider>
          <TestHeaderConsumer />
        </DynamicHeaderProvider>
      );

      expect(screen.getByTestId('subtitle')).toHaveTextContent('no-subtitle');
    });

    it('initializes with empty actions array', () => {
      render(
        <DynamicHeaderProvider>
          <TestHeaderConsumer />
        </DynamicHeaderProvider>
      );

      expect(screen.getByTestId('actions-count')).toHaveTextContent('0');
    });
  });

  // Note: These tests use the mocked useDynamicHeader and test consumer integration
  // For unit tests of DynamicHeaderProvider itself, see the "Provider Unit Tests" describe block below
  describe('Title Management (Consumer Integration)', () => {
    it('setTitle updates title state', () => {
      render(
        <DynamicHeaderProvider>
          <TestHeaderConsumer />
        </DynamicHeaderProvider>
      );

      expect(screen.getByTestId('title')).toHaveTextContent('Bernard');
      fireEvent.click(screen.getByTestId('set-title'));
      expect(mockContext.setTitle).toHaveBeenCalledWith('New Title');
    });
  });

  describe('Subtitle Management (Consumer Integration)', () => {
    it('setSubtitle updates subtitle state', () => {
      render(
        <DynamicHeaderProvider>
          <TestHeaderConsumer />
        </DynamicHeaderProvider>
      );

      fireEvent.click(screen.getByTestId('set-subtitle'));
      expect(mockContext.setSubtitle).toHaveBeenCalledWith('New Subtitle');
    });

    it('setSubtitle with null clears subtitle', () => {
      render(
        <DynamicHeaderProvider>
          <TestHeaderConsumer />
        </DynamicHeaderProvider>
      );

      // First set a subtitle
      fireEvent.click(screen.getByTestId('set-subtitle'));
      expect(mockContext.setSubtitle).toHaveBeenCalledWith('New Subtitle');

      // Then clear it
      fireEvent.click(screen.getByTestId('clear-subtitle'));
      expect(mockContext.setSubtitle).toHaveBeenCalledWith(null);
    });
  });

  describe('Actions Management (Consumer Integration)', () => {
    it('setActions updates actions array', () => {
      render(
        <DynamicHeaderProvider>
          <TestHeaderConsumer />
        </DynamicHeaderProvider>
      );

      fireEvent.click(screen.getByTestId('set-actions'));
      expect(mockContext.setActions).toHaveBeenCalledWith([
        {
          id: 'action-1',
          label: 'Action 1',
          onClick: expect.any(Function),
        },
      ]);
    });

    it('renders action buttons', () => {
      mockContext.actions = [
        { id: 'action-1', label: 'Save', onClick: vi.fn() },
        { id: 'action-2', label: 'Cancel', onClick: vi.fn() },
      ];

      render(
        <DynamicHeaderProvider>
          <TestHeaderWithActions />
        </DynamicHeaderProvider>
      );

      expect(screen.getByTestId('action-action-1')).toBeInTheDocument();
      expect(screen.getByTestId('action-action-2')).toBeInTheDocument();
      expect(screen.getByTestId('action-action-1')).toHaveTextContent('Save');
      expect(screen.getByTestId('action-action-2')).toHaveTextContent('Cancel');
    });

    it('handles disabled actions', () => {
      mockContext.actions = [
        { id: 'action-1', label: 'Save', onClick: vi.fn(), disabled: true },
      ];

      render(
        <DynamicHeaderProvider>
          <TestHeaderWithActions />
        </DynamicHeaderProvider>
      );

      expect(screen.getByTestId('action-action-1')).toBeDisabled();
    });

    it('calls action onClick handler', () => {
      const onClick = vi.fn();
      mockContext.actions = [{ id: 'action-1', label: 'Save', onClick }];

      render(
        <DynamicHeaderProvider>
          <TestHeaderWithActions />
        </DynamicHeaderProvider>
      );

      fireEvent.click(screen.getByTestId('action-action-1'));
      expect(onClick).toHaveBeenCalled();
    });
  });

  describe('Reset (Consumer Integration)', () => {
    it('reset restores default values', () => {
      // Set up some state first
      mockContext.title = 'Custom Title';
      mockContext.subtitle = 'Custom Subtitle';
      mockContext.actions = [{ id: 'action-1', label: 'Action', onClick: vi.fn() }];

      render(
        <DynamicHeaderProvider>
          <TestHeaderConsumer />
        </DynamicHeaderProvider>
      );

      fireEvent.click(screen.getByTestId('reset'));
      expect(mockContext.reset).toHaveBeenCalled();
    });
  });
});

// Provider Unit Tests - test the actual provider without mocks
describe('DynamicHeaderProvider - Provider Unit Tests', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('./DynamicHeaderContext');
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('setTitle updates title state in provider', async () => {
    const { DynamicHeaderProvider: RealProvider } = await import('./DynamicHeaderProvider');
    const { useDynamicHeader: realUseDynamicHeader } = await import('./DynamicHeaderContext');

    function TestConsumer() {
      const { title, setTitle } = realUseDynamicHeader();
      return (
        <div>
          <div data-testid="title">{title}</div>
          <button data-testid="set-title" onClick={() => setTitle('New Title')}>
            Set Title
          </button>
        </div>
      );
    }

    render(
      <RealProvider>
        <TestConsumer />
      </RealProvider>
    );

    expect(screen.getByTestId('title')).toHaveTextContent('Bernard');
    fireEvent.click(screen.getByTestId('set-title'));
    expect(screen.getByTestId('title')).toHaveTextContent('New Title');
  });

  it('setSubtitle updates subtitle state in provider', async () => {
    const { DynamicHeaderProvider: RealProvider } = await import('./DynamicHeaderProvider');
    const { useDynamicHeader: realUseDynamicHeader } = await import('./DynamicHeaderContext');

    function TestConsumer() {
      const { subtitle, setSubtitle } = realUseDynamicHeader();
      return (
        <div>
          <div data-testid="subtitle">{subtitle || 'no-subtitle'}</div>
          <button data-testid="set-subtitle" onClick={() => setSubtitle('New Subtitle')}>
            Set Subtitle
          </button>
        </div>
      );
    }

    render(
      <RealProvider>
        <TestConsumer />
      </RealProvider>
    );

    expect(screen.getByTestId('subtitle')).toHaveTextContent('no-subtitle');
    fireEvent.click(screen.getByTestId('set-subtitle'));
    expect(screen.getByTestId('subtitle')).toHaveTextContent('New Subtitle');
  });

  it('setActions updates actions array in provider', async () => {
    const { DynamicHeaderProvider: RealProvider } = await import('./DynamicHeaderProvider');
    const { useDynamicHeader: realUseDynamicHeader } = await import('./DynamicHeaderContext');

    const mockOnClick = vi.fn();

    function TestConsumer() {
      const { actions, setActions } = realUseDynamicHeader();
      return (
        <div>
          <div data-testid="actions-count">{actions.length.toString()}</div>
          <button
            data-testid="set-actions"
            onClick={() =>
              setActions([
                {
                  id: 'action-1',
                  label: 'Action 1',
                  onClick: mockOnClick,
                },
              ])
            }
          >
            Set Actions
          </button>
        </div>
      );
    }

    render(
      <RealProvider>
        <TestConsumer />
      </RealProvider>
    );

    expect(screen.getByTestId('actions-count')).toHaveTextContent('0');
    fireEvent.click(screen.getByTestId('set-actions'));
    expect(screen.getByTestId('actions-count')).toHaveTextContent('1');
  });

  it('reset restores default values in provider', async () => {
    const { DynamicHeaderProvider: RealProvider } = await import('./DynamicHeaderProvider');
    const { useDynamicHeader: realUseDynamicHeader } = await import('./DynamicHeaderContext');

    function TestConsumer() {
      const { title, subtitle, actions, setTitle, setSubtitle, setActions, reset } = realUseDynamicHeader();
      return (
        <div>
          <div data-testid="title">{title}</div>
          <div data-testid="subtitle">{subtitle || 'no-subtitle'}</div>
          <div data-testid="actions-count">{actions.length.toString()}</div>
          <button data-testid="set-title" onClick={() => setTitle('Custom Title')}>
            Set Title
          </button>
          <button data-testid="set-subtitle" onClick={() => setSubtitle('Custom Subtitle')}>
            Set Subtitle
          </button>
          <button
            data-testid="set-actions"
            onClick={() => setActions([{ id: 'action-1', label: 'Action', onClick: vi.fn() }])}
          >
            Set Actions
          </button>
          <button data-testid="reset" onClick={reset}>
            Reset
          </button>
        </div>
      );
    }

    render(
      <RealProvider>
        <TestConsumer />
      </RealProvider>
    );

    // Set up some state
    fireEvent.click(screen.getByTestId('set-title'));
    fireEvent.click(screen.getByTestId('set-subtitle'));
    fireEvent.click(screen.getByTestId('set-actions'));

    expect(screen.getByTestId('title')).toHaveTextContent('Custom Title');
    expect(screen.getByTestId('subtitle')).toHaveTextContent('Custom Subtitle');
    expect(screen.getByTestId('actions-count')).toHaveTextContent('1');

    // Reset
    fireEvent.click(screen.getByTestId('reset'));

    expect(screen.getByTestId('title')).toHaveTextContent('Bernard');
    expect(screen.getByTestId('subtitle')).toHaveTextContent('no-subtitle');
    expect(screen.getByTestId('actions-count')).toHaveTextContent('0');
  });
});

describe('DynamicHeaderProvider - Custom Default Title', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.doUnmock('./DynamicHeaderContext');
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('uses custom default title when provided', async () => {
    // Dynamically import after unmocking to get real implementations
    const { DynamicHeaderProvider: RealProvider } = await import('./DynamicHeaderProvider');
    const { useDynamicHeader: realUseDynamicHeader } = await import('./DynamicHeaderContext');

    function TestConsumerCustomDefault() {
      const { title } = realUseDynamicHeader();
      return <div data-testid="custom-title">{title}</div>;
    }

    render(
      <RealProvider defaultTitle="Custom App">
        <TestConsumerCustomDefault />
      </RealProvider>
    );

    expect(screen.getByTestId('custom-title')).toHaveTextContent('Custom App');
  });
});
