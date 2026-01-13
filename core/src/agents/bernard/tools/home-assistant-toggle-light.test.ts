/**
 * Tests for the Home Assistant toggle light tool.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HARestConfig } from './home-assistant-list-entities.tool';
import {
  createToggleLightTool,
  toggleLightToolFactory,
  type ToggleLightDependencies,
} from './home-assistant-toggle-light.tool';

describe('createToggleLightTool', () => {
  let mockDependencies: ToggleLightDependencies;
  let mockRestConfig: HARestConfig;

  beforeEach(() => {
    mockRestConfig = {
      baseUrl: 'http://homeassistant:8123',
      accessToken: 'test-token',
    };

    mockDependencies = {
      getEntityStateImpl: vi.fn().mockResolvedValue({
        entity_id: 'light.living_room',
        state: 'off',
        attributes: {
          friendly_name: 'Living Room Light',
          brightness: 255,
          supported_color_modes: ['rgb', 'hs', 'xy'],
          color_mode: 'rgb',
        },
      }),
      convertColorImpl: vi.fn().mockReturnValue({ rgb_color: [255, 128, 0] }),
      recordServiceCallImpl: vi.fn(),
      callHAServiceWebSocketImpl: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('should create a toggle light tool', () => {
    const tool = createToggleLightTool(mockRestConfig, mockDependencies);
    
    expect(tool).toBeDefined();
    expect(tool.name).toBe('toggle_home_assistant_light');
    expect(typeof tool.description).toBe('string');
    expect(tool.schema).toBeDefined();
  });

  it('should return error for missing entity', async () => {
    const tool = createToggleLightTool(mockRestConfig, mockDependencies);
    
    const result = await tool.invoke({ entity: '' }, {} as any);
    
    expect(result).toContain('Error');
    expect(result).toContain('entity parameter is required');
  });

  it('should return error for invalid entity_id format', async () => {
    const tool = createToggleLightTool(mockRestConfig, mockDependencies);
    
    const result = await tool.invoke({ entity: 'invalid_entity' }, {} as any);
    
    expect(result).toContain('Error');
    expect(result).toContain('Invalid entity_id format');
  });

  it('should return error for non-light domain', async () => {
    const tool = createToggleLightTool(mockRestConfig, mockDependencies);
    
    const result = await tool.invoke({ entity: 'switch.living_room' }, {} as any);
    
    expect(result).toContain('Error');
    expect(result).toContain('not a light');
  });

  it('should return error when no REST config', async () => {
    const tool = createToggleLightTool(undefined, mockDependencies);
    
    const result = await tool.invoke({ entity: 'light.living_room' }, {} as any);
    
    expect(result).toContain('Error');
    expect(result).toContain('Home Assistant configuration is required');
  });

  it('should handle entity not found', async () => {
    mockDependencies.getEntityStateImpl = vi.fn().mockResolvedValue(null);
    
    const tool = createToggleLightTool(mockRestConfig, mockDependencies);
    const result = await tool.invoke({ entity: 'light.nonexistent' }, {} as any);
    
    expect(result).toContain('Error');
    expect(result).toContain('not found');
  });

  it('should toggle light on when off', async () => {
    mockDependencies.getEntityStateImpl = vi.fn().mockResolvedValue({
      entity_id: 'light.living_room',
      state: 'off',
      attributes: { brightness: 255, supported_color_modes: ['onoff'] },
    });
    
    const tool = createToggleLightTool(mockRestConfig, mockDependencies);
    const result = await tool.invoke({ entity: 'light.living_room', on: true }, {} as any);
    
    expect(result).toContain('Successfully executed');
  });

  it('should toggle light off when on', async () => {
    mockDependencies.getEntityStateImpl = vi.fn().mockResolvedValue({
      entity_id: 'light.living_room',
      state: 'on',
      attributes: { brightness: 255, supported_color_modes: ['onoff'] },
    });
    
    const tool = createToggleLightTool(mockRestConfig, mockDependencies);
    const result = await tool.invoke({ entity: 'light.living_room', on: false }, {} as any);
    
    expect(result).toContain('Successfully executed');
  });

  it('should handle brightness_pct', async () => {
    mockDependencies.getEntityStateImpl = vi.fn().mockResolvedValue({
      entity_id: 'light.living_room',
      state: 'on',
      attributes: { brightness: 255, supported_color_modes: ['brightness'] },
    });
    
    const tool = createToggleLightTool(mockRestConfig, mockDependencies);
    const result = await tool.invoke({ entity: 'light.living_room', brightness_pct: 50, on: true }, {} as any);
    
    expect(result).toContain('Successfully executed');
  });

  it('should handle color input', async () => {
    mockDependencies.convertColorImpl = vi.fn().mockReturnValue({ rgb_color: [255, 0, 0] });
    
    const tool = createToggleLightTool(mockRestConfig, mockDependencies);
    const result = await tool.invoke({ 
      entity: 'light.living_room', 
      color: { r: 255, g: 0, b: 0 } 
    }, {} as any);
    
    expect(result).toContain('Successfully executed');
    expect(mockDependencies.convertColorImpl).toHaveBeenCalled();
  });

});

describe('toggleLightToolFactory', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return a factory function', () => {
    const factory = toggleLightToolFactory;
    
    expect(typeof factory).toBe('function');
  });

  it('should return ToolFactoryResult with ok=true when configured', async () => {
    const result = await toggleLightToolFactory();

    expect(result.ok).toBe(true);
    expect((result as { ok: true; tool: any }).tool).toBeDefined();
    expect((result as { ok: true; tool: any }).tool.name).toBe('toggle_home_assistant_light');
  });
});

describe('ToggleLightDependencies type', () => {
  it('should accept valid dependencies object', () => {
    const deps: ToggleLightDependencies = {
      getEntityStateImpl: vi.fn(),
      convertColorImpl: vi.fn(),
      recordServiceCallImpl: vi.fn(),
    };
    
    expect(deps.getEntityStateImpl).toBeDefined();
    expect(deps.convertColorImpl).toBeDefined();
    expect(deps.recordServiceCallImpl).toBeDefined();
  });

  it('should allow optional callHAServiceWebSocketImpl', () => {
    const deps: ToggleLightDependencies = {
      getEntityStateImpl: vi.fn(),
      convertColorImpl: vi.fn(),
      recordServiceCallImpl: vi.fn(),
      callHAServiceWebSocketImpl: undefined,
    };
    
    expect(deps.callHAServiceWebSocketImpl).toBeUndefined();
  });
});
