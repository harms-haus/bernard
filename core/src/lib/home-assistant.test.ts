import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('home-assistant barrel export', () => {
  const indexPath = path.join(__dirname, 'home-assistant', 'index.ts');
  let indexContent: string;

  beforeEach(() => {
    indexContent = fs.readFileSync(indexPath, 'utf-8');
  });

  it('should export websocket client functions', () => {
    expect(indexContent).toContain('getHAConnection');
    expect(indexContent).toContain('closeHAConnection');
    expect(indexContent).toContain('closeAllHAConnections');
  });

  it('should export REST client functions', () => {
    expect(indexContent).toContain('fetchHAEntities');
    expect(indexContent).toContain('callHAService');
  });

  it('should export entity utilities', () => {
    expect(indexContent).toContain('HomeAssistantEntity');
    expect(indexContent).toContain('getEntityState');
    expect(indexContent).toContain('extractHomeAssistantContext');
    expect(indexContent).toContain('findEntity');
  });

  it('should export context manager', () => {
    expect(indexContent).toContain('HomeAssistantContextManager');
  });

  it('should export color utilities', () => {
    expect(indexContent).toContain('getColorByName');
    expect(indexContent).toContain('getColorNames');
    expect(indexContent).toContain('detectColorFormat');
  });

  it('should export verification function', () => {
    expect(indexContent).toContain('verifyHomeAssistantConfigured');
  });
});

describe('home-assistant/websocket-client.ts', () => {
  const clientPath = path.join(__dirname, 'home-assistant', 'websocket-client.ts');
  let clientContent: string;

  beforeEach(() => {
    clientContent = fs.readFileSync(clientPath, 'utf-8');
  });

  it('should export getHAConnection function', () => {
    expect(clientContent).toContain('export async function getHAConnection');
  });

  it('should export closeHAConnection function', () => {
    expect(clientContent).toContain('export function closeHAConnection');
  });

  it('should export closeAllHAConnections function', () => {
    expect(clientContent).toContain('export function closeAllHAConnections');
  });

  it('should export getHAConnectionStats function', () => {
    expect(clientContent).toContain('export function getHAConnectionStats');
  });

  it('should define HAConnectionPool class', () => {
    expect(clientContent).toContain('class HAConnectionPool');
  });

  it('should use home-assistant-js-websocket', () => {
    expect(clientContent).toContain('home-assistant-js-websocket');
  });

  it('should handle connection events', () => {
    expect(clientContent).toContain("addEventListener('disconnected'");
    expect(clientContent).toContain("addEventListener('ready'");
    expect(clientContent).toContain("addEventListener('reconnect-error'");
  });
});

describe('home-assistant/rest-client.ts', () => {
  const restPath = path.join(__dirname, 'home-assistant', 'rest-client.ts');
  let restContent: string;

  beforeEach(() => {
    restContent = fs.readFileSync(restPath, 'utf-8');
  });

  it('should export fetchHAEntities function', () => {
    expect(restContent).toContain('export async function fetchHAEntities');
  });

  it('should export callHAService function', () => {
    expect(restContent).toContain('export async function callHAService');
  });

  it('should define DEFAULT_TIMEOUT_MS', () => {
    expect(restContent).toContain('DEFAULT_TIMEOUT_MS = 10000');
  });

  it('should use /api/states endpoint', () => {
    expect(restContent).toContain('/api/states');
  });

  it('should use /api/services endpoint', () => {
    expect(restContent).toContain('/api/services/');
  });

  it('should handle authentication errors', () => {
    expect(restContent).toContain('401');
    expect(restContent).toContain('403');
  });
});

describe('home-assistant/context.ts', () => {
  const contextPath = path.join(__dirname, 'home-assistant', 'context.ts');
  let contextContent: string;

  beforeEach(() => {
    contextContent = fs.readFileSync(contextPath, 'utf-8');
  });

  it('should export HomeAssistantContextManager class', () => {
    expect(contextContent).toContain('export class HomeAssistantContextManager');
  });

  it('should define updateFromMessages method', () => {
    expect(contextContent).toContain('updateFromMessages(messages');
  });

  it('should define getContext method', () => {
    expect(contextContent).toContain('getContext()');
  });

  it('should define getEntities method', () => {
    expect(contextContent).toContain('getEntities()');
  });

  it('should define findEntity method', () => {
    expect(contextContent).toContain('findEntity(identifier');
  });

  it('should define hasContext method', () => {
    expect(contextContent).toContain('hasContext()');
  });

  it('should define getContextSummary method', () => {
    expect(contextContent).toContain('getContextSummary()');
  });
});

describe('home-assistant/entities.ts', () => {
  const entitiesPath = path.join(__dirname, 'home-assistant', 'entities.ts');
  let entitiesContent: string;

  beforeEach(() => {
    entitiesContent = fs.readFileSync(entitiesPath, 'utf-8');
  });

  it('should export HomeAssistantEntity interface', () => {
    expect(entitiesContent).toContain('export interface HomeAssistantEntity');
  });

  it('should export HAEntityState interface', () => {
    expect(entitiesContent).toContain('export interface HAEntityState');
  });

  it('should export HomeAssistantServiceCall interface', () => {
    expect(entitiesContent).toContain('export interface HomeAssistantServiceCall');
  });

  it('should export HomeAssistantContext interface', () => {
    expect(entitiesContent).toContain('export interface HomeAssistantContext');
  });

  it('should export EntityStateCache class', () => {
    expect(entitiesContent).toContain('export class EntityStateCache');
  });

  it('should export parseHomeAssistantEntities function', () => {
    expect(entitiesContent).toContain('export function parseHomeAssistantEntities');
  });

  it('should export extractHomeAssistantContext function', () => {
    expect(entitiesContent).toContain('export function extractHomeAssistantContext');
  });

  it('should export findEntity function', () => {
    expect(entitiesContent).toContain('export function findEntity');
  });

  it('should export validateEntityId function', () => {
    expect(entitiesContent).toContain('export function validateEntityId');
  });

  it('should export getDomainFromEntityId function', () => {
    expect(entitiesContent).toContain('export function getDomainFromEntityId');
  });

  it('should export formatEntitiesForDisplay function', () => {
    expect(entitiesContent).toContain('export function formatEntitiesForDisplay');
  });

  it('should export getEntityState function', () => {
    expect(entitiesContent).toContain('export async function getEntityState');
  });

  it('should export getEntityStateREST function', () => {
    expect(entitiesContent).toContain('export async function getEntityStateREST');
  });

  it('should export clearEntityStateCache function', () => {
    expect(entitiesContent).toContain('export function clearEntityStateCache');
  });
});

describe('home-assistant/verification.ts', () => {
  const verificationPath = path.join(__dirname, 'home-assistant', 'verification.ts');
  let verificationContent: string;

  beforeEach(() => {
    verificationContent = fs.readFileSync(verificationPath, 'utf-8');
  });

  it('should export verifyHomeAssistantConfigured function', () => {
    expect(verificationContent).toContain('export async function verifyHomeAssistantConfigured');
  });
});

describe('home-assistant/color-utils.ts', () => {
  const colorPath = path.join(__dirname, 'home-assistant', 'color-utils.ts');
  let colorContent: string;

  beforeEach(() => {
    colorContent = fs.readFileSync(colorPath, 'utf-8');
  });

  it('should export RGBColor interface', () => {
    expect(colorContent).toContain('export interface RGBColor');
  });

  it('should export RGBWColor interface', () => {
    expect(colorContent).toContain('export interface RGBWColor');
  });

  it('should export HSColor interface', () => {
    expect(colorContent).toContain('export interface HSColor');
  });

  it('should export XYColor interface', () => {
    expect(colorContent).toContain('export interface XYColor');
  });

  it('should export ColorTemp interface', () => {
    expect(colorContent).toContain('export interface ColorTemp');
  });

  it('should export ColorData interface', () => {
    expect(colorContent).toContain('export interface ColorData');
  });

  it('should export getColorByName function', () => {
    expect(colorContent).toContain('export function getColorByName');
  });

  it('should export getColorNames function', () => {
    expect(colorContent).toContain('export function getColorNames');
  });

  it('should export detectColorFormat function', () => {
    expect(colorContent).toContain('export function detectColorFormat');
  });

  it('should export rgbToHs function', () => {
    expect(colorContent).toContain('export function rgbToHs');
  });

  it('should export hsToRgb function', () => {
    expect(colorContent).toContain('export function hsToRgb');
  });

  it('should export rgbToXy function', () => {
    expect(colorContent).toContain('export function rgbToXy');
  });

  it('should export xyToRgb function', () => {
    expect(colorContent).toContain('export function xyToRgb');
  });

  it('should export kelvinToRgb function', () => {
    expect(colorContent).toContain('export function kelvinToRgb');
  });

  it('should export rgbToKelvin function', () => {
    expect(colorContent).toContain('export function rgbToKelvin');
  });

  it('should export convertColorToSupportedFormat function', () => {
    expect(colorContent).toContain('export function convertColorToSupportedFormat');
  });

  it('should export getExampleColorNames function', () => {
    expect(colorContent).toContain('export function getExampleColorNames');
  });

  it('should export getSupportedColorModes function', () => {
    expect(colorContent).toContain('export function getSupportedColorModes');
  });

  it('should export getCurrentBrightness function', () => {
    expect(colorContent).toContain('export function getCurrentBrightness');
  });

  it('should export getCurrentColorTemp function', () => {
    expect(colorContent).toContain('export function getCurrentColorTemp');
  });
});
