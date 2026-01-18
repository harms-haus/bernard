import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('plex barrel export', () => {
  const indexPath = path.join(__dirname, 'plex', 'index.ts');
  let indexContent: string;

  beforeEach(() => {
    indexContent = fs.readFileSync(indexPath, 'utf-8');
  });

  it('should export device mapping functions', () => {
    expect(indexContent).toContain('resolveDeviceConfig');
    expect(indexContent).toContain('resolveHAEntityId');
    expect(indexContent).toContain('getDeviceName');
    expect(indexContent).toContain('getSupportedLocations');
  });

  it('should export PlexConfig type', () => {
    expect(indexContent).toContain('PlexConfig');
  });

  it('should export media search functions', () => {
    expect(indexContent).toContain('searchPlexMedia');
    expect(indexContent).toContain('getPlexLibrarySections');
    expect(indexContent).toContain('rankSearchResults');
    expect(indexContent).toContain('searchPlexMediaWithRanking');
  });

  it('should export media search types', () => {
    expect(indexContent).toContain('PlexMediaItem');
    expect(indexContent).toContain('LibrarySection');
  });
});

describe('plex/client.ts', () => {
  const clientPath = path.join(__dirname, 'plex', 'client.ts');
  let clientContent: string;

  beforeEach(() => {
    clientContent = fs.readFileSync(clientPath, 'utf-8');
  });

  it('should export PlexConfig interface', () => {
    expect(clientContent).toContain('export interface PlexConfig');
  });

  it('should export createPlexClient function', () => {
    expect(clientContent).toContain('export function createPlexClient');
  });

  it('should export isValidPlexConfig function', () => {
    expect(clientContent).toContain('export function isValidPlexConfig');
  });

  it('should export parsePlexUrl function', () => {
    expect(clientContent).toContain('export function parsePlexUrl');
  });

  it('should use PlexAPI library', () => {
    expect(clientContent).toContain('plex-api');
  });

  it('isValidPlexConfig accepts valid config and rejects invalid ones', () => {
    // Import the function to test it directly
    const { isValidPlexConfig } = require('./client');
    
    // Valid config
    expect(isValidPlexConfig({ baseUrl: 'http://localhost:32400', token: 'abc123' })).toBe(true);
    expect(isValidPlexConfig({ baseUrl: 'https://plex.example.com', token: 'token' })).toBe(true);
    
    // Invalid configs
    expect(isValidPlexConfig({ baseUrl: '', token: 'abc' })).toBe(false);
    expect(isValidPlexConfig({ baseUrl: 'http://localhost:32400', token: '' })).toBe(false);
    expect(isValidPlexConfig({ baseUrl: 'not-a-url', token: 'abc' })).toBe(false);
    expect(isValidPlexConfig({})).toBe(false);
    expect(isValidPlexConfig(null as any)).toBe(false);
  });
});

describe('plex/device-mapping.ts', () => {
  const mappingPath = path.join(__dirname, 'plex', 'device-mapping.ts');
  let mappingContent: string;

  beforeEach(() => {
    mappingContent = fs.readFileSync(mappingPath, 'utf-8');
  });

  it('should export DeviceConfig interface', () => {
    expect(mappingContent).toContain('export interface DeviceConfig');
  });

  it('should export PlexDeviceMapping type', () => {
    expect(mappingContent).toContain('export type PlexDeviceMapping');
  });

  it('should export DEVICE_MAPPING constant', () => {
    expect(mappingContent).toContain('export const DEVICE_MAPPING');
  });

  it('should export getSupportedLocations function', () => {
    expect(mappingContent).toContain('export function getSupportedLocations');
  });

  it('should export resolveDeviceConfig function', () => {
    expect(mappingContent).toContain('export function resolveDeviceConfig');
  });

  it('should export resolveHAEntityId function', () => {
    expect(mappingContent).toContain('export function resolveHAEntityId');
  });

  it('should export resolvePlexClientId function', () => {
    expect(mappingContent).toContain('export function resolvePlexClientId');
  });

  it('should export getDeviceName function', () => {
    expect(mappingContent).toContain('export function getDeviceName');
  });
});

describe('plex/actions.ts', () => {
  const actionsPath = path.join(__dirname, 'plex', 'actions.ts');
  let actionsContent: string;

  beforeEach(() => {
    actionsContent = fs.readFileSync(actionsPath, 'utf-8');
  });

  it('should export HARestConfig type', () => {
    expect(actionsContent).toContain('export type HARestConfig');
  });

  it('should export HomeAssistantServiceCall type', () => {
    expect(actionsContent).toContain('export type HomeAssistantServiceCall');
  });

  it('should export callHAServiceWebSocket function', () => {
    expect(actionsContent).toContain('export async function callHAServiceWebSocket');
  });

  it('should export ensureTvOn function', () => {
    expect(actionsContent).toContain('export async function ensureTvOn');
  });

  it('should use child_process exec', () => {
    // Use regex to match any import pattern that includes exec from child_process
    const execImportPattern = /import\s+.*\bexec\b.*from\s+['"]child_process['"]/;
    expect(actionsContent).toMatch(execImportPattern);
  });

  it('should integrate with Home Assistant', () => {
    expect(actionsContent).toContain('getHAConnection');
    expect(actionsContent).toContain('getEntityState');
  });
});

describe('plex/media-search.ts', () => {
  const searchPath = path.join(__dirname, 'plex', 'media-search.ts');
  let searchContent: string;

  beforeEach(() => {
    searchContent = fs.readFileSync(searchPath, 'utf-8');
  });

  it('should export PlexMediaItem interface', () => {
    expect(searchContent).toContain('export interface PlexMediaItem');
  });

  it('should export SearchPlexMediaResult type', () => {
    expect(searchContent).toContain('export type SearchPlexMediaResult');
  });

  it('should export LibrarySection interface', () => {
    expect(searchContent).toContain('export interface LibrarySection');
  });

  it('should export searchPlexMedia function', () => {
    expect(searchContent).toContain('export async function searchPlexMedia');
  });

  it('should export getPlexLibrarySections function', () => {
    expect(searchContent).toContain('export async function getPlexLibrarySections');
  });

  it('should export getPlexItemMetadata function', () => {
    expect(searchContent).toContain('export async function getPlexItemMetadata');
  });

  it('should export rankSearchResults function', () => {
    expect(searchContent).toContain('export function rankSearchResults');
  });

  it('should use string similarity utility', () => {
    expect(searchContent).toContain('calculateStringSimilarityJaroWinkler');
  });
});
