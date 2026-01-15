/**
 * Tests for the web search tool with dependency injection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StructuredTool } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  createWebSearchTool,
  createWebSearchToolFactory,
  type WebSearchDependencies,
  type SearchConfigResult,
  type SearchResultItem,
} from './web-search.tool';

describe('createWebSearchTool', () => {
  let mockDependencies: WebSearchDependencies;
  let mockConfig: RunnableConfig;

  beforeEach(() => {
    mockDependencies = {
      verifySearchConfigured: vi.fn().mockResolvedValue({ ok: true }),
      fetchSettings: vi.fn().mockResolvedValue(null),
      executeSearXNGSearch: vi.fn().mockResolvedValue('1. Result 1 — https://example.com :: Description 1'),
      createProgressReporter: vi.fn().mockReturnValue({
        report: vi.fn(),
        reset: vi.fn(),
      }),
      getSearchingUpdate: vi.fn().mockReturnValue('Searching...'),
    };

    mockConfig = {
      configurable: {
        thread_id: 'test-thread',
      },
    } as RunnableConfig;

    Object.defineProperty(mockConfig, 'writer', {
      value: vi.fn(),
      writable: true,
      enumerable: true,
    });
  });

  it('should create a web search tool with dependencies', () => {
    const tool = createWebSearchTool(mockDependencies);
    
    expect(tool).toBeDefined();
    expect(tool.name).toBe('web_search');
    expect(typeof tool.description).toBe('string');
    expect(tool.schema).toBeDefined();
  });

  it('should return configuration error when not configured', async () => {
    const factory = createWebSearchToolFactory({
      verifySearchConfigured: vi.fn().mockResolvedValue({ ok: false, reason: 'API key missing' }),
      executeSearXNGSearch: vi.fn(),
      createProgressReporter: vi.fn().mockReturnValue({
        report: vi.fn(),
        reset: vi.fn(),
      }),
      getSearchingUpdate: vi.fn().mockReturnValue('Searching...'),
    });
    
    const result = await factory();
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.name).toBe('web_search');
      expect(result.reason).toBe('API key missing');
    }
  });

  it('should execute search with default parameters', async () => {
    const executeMock = vi.fn().mockResolvedValue('1. Result');
    const factory = createWebSearchToolFactory({
      verifySearchConfigured: vi.fn().mockResolvedValue({ ok: true }),
      fetchSettings: vi.fn().mockResolvedValue({
        services: {
          search: {
            apiUrl: 'https://search.example.com',
            apiKey: 'test-key'
          }
        }
      }),
      executeSearXNGSearch: executeMock,
      createProgressReporter: vi.fn().mockReturnValue({
        report: vi.fn(),
        reset: vi.fn(),
      }),
      getSearchingUpdate: vi.fn().mockReturnValue('Searching...'),
    });
    
    const result = await factory();
    expect(result.ok).toBe(true);
    if (result.ok) {
      await result.tool.invoke({ query: 'test query' }, mockConfig);
      expect(executeMock).toHaveBeenCalledWith('test query', 3, 1);
    }
  });

  it('should use custom result count', async () => {
    const executeMock = vi.fn().mockResolvedValue('results');
    const factory = createWebSearchToolFactory({
      verifySearchConfigured: vi.fn().mockResolvedValue({ ok: true }),
      fetchSettings: vi.fn().mockResolvedValue({
        services: {
          search: {
            apiUrl: 'https://search.example.com',
            apiKey: 'test-key'
          }
        }
      }),
      executeSearXNGSearch: executeMock,
      createProgressReporter: vi.fn().mockReturnValue({
        report: vi.fn(),
        reset: vi.fn(),
      }),
      getSearchingUpdate: vi.fn().mockReturnValue('Searching...'),
    });
    
    const result = await factory();
    expect(result.ok).toBe(true);
    if (result.ok) {
      await result.tool.invoke({ query: 'test query', count: 5 }, mockConfig);
      expect(executeMock).toHaveBeenCalledWith('test query', 5, 1);
    }
  });

  it('should use custom starting index', async () => {
    const executeMock = vi.fn().mockResolvedValue('results');
    const factory = createWebSearchToolFactory({
      verifySearchConfigured: vi.fn().mockResolvedValue({ ok: true }),
      fetchSettings: vi.fn().mockResolvedValue({
        services: {
          search: {
            apiUrl: 'https://search.example.com',
            apiKey: 'test-key'
          }
        }
      }),
      executeSearXNGSearch: executeMock,
      createProgressReporter: vi.fn().mockReturnValue({
        report: vi.fn(),
        reset: vi.fn(),
      }),
      getSearchingUpdate: vi.fn().mockReturnValue('Searching...'),
    });
    
    const result = await factory();
    expect(result.ok).toBe(true);
    if (result.ok) {
      await result.tool.invoke({ query: 'test query', starting_index: 10 }, mockConfig);
      expect(executeMock).toHaveBeenCalledWith('test query', 3, 10);
    }
  });

  it('should report progress during search', async () => {
    const mockReporter = {
      report: vi.fn(),
      reset: vi.fn(),
    };
    mockDependencies.createProgressReporter = vi.fn().mockReturnValue(mockReporter);
    mockDependencies.getSearchingUpdate = vi.fn().mockReturnValue('Searching the web...');
    // Provide valid configuration so the search actually executes
    mockDependencies.fetchSettings = vi.fn().mockResolvedValue({
      services: {
        search: {
          apiUrl: 'https://search.example.com',
          apiKey: 'test-key'
        }
      }
    });

    const tool = createWebSearchTool(mockDependencies);
    await tool.invoke({ query: 'test' }, mockConfig);
    
    expect(mockReporter.report).toHaveBeenCalledWith('Searching the web...');
    expect(mockReporter.reset).toHaveBeenCalled();
  });

  it('should reset progress after search completes', async () => {
    const mockReporter = {
      report: vi.fn(),
      reset: vi.fn(),
    };
    mockDependencies.createProgressReporter = vi.fn().mockReturnValue(mockReporter);

    const tool = createWebSearchTool(mockDependencies);
    await tool.invoke({ query: 'test' }, mockConfig);
    
    expect(mockReporter.reset).toHaveBeenCalled();
  });

  it('should handle search execution error', async () => {
    // Create new dependencies with failing execute function
    const errorDependencies: WebSearchDependencies = {
      verifySearchConfigured: vi.fn().mockResolvedValue({ ok: true }),
      fetchSettings: vi.fn().mockResolvedValue({
        services: {
          search: {
            apiUrl: 'https://search.example.com',
            apiKey: 'test-key'
          }
        }
      }),
      executeSearXNGSearch: vi.fn().mockRejectedValue(new Error('Search failed')),
      createProgressReporter: vi.fn().mockReturnValue({
        report: vi.fn(),
        reset: vi.fn(),
      }),
      getSearchingUpdate: vi.fn().mockReturnValue('Searching...'),
    };

    const tool = createWebSearchTool(errorDependencies);
    
    // The tool should propagate the error
    await expect(tool.invoke({ query: 'test' }, mockConfig)).rejects.toThrow('Search failed');
  });
});

describe('createWebSearchToolFactory', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return a factory function', () => {
    const factory = createWebSearchToolFactory();
    
    expect(typeof factory).toBe('function');
  });

  it('should return ToolFactoryResult with ok=true when configured', async () => {
    const factory = createWebSearchToolFactory({
      verifySearchConfigured: vi.fn().mockResolvedValue({ ok: true }),
      fetchSettings: vi.fn().mockResolvedValue({
        services: {
          search: {
            apiUrl: 'https://search.example.com',
            apiKey: 'test-key'
          }
        }
      }),
    });
    const result = await factory();
    
    expect(result).toHaveProperty('ok');
    if (result.ok) {
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('web_search');
    }
  });

  it('should return ToolFactoryResult with ok=false when not configured', async () => {
    const factory = createWebSearchToolFactory({
      verifySearchConfigured: vi.fn().mockResolvedValue({ ok: false, reason: 'API key missing' }),
    });
    
    const result = await factory();
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.name).toBe('web_search');
      expect(result.reason).toBe('API key missing');
    }
  });

  it('should allow dependency overrides', async () => {
    const mockVerify = vi.fn().mockResolvedValue({ ok: true });
    const mockExecute = vi.fn().mockResolvedValue('Custom results');
    
    const factory = createWebSearchToolFactory({
      verifySearchConfigured: mockVerify,
      fetchSettings: vi.fn().mockResolvedValue({
        services: {
          search: {
            apiUrl: 'https://search.example.com',
            apiKey: 'test-key'
          }
        }
      }),
      executeSearXNGSearch: mockExecute,
    });
    
    const result = await factory();
    
    expect(mockVerify).toHaveBeenCalled();
    if (result.ok) {
      const tool = result.tool as unknown as StructuredTool;
      expect(tool.name).toBe('web_search');
    }
  });

  it('should handle configuration with empty API key', async () => {
    const factory = createWebSearchToolFactory({
      verifySearchConfigured: vi.fn().mockResolvedValue({ ok: false, reason: 'Missing search API configuration.' }),
    });
    
    const result = await factory();
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.name).toBe('web_search');
    }
  });
});

describe('WebSearchDependencies', () => {
  it('should allow partial dependency overrides', () => {
    const partialDeps: Partial<WebSearchDependencies> = {
      verifySearchConfigured: vi.fn().mockResolvedValue({ ok: true }),
    };
    
    const factory = createWebSearchToolFactory(partialDeps);
    expect(typeof factory).toBe('function');
  });
});

describe('SearchConfigResult type', () => {
  it('should discriminate ok=true case', () => {
    const result: SearchConfigResult = {
      ok: true,
      apiKey: 'test-key',
      apiUrl: 'https://search.example.com',
      provider: 'searxng',
    };
    
    expect(result.ok).toBe(true);
    expect(result.apiKey).toBe('test-key');
    expect(result.apiUrl).toBe('https://search.example.com');
    expect(result.provider).toBe('searxng');
  });

  it('should discriminate ok=false case', () => {
    const result: SearchConfigResult = {
      ok: false,
      reason: 'Missing configuration',
    };
    
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Missing configuration');
  });
});

describe('SearchResultItem type', () => {
  it('should accept valid result item', () => {
    const item: SearchResultItem = {
      title: 'Test Result',
      url: 'https://example.com',
      description: 'Test description',
    };
    
    expect(item.title).toBe('Test Result');
    expect(item.url).toBe('https://example.com');
    expect(item.description).toBe('Test description');
  });

  it('should accept partial result item', () => {
    const item: SearchResultItem = {
      title: 'Test Result',
    };
    
    expect(item.title).toBe('Test Result');
    expect(item.url).toBeUndefined();
    expect(item.description).toBeUndefined();
  });
});
