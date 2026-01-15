/**
 * Tests for the Wikipedia search tool with dependency injection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { SearchResultItem } from '@/lib/searxng';
import {
  createWikipediaSearchTool,
  createWikipediaSearchToolFactory,
  type WikipediaDependencies,
  type WikipediaSearchResult,
} from './wikipedia-search.tool';

describe('createWikipediaSearchTool', () => {
  let mockDependencies: WikipediaDependencies;
  let mockConfig: RunnableConfig;

  beforeEach(() => {
    const mockResults: SearchResultItem[] = [
      { title: 'Wikipedia Page 1', url: 'https://en.wikipedia.org/wiki/Page1', description: 'Description 1' },
      { title: 'Wikipedia Page 2', url: 'https://en.wikipedia.org/wiki/Page2', description: 'Description 2' },
    ];

    mockDependencies = {
      resolveSearchConfig: vi.fn().mockResolvedValue({
        ok: true,
        apiUrl: 'https://search.example.com',
        apiKey: 'test-key',
        provider: 'searxng' as const,
      }),
      buildSearXNGUrl: vi.fn().mockReturnValue('https://search.example.com/search?q=test'),
      safeJson: vi.fn().mockResolvedValue({ results: mockResults }),
      parseSearXNGResults: vi.fn().mockReturnValue(mockResults),
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: vi.fn().mockResolvedValue(JSON.stringify({ results: mockResults })),
        json: vi.fn().mockResolvedValue({ results: mockResults }),
      }),
      createProgressReporter: vi.fn().mockReturnValue({
        report: vi.fn(),
        reset: vi.fn(),
      }),
      getSearchingUpdate: vi.fn().mockReturnValue('Searching Wikipedia...'),
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

  it('should create a Wikipedia search tool with dependencies', () => {
    const tool = createWikipediaSearchTool(mockDependencies);
    
    expect(tool).toBeDefined();
    expect(tool.name).toBe('wikipedia_search');
    expect(typeof tool.description).toBe('string');
    expect(tool.schema).toBeDefined();
  });

  it('should return configuration error when not configured', async () => {
    mockDependencies.resolveSearchConfig = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'Search API not configured',
    });

    const tool = createWikipediaSearchTool(mockDependencies);
    const result = await tool.invoke({ query: 'test query' }, mockConfig);
    
    expect(result).toContain('Wikipedia search tool is not configured');
    expect(result).toContain('Search API not configured');
  });

  it('should execute search with default parameters', async () => {
    const tool = createWikipediaSearchTool(mockDependencies);
    
    await tool.invoke({ query: 'test query' }, mockConfig);
    
    expect(mockDependencies.resolveSearchConfig).toHaveBeenCalled();
    expect(mockDependencies.buildSearXNGUrl).toHaveBeenCalled();
    expect(mockDependencies.fetch).toHaveBeenCalled();
  });

  it('should use custom result count', async () => {
    const buildMock = vi.fn().mockReturnValue('https://search.example.com/search?q=test');
    const factory = createWikipediaSearchToolFactory({
      resolveSearchConfig: vi.fn().mockResolvedValue({
        ok: true,
        apiUrl: 'https://search.example.com',
        apiKey: 'test-key',
        provider: 'searxng' as const,
      }),
      buildSearXNGUrl: buildMock,
      safeJson: vi.fn().mockResolvedValue({}),
      parseSearXNGResults: vi.fn().mockReturnValue([]),
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue({ results: [] }),
      }),
      createProgressReporter: vi.fn().mockReturnValue({
        report: vi.fn(),
        reset: vi.fn(),
      }),
      getSearchingUpdate: vi.fn().mockReturnValue('Searching...'),
    });
    
    const result = await factory();
    expect(result.ok).toBe(true);
    if (result.ok) {
      await result.tool.invoke({ query: 'test query', n_results: 5 }, mockConfig);
      expect(buildMock).toHaveBeenCalledWith(
        'https://search.example.com',
        'test query',
        5,
        1,
        'site:wikipedia.org'
      );
    }
  });

  it('should use custom starting index', async () => {
    const buildMock = vi.fn().mockReturnValue('https://search.example.com/search?q=test');
    mockDependencies.buildSearXNGUrl = buildMock;

    const tool = createWikipediaSearchTool(mockDependencies);
    await tool.invoke({ query: 'test query', starting_index: 10 }, mockConfig);

    // Formula: buildSearXNGUrl(apiUrl, query, n_results + starting_index, starting_index + 1, "site:wikipedia.org")
    // With starting_index=10 and n_results=10 (default), this becomes:
    // 3rd arg: 10 + 10 = 20
    // 4th arg: 10 + 1 = 11
    expect(buildMock).toHaveBeenCalledWith(
      'https://search.example.com',
      'test query',
      20,  // n_results (10) + starting_index (10)
      11,  // starting_index (10) + 1
      'site:wikipedia.org'
    );
  });

  it('should report progress during search', async () => {
    const mockReporter = {
      report: vi.fn(),
      reset: vi.fn(),
    };
    mockDependencies.createProgressReporter = vi.fn().mockReturnValue(mockReporter);
    mockDependencies.getSearchingUpdate = vi.fn().mockReturnValue('Searching Wikipedia...');

    const tool = createWikipediaSearchTool(mockDependencies);
    await tool.invoke({ query: 'test' }, mockConfig);
    
    expect(mockReporter.report).toHaveBeenCalledWith('Searching Wikipedia...');
    expect(mockReporter.reset).toHaveBeenCalled();
  });

  it('should handle fetch error', async () => {
    mockDependencies.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: vi.fn().mockResolvedValue('Error'),
    });

    const tool = createWikipediaSearchTool(mockDependencies);
    const result = await tool.invoke({ query: 'test' }, mockConfig);
    
    expect(result).toContain('Wikipedia search failed');
    expect(result).toContain('500');
  });

  it('should parse and return results as JSON', async () => {
    const tool = createWikipediaSearchTool(mockDependencies);
    const result = await tool.invoke({ query: 'test' }, mockConfig);
    
    expect(result).toContain('[');
    expect(result).toContain(']');
    expect(result).toContain('page_id');
    expect(result).toContain('page_title');
  });
});

describe('createWikipediaSearchToolFactory', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return a factory function', () => {
    const factory = createWikipediaSearchToolFactory();
    
    expect(typeof factory).toBe('function');
  });

  it('should return ToolFactoryResult with ok=true when configured', async () => {
    const factory = createWikipediaSearchToolFactory();
    const result = await factory();
    
    expect(result).toHaveProperty('ok');
    if (result.ok) {
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('wikipedia_search');
    }
  });

  it('should return ToolFactoryResult with ok=false when not configured', async () => {
    const factory = createWikipediaSearchToolFactory({
      resolveSearchConfig: vi.fn().mockResolvedValue({ ok: false, reason: 'Config missing' }),
      buildSearXNGUrl: vi.fn(),
      safeJson: vi.fn(),
      parseSearXNGResults: vi.fn(),
      fetch: vi.fn(),
      createProgressReporter: vi.fn().mockReturnValue({
        report: vi.fn(),
        reset: vi.fn(),
      }),
      getSearchingUpdate: vi.fn().mockReturnValue('Searching...'),
    });
    
    const result = await factory();
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('Config missing');
    }
  });

  it('should allow dependency overrides', async () => {
    const mockResolve = vi.fn().mockResolvedValue({ ok: true, apiUrl: 'https://test.com', apiKey: '', provider: 'searxng' as const });
    const mockBuild = vi.fn().mockReturnValue('https://test.com/search');
    
    const factory = createWikipediaSearchToolFactory({
      resolveSearchConfig: mockResolve,
      buildSearXNGUrl: mockBuild,
      safeJson: vi.fn().mockResolvedValue({}),
      parseSearXNGResults: vi.fn().mockReturnValue([]),
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ results: [] }),
      }),
      createProgressReporter: vi.fn().mockReturnValue({
        report: vi.fn(),
        reset: vi.fn(),
      }),
      getSearchingUpdate: vi.fn().mockReturnValue('Searching...'),
    });
    
    const result = await factory();
    
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tool.name).toBe('wikipedia_search');
    }
  });
});

describe('WikipediaSearchResult type', () => {
  it('should accept valid search result', () => {
    const result: WikipediaSearchResult = {
      page_id: 1,
      page_title: 'Test Page',
      description: 'Test description',
      index: 1,
    };
    
    expect(result.page_id).toBe(1);
    expect(result.page_title).toBe('Test Page');
    expect(result.description).toBe('Test description');
    expect(result.index).toBe(1);
  });

  it('should accept empty description', () => {
    const result: WikipediaSearchResult = {
      page_id: 1,
      page_title: 'Test Page',
      description: '',
      index: 1,
    };
    
    expect(result.description).toBe('');
  });
});
