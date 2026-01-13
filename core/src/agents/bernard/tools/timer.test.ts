/**
 * Tests for the timer tool with dependency injection support.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateTimerParams,
  createTimerTool,
  createTimerToolFactory,
  createTimerToolInstance,
  type TimerValidationResult,
  type TimerDependencies,
} from './timer.tool';

describe('validateTimerParams', () => {
  describe('valid inputs', () => {
    it('should return ok=true for valid timer params', () => {
      const result = validateTimerParams({
        name: 'test timer',
        time: 60,
        message: 'Test message',
      });
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.name).toBe('test timer');
        expect(result.time).toBe(60);
        expect(result.message).toBe('Test message');
      }
    });

    it('should trim whitespace from name', () => {
      const result = validateTimerParams({
        name: '  test timer  ',
        time: 60,
        message: 'Test message',
      });
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.name).toBe('test timer');
      }
    });

    it('should accept maximum time value (3600 seconds)', () => {
      const result = validateTimerParams({
        name: 'max timer',
        time: 3600,
        message: 'Max duration message',
      });
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.time).toBe(3600);
      }
    });

    it('should accept minimum time value (1 second)', () => {
      const result = validateTimerParams({
        name: 'min timer',
        time: 1,
        message: 'Min duration message',
      });
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.time).toBe(1);
      }
    });

    it('should accept large but valid time values', () => {
      const result = validateTimerParams({
        name: 'large timer',
        time: 3599,
        message: 'Almost max duration',
      });
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.time).toBe(3599);
      }
    });
  });

  describe('invalid name', () => {
    it('should return ok=false for empty name', () => {
      const result = validateTimerParams({
        name: '',
        time: 60,
        message: 'Test message',
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('name parameter is required');
      }
    });

    it('should return ok=false for whitespace-only name', () => {
      const result = validateTimerParams({
        name: '   ',
        time: 60,
        message: 'Test message',
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('name parameter is required');
      }
    });

    it('should return ok=false for null name', () => {
      const result = validateTimerParams({
        name: null as unknown as string,
        time: 60,
        message: 'Test message',
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('name parameter is required');
      }
    });

    it('should return ok=false for undefined name', () => {
      const result = validateTimerParams({
        name: undefined as unknown as string,
        time: 60,
        message: 'Test message',
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('name parameter is required');
      }
    });

    it('should return ok=false for non-string name', () => {
      const result = validateTimerParams({
        name: 123 as unknown as string,
        time: 60,
        message: 'Test message',
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('name parameter is required');
      }
    });
  });

  describe('invalid time', () => {
    it('should return ok=false for zero time', () => {
      const result = validateTimerParams({
        name: 'timer',
        time: 0,
        message: 'Test message',
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('time parameter is required');
        expect(result.reason).toContain('positive number');
      }
    });

    it('should return ok=false for negative time', () => {
      const result = validateTimerParams({
        name: 'timer',
        time: -10,
        message: 'Test message',
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('time parameter is required');
        expect(result.reason).toContain('positive number');
      }
    });

    it('should return ok=false for time exceeding 3600', () => {
      const result = validateTimerParams({
        name: 'timer',
        time: 3601,
        message: 'Test message',
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('3600');
      }
    });

    it('should return ok=false for very large time', () => {
      const result = validateTimerParams({
        name: 'timer',
        time: 10000,
        message: 'Test message',
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('3600');
      }
    });

    it('should return ok=false for non-number time', () => {
      const result = validateTimerParams({
        name: 'timer',
        time: '60' as unknown as number,
        message: 'Test message',
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('time parameter is required');
      }
    });

    it('should return ok=false for null time', () => {
      const result = validateTimerParams({
        name: 'timer',
        time: null as unknown as number,
        message: 'Test message',
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('time parameter is required');
      }
    });

    it('should return ok=false for undefined time', () => {
      const result = validateTimerParams({
        name: 'timer',
        time: undefined as unknown as number,
        message: 'Test message',
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('time parameter is required');
      }
    });
  });

  describe('invalid message', () => {
    it('should return ok=false for missing message', () => {
      const result = validateTimerParams({
        name: 'timer',
        time: 60,
        message: undefined,
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('message parameter is required');
      }
    });

    it('should return ok=false for null message', () => {
      const result = validateTimerParams({
        name: 'timer',
        time: 60,
        message: null as unknown as string,
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('message parameter is required');
      }
    });

    it('should return ok=false for non-string message', () => {
      const result = validateTimerParams({
        name: 'timer',
        time: 60,
        message: 123 as unknown as string,
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('message parameter is required');
      }
    });

    it('should return ok=false for empty message', () => {
      const result = validateTimerParams({
        name: 'timer',
        time: 60,
        message: '',
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('message parameter is required');
      }
    });
  });

  describe('combined validation errors', () => {
    it('should return first error encountered for name', () => {
      const result = validateTimerParams({
        name: '',
        time: 0,
        message: '',
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('name parameter');
      }
    });

    it('should validate name before time', () => {
      const result = validateTimerParams({
        name: 'valid',
        time: 0,
        message: 'valid',
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('time');
      }
    });

    it('should validate name and time before message', () => {
      const result = validateTimerParams({
        name: 'valid',
        time: 60,
        message: '',
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('message');
      }
    });
  });
});

describe('createTimerTool', () => {
  let mockDependencies: TimerDependencies;

  beforeEach(() => {
    mockDependencies = {
      createTask: vi.fn().mockResolvedValue({ 
        taskId: 'task-123', 
        taskName: 'timer' 
      }),
    };
  });

  it('should create a timer tool with dependencies', () => {
    const tool = createTimerTool(mockDependencies);
    
    expect(tool).toBeDefined();
    expect(tool.name).toBe('set_timer');
    expect(typeof tool.description).toBe('string');
    expect(tool.schema).toBeDefined();
  });

  it('should return error for invalid params', async () => {
    const tool = createTimerTool(mockDependencies);
    
    const result = await tool.invoke({ name: '', time: 60, message: 'test' });
    
    expect(result).toContain('Error');
    expect(result).toContain('name parameter is required');
  });

  it('should return error when dependencies not provided', async () => {
    const tool = createTimerTool(undefined);
    
    const result = await tool.invoke({ name: 'test', time: 60, message: 'test' });
    
    expect(result).toContain('Error');
    expect(result).toContain('Task context not available');
  });

  it('should call createTask with correct parameters', async () => {
    const tool = createTimerTool(mockDependencies);
    
    await tool.invoke({ name: 'my timer', time: 120, message: 'Reminder' });
    
    expect(mockDependencies.createTask).toHaveBeenCalledWith(
      'timer',
      { name: 'my timer', time: 120, message: 'Reminder' },
      {}
    );
  });

  it('should return success message with task ID', async () => {
    const tool = createTimerTool(mockDependencies);
    
    const result = await tool.invoke({ name: 'test timer', time: 60, message: 'Hello' });
    
    expect(result).toContain('test timer');
    expect(result).toContain('task-123');
    expect(result).toContain('60 seconds');
    expect(result).toContain('Hello');
  });

  it('should handle createTask error', async () => {
    mockDependencies.createTask = vi.fn().mockRejectedValue(new Error('Task creation failed'));
    
    const tool = createTimerTool(mockDependencies);
    
    const result = await tool.invoke({ name: 'test timer', time: 60, message: 'Hello' });
    
    expect(result).toContain('Error');
    expect(result).toContain('Task creation failed');
  });

  it('should handle non-Error exceptions', async () => {
    mockDependencies.createTask = vi.fn().mockRejectedValue('Unknown error');
    
    const tool = createTimerTool(mockDependencies);
    
    const result = await tool.invoke({ name: 'test timer', time: 60, message: 'Hello' });
    
    expect(result).toContain('Error');
    expect(result).toContain('Unknown error');
  });
});

describe('createTimerToolFactory', () => {
  it('should return a factory function', () => {
    const factory = createTimerToolFactory();
    
    expect(typeof factory).toBe('function');
  });

  it('should return ToolFactory with missing dependencies error', async () => {
    const factory = createTimerToolFactory();
    const tool = factory();
    
    const result = await tool.invoke({ name: 'test', time: 60, message: 'test' });
    
    expect(result).toContain('Error');
    expect(result).toContain('createTask not configured');
  });

  it('should create tool with overridden dependencies', async () => {
    const mockCreateTask = vi.fn().mockResolvedValue({ 
      taskId: 'custom-task', 
      taskName: 'timer' 
    });
    
    const factory = createTimerToolFactory({
      createTask: mockCreateTask,
    });
    const tool = factory();
    
    await tool.invoke({ name: 'test', time: 60, message: 'test' });
    
    expect(mockCreateTask).toHaveBeenCalled();
  });
});

describe('createTimerToolInstance', () => {
  it('should create tool with task context', async () => {
    const taskContext = {
      conversationId: 'conv-123',
      userId: 'user-456',
      createTask: vi.fn().mockResolvedValue({ taskId: 'new-task', taskName: 'timer' }),
    };
    
    const tool = createTimerToolInstance(taskContext);
    
    await tool.invoke({ name: 'instance timer', time: 90, message: 'Instance message' });
    
    expect(taskContext.createTask).toHaveBeenCalledWith(
      'timer',
      { name: 'instance timer', time: 90, message: 'Instance message' },
      {}
    );
  });

  it('should use provided createTask function', async () => {
    const customCreateTask = vi.fn().mockResolvedValue({ taskId: 'custom', taskName: 'timer' });
    
    const tool = createTimerToolInstance({
      conversationId: 'conv',
      userId: 'user',
      createTask: customCreateTask,
    });
    
    await tool.invoke({ name: 'test', time: 60, message: 'test' });
    
    expect(customCreateTask).toHaveBeenCalled();
  });
});

describe('TimerValidationResult type discrimination', () => {
  it('should correctly discriminate ok=true case', () => {
    const result: TimerValidationResult = validateTimerParams({
      name: 'test',
      time: 60,
      message: 'test',
    });
    
    if (result.ok) {
      expect(result.name).toBe('test');
      expect(result.time).toBe(60);
      expect(result.message).toBe('test');
    } else {
      throw new Error('Expected ok=true');
    }
  });

  it('should correctly discriminate ok=false case', () => {
    const result: TimerValidationResult = validateTimerParams({
      name: '',
      time: 60,
      message: 'test',
    });
    
    if (!result.ok) {
      expect(result.reason).toBeDefined();
      expect(result).not.toHaveProperty('name');
      expect(result).not.toHaveProperty('time');
    } else {
      throw new Error('Expected ok=false');
    }
  });
});
