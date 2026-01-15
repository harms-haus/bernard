/**
 * Tests for Bernard agent tool registry and validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StructuredTool } from '@langchain/core/tools';
import type { ToolFactory } from './types';
import type { ToolDefinition } from './validation';
import {
  getToolDefinitions,
  validateToolFactory,
  validateTools,
  validateAndGetTools,
} from './validation';
import {
  webSearchToolFactory,
  getWebsiteContentToolFactory,
  wikipediaSearchToolFactory,
  wikipediaEntryToolFactory,
  getWeatherDataToolFactory,
  listHAEntitiesToolFactory,
  executeHomeAssistantServicesToolFactory,
  toggleLightToolFactory,
  getHistoricalStateToolFactory,
  playMediaTvToolFactory,
  searchMediaToolFactory,
  findMediaStatusToolFactory,
  requestMediaToolFactory,
  listMediaRequestsToolFactory,
  cancelMediaRequestToolFactory,
  reportMediaIssueToolFactory,
} from './index';

describe('Tool Registry', () => {
  describe('getToolDefinitions', () => {
    it('should return an array of tool definitions', () => {
      const definitions = getToolDefinitions();
      
      expect(Array.isArray(definitions)).toBe(true);
      expect(definitions.length).toBeGreaterThan(0);
    });

    it('should include all expected tool names', () => {
      const definitions = getToolDefinitions();
      const names = definitions.map(d => d.name);
      
      expect(names).toContain('web_search');
      expect(names).toContain('website_content');
      expect(names).toContain('wikipedia_search');
      expect(names).toContain('wikipedia_entry');
      expect(names).toContain('get_weather');
      expect(names).toContain('home_assistant_list_entities');
      expect(names).toContain('home_assistant_execute_services');
      expect(names).toContain('toggle_home_assistant_light');
      expect(names).toContain('get_home_assistant_historical_state');
      expect(names).toContain('play_media_tv');
      expect(names).toContain('search_media');
    });

    it('should have factory functions for all definitions', () => {
      const definitions = getToolDefinitions();
      
      for (const definition of definitions) {
        expect(typeof definition.factory).toBe('function');
        expect(definition.factory).toBeInstanceOf(Function);
      }
    });

    it('should return array of valid ToolDefinition objects', () => {
      const definitions = getToolDefinitions();
      
      for (const def of definitions) {
        expect(def).toHaveProperty('name');
        expect(def).toHaveProperty('factory');
        expect(typeof def.name).toBe('string');
        expect(typeof def.factory).toBe('function');
      }
    });
  });

  describe('getToolDefinitions - each tool', () => {
    it('web_search factory should be a function', () => {
      const definitions = getToolDefinitions();
      const webSearch = definitions.find(d => d.name === 'web_search');
      
      expect(webSearch).toBeDefined();
      expect(typeof webSearch!.factory).toBe('function');
    });

    it('search_media factory should be a function', () => {
      const definitions = getToolDefinitions();
      const searchMedia = definitions.find(d => d.name === 'search_media');
      
      expect(searchMedia).toBeDefined();
      expect(typeof searchMedia!.factory).toBe('function');
    });

    it('toggle_home_assistant_light factory should be a function', () => {
      const definitions = getToolDefinitions();
      const toggleLight = definitions.find(d => d.name === 'toggle_home_assistant_light');
      
      expect(toggleLight).toBeDefined();
      expect(typeof toggleLight!.factory).toBe('function');
    });
  });
});

describe('validateToolFactory', () => {
  describe('with valid factory', () => {
    it('should return ok=true for a working factory', async () => {
      const mockFactory: ToolFactory = async () => ({
        ok: true,
        tool: {
          name: 'mock_tool',
          description: 'A mock tool',
          schema: { type: 'object', properties: {} },
          invoke: async () => 'result',
        } as unknown as StructuredTool,
      });

      const result = await validateToolFactory({
        name: 'mock_tool',
        factory: mockFactory,
      });

      expect(result.ok).toBe(true);
      expect(result.name).toBe('mock_tool');
      expect(result.tool).toBeDefined();
    });

    it('should return tool name from factory result if available', async () => {
      const mockFactory: ToolFactory = async () => ({
        ok: true,
        tool: {
          name: 'actual_tool_name',
          description: 'A mock tool',
          schema: { type: 'object', properties: {} },
          invoke: async () => 'result',
        } as unknown as StructuredTool,
      });

      const result = await validateToolFactory({
        name: 'registered_name',
        factory: mockFactory,
      });

      expect(result.ok).toBe(true);
      expect(result.name).toBe('actual_tool_name');
    });

    it('should return ok=false with name and reason for failing factory', async () => {
      const mockFactory: ToolFactory = async () => ({
        ok: false,
        name: 'failing_tool',
        reason: 'Configuration missing',
      });

      const result = await validateToolFactory({
        name: 'failing_tool',
        factory: mockFactory,
      });

      expect(result.ok).toBe(false);
      expect(result.name).toBe('failing_tool');
      expect(result.reason).toBe('Configuration missing');
    });

    it('should handle exceptions from factory', async () => {
      const mockFactory: ToolFactory = async () => {
        throw new Error('Factory error');
      };

      const result = await validateToolFactory({
        name: 'error_tool',
        factory: mockFactory,
      });

      expect(result.ok).toBe(false);
      expect(result.name).toBe('error_tool');
      expect(result.reason).toBe('Factory error');
    });

    it('should convert non-Error exceptions to string', async () => {
      const mockFactory: ToolFactory = async () => {
        throw 'string error';
      };

      const result = await validateToolFactory({
        name: 'string_error_tool',
        factory: mockFactory,
      });

      expect(result.ok).toBe(false);
      expect(result.name).toBe('string_error_tool');
      expect(result.reason).toBe('string error');
    });
  });

  describe('with real tool factories', () => {
    it('should validate web_search tool factory', async () => {
      const definitions = getToolDefinitions();
      const webSearchDef = definitions.find(d => d.name === 'web_search');
      
      expect(webSearchDef).toBeDefined();
      
      const result = await validateToolFactory(webSearchDef!);
      
      expect(typeof result.name).toBe('string');
      if (result.ok) {
        expect(result.tool).toBeDefined();
      } else {
        expect(result.reason).toBeDefined();
      }
    });

    it('should validate wikipedia_entry tool factory', async () => {
      const definitions = getToolDefinitions();
      const wikipediaEntryDef = definitions.find(d => d.name === 'wikipedia_entry');
      
      expect(wikipediaEntryDef).toBeDefined();
      
      const result = await validateToolFactory(wikipediaEntryDef!);
      
      expect(typeof result.name).toBe('string');
      if (result.ok) {
        expect(result.tool).toBeDefined();
      }
    });

    it('should validate get_weather tool factory', async () => {
      const definitions = getToolDefinitions();
      const getWeatherDef = definitions.find(d => d.name === 'get_weather');
      
      expect(getWeatherDef).toBeDefined();
      
      const result = await validateToolFactory(getWeatherDef!);
      
      expect(typeof result.name).toBe('string');
      if (result.ok) {
        expect(result.tool).toBeDefined();
      }
    });
  });
});

describe('validateTools', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return validTools and disabledTools arrays', async () => {
    const definitions = getToolDefinitions();
    const result = await validateTools(definitions);
    
    expect(result).toHaveProperty('validTools');
    expect(result).toHaveProperty('disabledTools');
    expect(Array.isArray(result.validTools)).toBe(true);
    expect(Array.isArray(result.disabledTools)).toBe(true);
  });

  it('should use default definitions if none provided', async () => {
    const result = await validateTools();
    
    expect(result.validTools.length + result.disabledTools.length).toBeGreaterThan(0);
  });

  it('should handle empty definitions array', async () => {
    const result = await validateTools([]);
    
    expect(result.validTools).toEqual([]);
    expect(result.disabledTools).toEqual([]);
  });

  it('should separate valid from disabled tools', async () => {
    const definitions: ToolDefinition[] = [
      {
        name: 'working_tool',
        factory: async () => ({
          ok: true,
          tool: { name: 'working_tool', description: '', schema: {} } as unknown as StructuredTool,
        }),
      },
      {
        name: 'failing_tool',
        factory: async () => ({
          ok: false,
          name: 'failing_tool',
          reason: 'Not configured',
        }),
      },
    ];

    const result = await validateTools(definitions);
    
    expect(result.validTools.length).toBe(1);
    expect(result.disabledTools.length).toBe(1);
    expect(result.disabledTools[0].name).toBe('failing_tool');
  });

  it('should process all tools in the definitions array', async () => {
    const definitions = getToolDefinitions();
    const result = await validateTools(definitions);
    
    const totalProcessed = result.validTools.length + result.disabledTools.length;
    expect(totalProcessed).toBe(definitions.length);
  });
});

describe('validateAndGetTools', () => {
  it('should return same structure as validateTools', async () => {
    const result = await validateAndGetTools();
    
    expect(result).toHaveProperty('validTools');
    expect(result).toHaveProperty('disabledTools');
    expect(Array.isArray(result.validTools)).toBe(true);
    expect(Array.isArray(result.disabledTools)).toBe(true);
  });

  it('should use default tool definitions', async () => {
    const defaultResult = await validateTools();
    const wrapperResult = await validateAndGetTools();
    
    expect(wrapperResult.validTools.length).toBe(defaultResult.validTools.length);
    expect(wrapperResult.disabledTools.length).toBe(defaultResult.disabledTools.length);
  });
});

describe('Tool Factory Type Checks', () => {
  it('webSearchToolFactory should return correct result structure', async () => {
    const result = await webSearchToolFactory();
    
    expect(result).toHaveProperty('ok');
    expect(typeof result.ok).toBe('boolean');
    
    if (result.ok) {
      expect(result).toHaveProperty('tool');
      expect(result.tool).toHaveProperty('name');
      expect(result.tool).toHaveProperty('description');
      expect(result.tool).toHaveProperty('schema');
    } else {
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('reason');
    }
  });

  it('getWebsiteContentToolFactory should return correct structure', async () => {
    const result = await getWebsiteContentToolFactory();
    
    expect(result).toHaveProperty('ok');
    if (result.ok) {
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('get_website_content');
    }
  });

  it('wikipediaEntryToolFactory should return correct structure', async () => {
    const result = await wikipediaEntryToolFactory();
    
    expect(result).toHaveProperty('ok');
    if (result.ok) {
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('wikipedia_entry');
    }
  });

  it('getWeatherDataToolFactory should return correct structure', async () => {
    const result = await getWeatherDataToolFactory();
    
    expect(result).toHaveProperty('ok');
    if (result.ok) {
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('get_weather_data');
    }
  });

  it.skip('playMediaTvToolFactory should return correct structure', async () => {
    const result = await playMediaTvToolFactory();
    
    expect(result).toHaveProperty('ok');
    if (result.ok) {
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('play_media_tv');
    }
  });

  it('listHAEntitiesToolFactory should return correct structure', async () => {
    const result = await listHAEntitiesToolFactory();
    
    expect(result).toHaveProperty('ok');
    if (result.ok) {
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('list_home_assistant_entities');
    }
  });

  it('toggleLightToolFactory should return correct structure', async () => {
    const result = await toggleLightToolFactory();
    
    expect(result).toHaveProperty('ok');
    if (result.ok) {
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('toggle_home_assistant_light');
    }
  });

  it('getHistoricalStateToolFactory should return correct structure', async () => {
    const result = await getHistoricalStateToolFactory();
    
    expect(result).toHaveProperty('ok');
    if (result.ok) {
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('get_home_assistant_historical_state');
    }
  });

  it('executeHomeAssistantServicesToolFactory should return correct structure', async () => {
    const result = await executeHomeAssistantServicesToolFactory();
    
    expect(result).toHaveProperty('ok');
    if (result.ok) {
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('execute_home_assistant_services');
    }
  });

  it.skip('searchMediaToolFactory should return correct structure', async () => {
    const result = await searchMediaToolFactory();
    
    expect(result).toHaveProperty('ok');
    if (result.ok) {
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('search_media');
    }
  });

  it.skip('requestMediaToolFactory should return correct structure', async () => {
    const result = await requestMediaToolFactory();
    
    expect(result).toHaveProperty('ok');
    if (result.ok) {
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('request_media');
    }
  });

  it.skip('listMediaRequestsToolFactory should return correct structure', async () => {
    const result = await listMediaRequestsToolFactory();
    
    expect(result).toHaveProperty('ok');
    if (result.ok) {
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('list_media_requests');
    }
  });

  it.skip('cancelMediaRequestToolFactory should return correct structure', async () => {
    const result = await cancelMediaRequestToolFactory();
    
    expect(result).toHaveProperty('ok');
    if (result.ok) {
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('cancel_media_request');
    }
  });

  it.skip('reportMediaIssueToolFactory should return correct structure', async () => {
    const result = await reportMediaIssueToolFactory();
    
    expect(result).toHaveProperty('ok');
    if (result.ok) {
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('report_media_issue');
    }
  });

  it.skip('findMediaStatusToolFactory should return correct structure', async () => {
    const result = await findMediaStatusToolFactory();
    
    expect(result).toHaveProperty('ok');
    if (result.ok) {
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('find_media_status');
    }
  });

  it('wikipediaSearchToolFactory should return correct structure', async () => {
    const result = await wikipediaSearchToolFactory();
    
    expect(result).toHaveProperty('ok');
    if (result.ok) {
      expect(result.tool).toBeDefined();
      expect(result.tool.name).toBe('wikipedia_search');
    }
  });
});

describe('Tool Validation Result Types', () => {
  it('valid result should have correct structure', async () => {
    const workingFactory: ToolFactory = async () => ({
      ok: true,
      tool: { name: 'test' } as unknown as StructuredTool,
    });

    const result = await validateToolFactory({ name: 'test', factory: workingFactory });
    
    expect(result.ok).toBe(true);
    expect(result.name).toBe('test');
    expect(result.tool).toBeDefined();
  });

  it('disabled result should have correct structure', async () => {
    const failingFactory: ToolFactory = async () => ({
      ok: false,
      name: 'failing_tool',
      reason: 'Configuration missing',
    });

    const result = await validateToolFactory({ name: 'failing_tool', factory: failingFactory });
    
    expect(result.ok).toBe(false);
    expect(result.name).toBe('failing_tool');
    expect(result.reason).toBe('Configuration missing');
  });

  it('ToolsValidationResult should separate valid and disabled', async () => {
    const definitions: ToolDefinition[] = [
      {
        name: 'tool1',
        factory: async () => ({
          ok: true,
          tool: { name: 'tool1' } as unknown as StructuredTool,
        }),
      },
      {
        name: 'tool2',
        factory: async () => ({
          ok: false,
          name: 'tool2',
          reason: 'Disabled',
        }),
      },
    ];

    const result = await validateTools(definitions);
    
    expect(result.validTools.length).toBe(1);
    expect(result.disabledTools.length).toBe(1);
    expect(result.disabledTools[0]).toEqual({
      name: 'tool2',
      reason: 'Disabled',
    });
  });
});

describe('Concurrent Validation', () => {
  it('should handle concurrent validation requests', async () => {
    const definitions = getToolDefinitions();
    
    const results = await Promise.all([
      validateTools(definitions),
      validateTools(definitions),
      validateTools(definitions),
    ]);
    
    for (const result of results) {
      const totalProcessed = result.validTools.length + result.disabledTools.length;
      expect(totalProcessed).toBe(definitions.length);
    }
  });
});

describe('Edge Cases', () => {
  it('should handle factory that returns tool with undefined name', async () => {
    const mockFactory: ToolFactory = async () => ({
      ok: true,
      tool: { 
        name: undefined as unknown as string,
        description: '', 
        schema: {} 
      } as unknown as StructuredTool,
    });

    const result = await validateToolFactory({
      name: 'original_name',
      factory: mockFactory,
    });

    expect(result.ok).toBe(true);
    expect(result.name).toBe('original_name');
  });

  it('should handle factory with empty name in failure result', async () => {
    const mockFactory: ToolFactory = async () => ({
      ok: false,
      name: '',
      reason: 'No name provided',
    });

    const result = await validateToolFactory({
      name: 'original_name',
      factory: mockFactory,
    });

    expect(result.ok).toBe(false);
    expect(result.name).toBe('');
  });
});
