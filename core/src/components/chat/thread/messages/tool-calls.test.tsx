import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolCalls } from './tool-calls';
import type { AIMessage, ToolMessage } from '@langchain/langgraph-sdk';

// Mock framer-motion
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion');
  return {
    ...actual,
    motion: {
      div: ({ children, className }: any) => (
        <div className={className} data-testid="motion-div">{children}</div>
      ),
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

// Mock lucide-react icons
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    ChevronDown: ({ className, onClick }: { className?: string; onClick?: () => void }) => (
      <button data-testid="chevron-down" className={className} onClick={onClick}>ChevronDown</button>
    ),
    Wrench: ({ className }: { className?: string }) => <span data-testid="wrench-icon" className={className}>Wrench</span>,
  };
});

// Mock markdown-text component
vi.mock('./markdown-text', () => ({
  MarkdownText: ({ children }: { children: string }) => <div data-testid="markdown-text">{children}</div>,
}));

describe('ToolCalls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const createMockToolCall = (id: string, name: string, args: Record<string, unknown>): NonNullable<AIMessage['tool_calls']>[number] => ({
    id,
    name,
    args,
  });

  const createMockToolMessage = (id: string, content: string): ToolMessage => ({
    id: `tool-msg-${Date.now()}`,
    type: 'tool',
    content,
    tool_call_id: id,
  });

  describe('Rendering Conditions', () => {
    it('returns null when toolCalls is undefined', () => {
      const { container } = render(
        <ToolCalls toolCalls={undefined} toolResults={[]} />
      );
      expect(container).toBeEmptyDOMElement();
    });

    it('returns null when toolCalls is empty array', () => {
      const { container } = render(
        <ToolCalls toolCalls={[]} toolResults={[]} />
      );
      expect(container).toBeEmptyDOMElement();
    });

    it('renders when tool calls exist', () => {
      const toolCalls = [
        createMockToolCall('tool-1', 'web_search', { query: 'test' }),
      ];
      const { container } = render(
        <ToolCalls toolCalls={toolCalls} toolResults={[]} />
      );
      expect(container).not.toBeEmptyDOMElement();
    });
  });

  describe('Tool Call Display', () => {
    it('renders tool call name and formatted arguments', () => {
      const toolCalls = [
        createMockToolCall('tool-1', 'search_weather', { city: 'San Francisco', format: 'fahrenheit' }),
      ];

      render(
        <ToolCalls toolCalls={toolCalls} toolResults={[]} />
      );

      expect(screen.getByText((content) => content.includes('search_weather'))).toBeInTheDocument();
      expect(screen.getByText((content) => content.includes('San Francisco'))).toBeInTheDocument();
    });

    it('renders multiple tool calls', () => {
      const toolCalls = [
        createMockToolCall('tool-1', 'web_search', { query: 'test' }),
        createMockToolCall('tool-2', 'get_weather', { city: 'NYC' }),
      ];

      render(
        <ToolCalls toolCalls={toolCalls} toolResults={[]} />
      );

      expect(screen.getByText((content) => content.includes('web_search'))).toBeInTheDocument();
      expect(screen.getByText((content) => content.includes('get_weather'))).toBeInTheDocument();
    });

    it('renders tool call with empty arguments', () => {
      const toolCalls = [
        createMockToolCall('tool-1', 'simple_function', {}),
      ];

      render(
        <ToolCalls toolCalls={toolCalls} toolResults={[]} />
      );

      expect(screen.getByText((content) => content.includes('simple_function()'))).toBeInTheDocument();
    });
  });

  describe('Tool Result Expansion', () => {
    it('shows chevron icon when result is available', () => {
      const toolCalls = [
        createMockToolCall('tool-1', 'search', { query: 'test' }),
      ];
      const toolResults = [
        createMockToolMessage('tool-1', 'Search results here'),
      ];

      render(
        <ToolCalls toolCalls={toolCalls} toolResults={toolResults} />
      );

      expect(screen.getByTestId('chevron-down')).toBeInTheDocument();
    });

    it('does not show chevron when no result', () => {
      const toolCalls = [
        createMockToolCall('tool-1', 'search', { query: 'test' }),
      ];

      render(
        <ToolCalls toolCalls={toolCalls} toolResults={[]} />
      );

      expect(screen.queryByTestId('chevron-down')).not.toBeInTheDocument();
    });

    it('expands result when clicking on tool call with result', () => {
      const toolCalls = [
        createMockToolCall('tool-1', 'search', { query: 'test' }),
      ];
      const toolResults = [
        createMockToolMessage('tool-1', 'Search results here'),
      ];

      render(
        <ToolCalls toolCalls={toolCalls} toolResults={toolResults} />
      );

      // Click on the code element
      const codeElement = document.querySelector('code');
      fireEvent.click(codeElement!);

      expect(screen.getByTestId('chevron-down')).toHaveClass('rotate-180');
    });

    it('collapses result when clicking again', () => {
      const toolCalls = [
        createMockToolCall('tool-1', 'search', { query: 'test' }),
      ];
      const toolResults = [
        createMockToolMessage('tool-1', 'Search results here'),
      ];

      render(
        <ToolCalls toolCalls={toolCalls} toolResults={toolResults} />
      );

      const codeElement = document.querySelector('code');
      fireEvent.click(codeElement!);
      fireEvent.click(codeElement!);

      expect(screen.getByTestId('chevron-down')).not.toHaveClass('rotate-180');
    });
  });

  describe('Tool Result Display', () => {
    it('renders string result', async () => {
      const toolCalls = [
        createMockToolCall('tool-1', 'get_value', { key: 'test' }),
      ];
      const toolResults = [
        createMockToolMessage('tool-1', 'Simple string result'),
      ];

      render(
        <ToolCalls toolCalls={toolCalls} toolResults={toolResults} />
      );

      // Click to expand
      const codeElement = document.querySelector('code');
      fireEvent.click(codeElement!);

      await waitFor(() => {
        expect(screen.getByText('Simple string result')).toBeInTheDocument();
      });
    });

    it('renders JSON object result as table', async () => {
      const toolCalls = [
        createMockToolCall('tool-1', 'get_user', { id: '123' }),
      ];
      const toolResults = [
        createMockToolMessage('tool-1', JSON.stringify({ name: 'John', age: 30 })),
      ];

      render(
        <ToolCalls toolCalls={toolCalls} toolResults={toolResults} />
      );

      // Click to expand
      const codeElement = document.querySelector('code');
      fireEvent.click(codeElement!);

      await waitFor(() => {
        expect(screen.getByText('name')).toBeInTheDocument();
        expect(screen.getByText('John')).toBeInTheDocument();
        expect(screen.getByText('age')).toBeInTheDocument();
        expect(screen.getByText('30')).toBeInTheDocument();
      });
    });

    it('renders JSON array result as table', async () => {
      const toolCalls = [
        createMockToolCall('tool-1', 'get_items', {}),
      ];
      const toolResults = [
        createMockToolMessage('tool-1', JSON.stringify([{ id: 1 }, { id: 2 }])),
      ];

      render(
        <ToolCalls toolCalls={toolCalls} toolResults={toolResults} />
      );

      // Click to expand
      const codeElement = document.querySelector('code');
      fireEvent.click(codeElement!);

      await waitFor(() => {
        expect(screen.getByText('0')).toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();
      });
    });

    it('handles invalid JSON gracefully', async () => {
      const toolCalls = [
        createMockToolCall('tool-1', 'get_data', {}),
      ];
      const toolResults = [
        createMockToolMessage('tool-1', 'not valid json'),
      ];

      render(
        <ToolCalls toolCalls={toolCalls} toolResults={toolResults} />
      );

      // Click to expand
      const codeElement = document.querySelector('code');
      fireEvent.click(codeElement!);

      await waitFor(() => {
        expect(screen.getByText('not valid json')).toBeInTheDocument();
      });
    });
  });

  describe('Result Matching', () => {
    it('matches result by tool_call_id', async () => {
      const toolCalls = [
        createMockToolCall('tool-1', 'search', { query: 'test' }),
        createMockToolCall('tool-2', 'weather', { city: 'NYC' }),
      ];
      const toolResults = [
        createMockToolMessage('tool-1', 'Search result'),
        createMockToolMessage('tool-2', 'Weather result'),
      ];

      render(
        <ToolCalls toolCalls={toolCalls} toolResults={toolResults} />
      );

      // Click on first code element (search tool)
      const codeElements = document.querySelectorAll('code');
      fireEvent.click(codeElements[0]);

      // Wait for animation to complete
      await waitFor(() => {
        expect(screen.getByTestId('markdown-text')).toHaveTextContent('Search result');
      });
    });

    it('only shows result for matching tool call', () => {
      const toolCalls = [
        createMockToolCall('tool-1', 'search', { query: 'test' }),
        createMockToolCall('tool-2', 'weather', { city: 'NYC' }),
      ];
      const toolResults = [
        createMockToolMessage('tool-1', 'Search result'),
      ];

      render(
        <ToolCalls toolCalls={toolCalls} toolResults={toolResults} />
      );

      // Check that weather tool doesn't have chevron (no result)
      const codeElements = document.querySelectorAll('code');
      expect(codeElements[1]).not.toHaveClass('cursor-pointer');
    });
  });

  describe('Styling', () => {
    it('applies cursor-pointer style when result exists', () => {
      const toolCalls = [
        createMockToolCall('tool-1', 'with_result', {}),
      ];
      const toolResults = [
        createMockToolMessage('tool-1', 'result'),
      ];

      render(
        <ToolCalls toolCalls={toolCalls} toolResults={toolResults} />
      );

      const codeElement = document.querySelector('code');
      expect(codeElement).toHaveClass('cursor-pointer');
    });
  });
});
