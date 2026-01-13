/**
 * Tests for Bernard agent update messages.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getReadingUpdate,
  getSearchingUpdate,
  getTransformingUpdate,
  getProcessingUpdate,
  getCreationUpdate,
  setUpdateOverrides,
  clearUpdateOverrides,
} from './updates';

describe('getReadingUpdate', () => {
  beforeEach(() => {
    clearUpdateOverrides();
  });

  it('should return a string', () => {
    const result = getReadingUpdate();
    expect(typeof result).toBe('string');
  });

  it('should not return empty string when no overrides set', () => {
    const result = getReadingUpdate();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should return values from override list when set', () => {
    setUpdateOverrides(['Custom Reading 1', 'Custom Reading 2']);

    const result1 = getReadingUpdate();
    const result2 = getReadingUpdate();

    expect(result1).toBe('Custom Reading 1');
    expect(result2).toBe('Custom Reading 2');
  });

  it('should cycle through override list', () => {
    setUpdateOverrides(['First', 'Second', 'Third']);

    const result1 = getReadingUpdate();
    const result2 = getReadingUpdate();
    const result3 = getReadingUpdate();
    const result4 = getReadingUpdate();

    expect(result1).toBe('First');
    expect(result2).toBe('Second');
    expect(result3).toBe('Third');
    expect(result4).toBe('First');
  });
});

describe('getSearchingUpdate', () => {
  beforeEach(() => {
    clearUpdateOverrides();
  });

  it('should return a string', () => {
    const result = getSearchingUpdate();
    expect(typeof result).toBe('string');
  });

  it('should not return empty string when no overrides set', () => {
    const result = getSearchingUpdate();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should return values from override list when set', () => {
    setUpdateOverrides(['Custom Search 1', 'Custom Search 2']);

    const result1 = getSearchingUpdate();
    const result2 = getSearchingUpdate();

    expect(result1).toBe('Custom Search 1');
    expect(result2).toBe('Custom Search 2');
  });
});

describe('getTransformingUpdate', () => {
  beforeEach(() => {
    clearUpdateOverrides();
  });

  it('should return a string', () => {
    const result = getTransformingUpdate();
    expect(typeof result).toBe('string');
  });

  it('should not return empty string when no overrides set', () => {
    const result = getTransformingUpdate();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should return values from override list when set', () => {
    setUpdateOverrides(['Custom Transform 1', 'Custom Transform 2']);

    const result1 = getTransformingUpdate();
    const result2 = getTransformingUpdate();

    expect(result1).toBe('Custom Transform 1');
    expect(result2).toBe('Custom Transform 2');
  });
});

describe('getProcessingUpdate', () => {
  beforeEach(() => {
    clearUpdateOverrides();
  });

  it('should return a string', () => {
    const result = getProcessingUpdate();
    expect(typeof result).toBe('string');
  });

  it('should not return empty string when no overrides set', () => {
    const result = getProcessingUpdate();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should return values from override list when set', () => {
    setUpdateOverrides(['Custom Process 1', 'Custom Process 2']);

    const result1 = getProcessingUpdate();
    const result2 = getProcessingUpdate();

    expect(result1).toBe('Custom Process 1');
    expect(result2).toBe('Custom Process 2');
  });
});

describe('getCreationUpdate', () => {
  beforeEach(() => {
    clearUpdateOverrides();
  });

  it('should return a string', () => {
    const result = getCreationUpdate();
    expect(typeof result).toBe('string');
  });

  it('should not return empty string when no overrides set', () => {
    const result = getCreationUpdate();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should return values from override list when set', () => {
    setUpdateOverrides(['Custom Create 1', 'Custom Create 2']);

    const result1 = getCreationUpdate();
    const result2 = getCreationUpdate();

    expect(result1).toBe('Custom Create 1');
    expect(result2).toBe('Custom Create 2');
  });
});

describe('setUpdateOverrides', () => {
  beforeEach(() => {
    clearUpdateOverrides();
  });

  it('should set override list', () => {
    setUpdateOverrides(['A', 'B', 'C']);

    const result1 = getReadingUpdate();
    const result2 = getSearchingUpdate();

    expect(result1).toBe('A');
    expect(result2).toBe('B');
  });

  it('should reset index when setting new overrides', () => {
    setUpdateOverrides(['First', 'Second']);
    getReadingUpdate();
    getReadingUpdate();

    setUpdateOverrides(['NewFirst']);

    expect(getReadingUpdate()).toBe('NewFirst');
    expect(getSearchingUpdate()).toBe('NewFirst');
  });

  it('should accept empty array', () => {
    setUpdateOverrides([]);

    const result = getReadingUpdate();
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('clearUpdateOverrides', () => {
  beforeEach(() => {
    clearUpdateOverrides();
  });

  it('should restore random behavior', () => {
    setUpdateOverrides(['Override1', 'Override2']);
    getReadingUpdate();
    getSearchingUpdate();

    clearUpdateOverrides();

    const result = getReadingUpdate();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should reset index', () => {
    setUpdateOverrides(['A', 'B', 'C']);
    getReadingUpdate();
    getReadingUpdate();
    getReadingUpdate();

    clearUpdateOverrides();
    setUpdateOverrides(['X']);

    expect(getReadingUpdate()).toBe('X');
  });

  it('should allow multiple functions to work independently after clear', () => {
    setUpdateOverrides(['Reading1', 'Reading2']);
    getReadingUpdate();

    clearUpdateOverrides();

    const reading = getReadingUpdate();
    const searching = getSearchingUpdate();

    expect(reading.length).toBeGreaterThan(0);
    expect(searching.length).toBeGreaterThan(0);
  });
});

describe('update override interaction', () => {
  beforeEach(() => {
    clearUpdateOverrides();
  });

  it('should work across different update types', () => {
    setUpdateOverrides(['Reading', 'Searching', 'Transforming']);

    expect(getReadingUpdate()).toBe('Reading');
    expect(getSearchingUpdate()).toBe('Searching');
    expect(getTransformingUpdate()).toBe('Transforming');
    expect(getProcessingUpdate()).toBe('Reading');
  });

  it('should maintain override index across different update types', () => {
    setUpdateOverrides(['A', 'B', 'C']);

    const r1 = getReadingUpdate();
    const s1 = getSearchingUpdate();
    const r2 = getReadingUpdate();

    expect(r1).toBe('A');
    expect(s1).toBe('B');
    expect(r2).toBe('C');
  });

  it('should handle single override across all types', () => {
    setUpdateOverrides(['Same']);

    expect(getReadingUpdate()).toBe('Same');
    expect(getSearchingUpdate()).toBe('Same');
    expect(getTransformingUpdate()).toBe('Same');
    expect(getProcessingUpdate()).toBe('Same');
    expect(getCreationUpdate()).toBe('Same');
  });
});
