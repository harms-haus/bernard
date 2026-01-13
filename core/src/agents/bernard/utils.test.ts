/**
 * Tests for Bernard agent utilities.
 */

import { describe, it, expect, vi } from 'vitest';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import {
  createProgressReporter,
  type ProgressReporter,
  type LlmOptions,
} from './utils';

describe('createProgressReporter', () => {
  describe('ProgressReporter interface', () => {
    it('should return object with report and reset methods', () => {
      const mockConfig = createMockConfig();
      const reporter = createProgressReporter(mockConfig, 'test_tool');

      expect(reporter).toHaveProperty('report');
      expect(reporter).toHaveProperty('reset');
      expect(typeof reporter.report).toBe('function');
      expect(typeof reporter.reset).toBe('function');
    });
  });

  describe('report method', () => {
    it('should call config writer with correct structure', () => {
      const writerMock = vi.fn();
      const mockConfig = createMockConfig(writerMock);
      const reporter = createProgressReporter(mockConfig, 'web_search');

      reporter.report('Searching the web...');

      expect(writerMock).toHaveBeenCalledWith({
        _type: 'tool_progress',
        tool: 'web_search',
        phase: 'step',
        message: 'Searching the web...',
      });
    });

    it('should report with custom tool name', () => {
      const writerMock = vi.fn();
      const mockConfig = createMockConfig(writerMock);
      const reporter = createProgressReporter(mockConfig, 'timer');

      reporter.report('Setting timer...');

      expect(writerMock).toHaveBeenCalledWith({
        _type: 'tool_progress',
        tool: 'timer',
        phase: 'step',
        message: 'Setting timer...',
      });
    });

    it('should handle empty message', () => {
      const writerMock = vi.fn();
      const mockConfig = createMockConfig(writerMock);
      const reporter = createProgressReporter(mockConfig, 'test');

      reporter.report('');

      expect(writerMock).toHaveBeenCalledWith({
        _type: 'tool_progress',
        tool: 'test',
        phase: 'step',
        message: '',
      });
    });

    it('should handle long messages', () => {
      const writerMock = vi.fn();
      const mockConfig = createMockConfig(writerMock);
      const reporter = createProgressReporter(mockConfig, 'test');

      const longMessage = 'This is a very long progress message that might be used for detailed updates';
      reporter.report(longMessage);

      expect(writerMock).toHaveBeenCalledWith({
        _type: 'tool_progress',
        tool: 'test',
        phase: 'step',
        message: longMessage,
      });
    });
  });

  describe('reset method', () => {
    it('should call config writer with complete phase', () => {
      const writerMock = vi.fn();
      const mockConfig = createMockConfig(writerMock);
      const reporter = createProgressReporter(mockConfig, 'test');

      reporter.reset();

      expect(writerMock).toHaveBeenCalledWith({
        _type: 'tool_progress',
        tool: 'test',
        phase: 'complete',
        message: 'Done',
      });
    });

    it('should always use "Done" as reset message', () => {
      const writerMock = vi.fn();
      const mockConfig = createMockConfig(writerMock);
      const reporter = createProgressReporter(mockConfig, 'test');

      reporter.reset();

      expect(writerMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Done',
        })
      );
    });
  });

  describe('missing writer', () => {
    it('should not throw when config has no writer', () => {
      const mockConfig = {
        configurable: {
          thread_id: 'test-thread',
        },
      } as LangGraphRunnableConfig;

      const reporter = createProgressReporter(mockConfig, 'test');

      expect(() => reporter.report('test')).not.toThrow();
      expect(() => reporter.reset()).not.toThrow();
    });

    it('should gracefully handle undefined writer', () => {
      const mockConfig = {
        configurable: {
          thread_id: 'test-thread',
        },
        writer: undefined,
      } as unknown as LangGraphRunnableConfig;

      const reporter = createProgressReporter(mockConfig, 'test');

      expect(() => reporter.report('test')).not.toThrow();
      expect(() => reporter.reset()).not.toThrow();
    });
  });
});

describe('LlmOptions type', () => {
  it('should accept all optional fields', () => {
    const options: LlmOptions = {
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 1000,
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com',
    };

    expect(options.temperature).toBe(0.7);
    expect(options.topP).toBe(0.9);
    expect(options.maxTokens).toBe(1000);
    expect(options.apiKey).toBe('test-key');
    expect(options.baseUrl).toBe('https://api.example.com');
  });

  it('should accept partial options', () => {
    const options1: LlmOptions = { temperature: 0.5 };
    const options2: LlmOptions = { maxTokens: 500 };
    const options3: LlmOptions = {};

    expect(options1.temperature).toBe(0.5);
    expect(options2.maxTokens).toBe(500);
    expect(options3).toEqual({});
  });
});

describe('ProgressReporter type', () => {
  it('should match interface structure', () => {
    const reporter: ProgressReporter = {
      report: vi.fn(),
      reset: vi.fn(),
    };

    expect(reporter.report).toBeDefined();
    expect(reporter.reset).toBeDefined();
  });
});

// Helper function to create mock config
function createMockConfig(writerMock?: ReturnType<typeof vi.fn>): LangGraphRunnableConfig {
  return {
    configurable: {
      thread_id: 'test-thread',
    },
    writer: writerMock,
  } as LangGraphRunnableConfig;
}
