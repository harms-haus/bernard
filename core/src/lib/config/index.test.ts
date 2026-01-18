import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('config barrel export', () => {
  const indexPath = path.join(__dirname, 'index.ts');
  let indexContent: string;

  beforeEach(() => {
    indexContent = fs.readFileSync(indexPath, 'utf-8');
  });

  it('should export from settingsCache', () => {
    expect(indexContent).toContain("from '@/lib/config/settingsCache'");
    expect(indexContent).toContain('clearSettingsCache');
    expect(indexContent).toContain('getSettings');
  });

  it('should export from settingsStore', () => {
    expect(indexContent).toContain("from '@/lib/config/settingsStore'");
    expect(indexContent).toContain('SettingsStore');
    expect(indexContent).toContain('defaultModels');
    expect(indexContent).toContain('defaultServices');
    expect(indexContent).toContain('defaultBackups');
    expect(indexContent).toContain('defaultOauth');
  });

  it('should export from models', () => {
    expect(indexContent).toContain("from '@/lib/config/models'");
    expect(indexContent).toContain('DEFAULT_MODEL_ID');
    expect(indexContent).toContain('getModelList');
    expect(indexContent).toContain('getPrimaryModel');
    expect(indexContent).toContain('resolveModel');
    expect(indexContent).toContain('resolveApiKey');
    expect(indexContent).toContain('resolveBaseUrl');
    expect(indexContent).toContain('splitModelAndProvider');
  });
});

describe('config exports verification', () => {
  it('settingsCache.ts should export getSettings and clearSettingsCache', () => {
    const cachePath = path.join(__dirname, 'settingsCache.ts');
    const cacheContent = fs.readFileSync(cachePath, 'utf-8');
    
    expect(cacheContent).toContain('export async function getSettings');
    expect(cacheContent).toContain('export function clearSettingsCache');
  });

  it('settingsStore.ts should export SettingsStoreCore and default factories', () => {
    const storePath = path.join(__dirname, 'settingsStore.ts');
    const storeContent = fs.readFileSync(storePath, 'utf-8');
    
    expect(storeContent).toContain('export class SettingsStoreCore');
    expect(storeContent).toContain('export function getSettingsStore');
    expect(storeContent).toContain('export async function initializeSettingsStore');
    expect(storeContent).toContain('export function defaultModels');
    expect(storeContent).toContain('export function defaultServices');
    expect(storeContent).toContain('export function defaultBackups');
    expect(storeContent).toContain('export function defaultOauth');
  });

  it('models.ts should export model resolution functions', () => {
    const modelsPath = path.join(__dirname, 'models.ts');
    const modelsContent = fs.readFileSync(modelsPath, 'utf-8');
    
    expect(modelsContent).toContain('export async function getModelList');
    expect(modelsContent).toContain('export async function getPrimaryModel');
    expect(modelsContent).toContain('export async function resolveModel');
    expect(modelsContent).toContain('export function resolveApiKey');
    expect(modelsContent).toContain('export function resolveBaseUrl');
    expect(modelsContent).toContain('export function splitModelAndProvider');
  });

  it('appSettings.ts should export SettingsManagerCore and schemas', () => {
    const appPath = path.join(__dirname, 'appSettings.ts');
    const appContent = fs.readFileSync(appPath, 'utf-8');
    
    expect(appContent).toContain('export class SettingsManagerCore');
    expect(appContent).toContain('export const ProviderSchema');
    expect(appContent).toContain('export const ServicesSettingsSchema');
    expect(appContent).toContain('export function getSettingsManager');
  });

  it('env.ts should export env validation', () => {
    const envPath = path.join(__dirname, 'env.ts');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    
    expect(envContent).toContain('export const env');
    expect(envContent).toContain('export function createEnv');
  });
});
