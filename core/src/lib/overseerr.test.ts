import { describe, it, expect } from 'vitest';
import { OverseerrClient, createOverseerrClient, isValidOverseerrConfig, getOverseerrClient } from './overseerr';
import * as types from './overseerr/types';

describe('overseerr barrel export', () => {
  it('should export OverseerrClient class', () => {
    expect(OverseerrClient).toBeDefined();
    expect(typeof OverseerrClient).toBe('function');
  });

  it('should export createOverseerrClient function', () => {
    expect(createOverseerrClient).toBeDefined();
    expect(typeof createOverseerrClient).toBe('function');
  });

  it('should export validation functions', () => {
    expect(isValidOverseerrConfig).toBeDefined();
    expect(typeof isValidOverseerrConfig).toBe('function');
    expect(getOverseerrClient).toBeDefined();
    expect(typeof getOverseerrClient).toBe('function');
  });

  it('should re-export types', () => {
    expect(types).toBeDefined();
    expect(typeof types).toBe('object');
    // Check for some expected type exports
    expect('FindMediaStatusParams' in types || 'REQUEST_STATUS' in types || 'ISSUE_TYPES' in types).toBe(true);
  });
});

describe('overseerr types export', () => {
  it('should export types module with expected exports', () => {
    expect(types).toBeDefined();
    expect(typeof types).toBe('object');
  });
});
