import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('plex barrel export', () => {
  const indexPath = path.join(__dirname, 'index.ts');
  let indexContent: string;

  beforeEach(() => {
    indexContent = fs.readFileSync(indexPath, 'utf-8');
  });

  it('should export device mapping functions', () => {
    expect(indexContent).toContain('resolveDeviceConfig');
    expect(indexContent).toContain('resolveHAEntityId');
    expect(indexContent).toContain('resolveAdbAddress');
    expect(indexContent).toContain('getDeviceName');
    expect(indexContent).toContain('getSupportedLocations');
  });

  it('should export client functions', () => {
    expect(indexContent).toContain('PlexConfig');
  });

  it('should export media search functions', () => {
    expect(indexContent).toContain('searchPlexMedia');
    expect(indexContent).toContain('searchPlexMediaWithRanking');
    expect(indexContent).toContain('getPlexLibrarySections');
    expect(indexContent).toContain('getPlexItemMetadata');
  });
});

describe('plex exports verification', () => {
  it('client.ts should export createPlexClient', () => {
    const clientPath = path.join(__dirname, 'client.ts');
    const clientContent = fs.readFileSync(clientPath, 'utf-8');
    
    expect(clientContent).toContain('export interface PlexConfig');
    expect(clientContent).toContain('export function createPlexClient');
    expect(clientContent).toContain('export function isValidPlexConfig');
    expect(clientContent).toContain('export function parsePlexUrl');
  });

  it('device-mapping.ts should export device functions', () => {
    const dmPath = path.join(__dirname, 'device-mapping.ts');
    const dmContent = fs.readFileSync(dmPath, 'utf-8');
    
    expect(dmContent).toContain('export interface DeviceConfig');
    expect(dmContent).toContain('export function resolveDeviceConfig');
    expect(dmContent).toContain('export function getSupportedLocations');
  });

  it('actions.ts should export playback actions', () => {
    const actionsPath = path.join(__dirname, 'actions.ts');
    const actionsContent = fs.readFileSync(actionsPath, 'utf-8');
    
    expect(actionsContent).toContain('export async function ensureTvOn');
    expect(actionsContent).toContain('export async function ensurePlexActive');
    expect(actionsContent).toContain('export async function playMediaOnPlex');
  });

  it('media-search.ts should export search functions', () => {
    const msPath = path.join(__dirname, 'media-search.ts');
    const msContent = fs.readFileSync(msPath, 'utf-8');
    
    expect(msContent).toContain('export async function searchPlexMedia');
    expect(msContent).toContain('export function rankSearchResults');
    expect(msContent).toContain('export function calculatePlexMediaProgress');
  });
});
