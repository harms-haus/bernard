import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('home-assistant barrel export', () => {
  const indexPath = path.join(__dirname, 'index.ts');
  let indexContent: string;

  beforeEach(() => {
    indexContent = fs.readFileSync(indexPath, 'utf-8');
  });

  it('should export WebSocket client functions', () => {
    expect(indexContent).toContain('getHAConnection');
    expect(indexContent).toContain('closeHAConnection');
    expect(indexContent).toContain('closeAllHAConnections');
    expect(indexContent).toContain('getHAConnectionStats');
  });

  it('should export REST client functions', () => {
    expect(indexContent).toContain('fetchHAEntities');
    expect(indexContent).toContain('callHAService');
  });

  it('should export entity utilities', () => {
    expect(indexContent).toContain('getEntityState');
    expect(indexContent).toContain('getEntityStateREST');
    expect(indexContent).toContain('getMultipleEntityStates');
    expect(indexContent).toContain('clearEntityStateCache');
  });

  it('should export entity parsing functions', () => {
    expect(indexContent).toContain('extractHomeAssistantContext');
    expect(indexContent).toContain('getDomainFromEntityId');
    expect(indexContent).toContain('validateEntityId');
    expect(indexContent).toContain('findEntity');
    expect(indexContent).toContain('formatEntitiesForDisplay');
  });

  it('should export color utilities', () => {
    expect(indexContent).toContain('getColorByName');
    expect(indexContent).toContain('getColorNames');
    expect(indexContent).toContain('detectColorFormat');
    expect(indexContent).toContain('convertColorToSupportedFormat');
    expect(indexContent).toContain('getExampleColorNames');
  });

  it('should export context manager', () => {
    expect(indexContent).toContain('HomeAssistantContextManager');
  });
});

describe('home-assistant exports verification', () => {
  it('websocket-client.ts should export connection functions', () => {
    const wsPath = path.join(__dirname, 'websocket-client.ts');
    const wsContent = fs.readFileSync(wsPath, 'utf-8');
    
    expect(wsContent).toContain('export async function getHAConnection');
    expect(wsContent).toContain('export function closeHAConnection');
    expect(wsContent).toContain('export function closeAllHAConnections');
    expect(wsContent).toContain('export function getHAConnectionStats');
  });

  it('rest-client.ts should export REST functions', () => {
    const restPath = path.join(__dirname, 'rest-client.ts');
    const restContent = fs.readFileSync(restPath, 'utf-8');
    
    expect(restContent).toContain('export async function fetchHAEntities');
    expect(restContent).toContain('export async function callHAService');
  });

  it('entities.ts should export entity types and utilities', () => {
    const entitiesPath = path.join(__dirname, 'entities.ts');
    const entitiesContent = fs.readFileSync(entitiesPath, 'utf-8');
    
    expect(entitiesContent).toContain('export interface HomeAssistantEntity');
    expect(entitiesContent).toContain('export function parseHomeAssistantEntities');
    expect(entitiesContent).toContain('export function findEntity');
    expect(entitiesContent).toContain('export function validateEntityId');
    expect(entitiesContent).toContain('export function getDomainFromEntityId');
    expect(entitiesContent).toContain('export function clearEntityStateCache');
  });

  it('color-utils.ts should export color conversions', () => {
    const colorPath = path.join(__dirname, 'color-utils.ts');
    const colorContent = fs.readFileSync(colorPath, 'utf-8');
    
    expect(colorContent).toContain('export function rgbToHs');
    expect(colorContent).toContain('export function hsToRgb');
    expect(colorContent).toContain('export function getColorByName');
    expect(colorContent).toContain('export function detectColorFormat');
    expect(colorContent).toContain('export function getColorNames');
  });

  it('context.ts should export context manager', () => {
    const contextPath = path.join(__dirname, 'context.ts');
    const contextContent = fs.readFileSync(contextPath, 'utf-8');
    
    expect(contextContent).toContain('export class HomeAssistantContextManager');
  });

  it('verification.ts should export verification function', () => {
    const verPath = path.join(__dirname, 'verification.ts');
    const verContent = fs.readFileSync(verPath, 'utf-8');
    
    expect(verContent).toContain('export async function verifyHomeAssistantConfigured');
  });
});
