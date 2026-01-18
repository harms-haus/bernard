import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('weather barrel export', () => {
  it('should export functions and types from weather module', () => {
    // Import the actual module to verify exports exist at runtime
    const weather = require('./weather');
    
    expect(typeof weather.geocodeLocation).toBe('function');
    expect(typeof weather.buildGeocodeUrl).toBe('function');
    expect(typeof weather.getForecastApiUrl).toBe('function');
    expect(typeof weather.getHistoricalApiUrl).toBe('function');
    // Verify UnitChoice type is used by testing a function that returns it
    expect(typeof weather.resolveUnits).toBe('function');
    expect(typeof weather.getImperialUnits).toBe('function');
    const unitChoice = weather.getImperialUnits();
    expect(unitChoice).toBeDefined();
    expect(unitChoice.temperatureUnit).toBe('fahrenheit');
  });
});

describe('weather/geocoding.ts', () => {
  const geocodingPath = path.join(__dirname, 'weather', 'geocoding.ts');
  let geocodingContent: string;

  beforeEach(() => {
    geocodingContent = fs.readFileSync(geocodingPath, 'utf-8');
  });

  it('should export GeocodeConfig type', () => {
    expect(geocodingContent).toContain('export type GeocodeConfig');
  });

  it('should export GeocodeResult type', () => {
    expect(geocodingContent).toContain('export type GeocodeResult');
  });

  it('should export loadGeocodeConfig function', () => {
    expect(geocodingContent).toContain('export async function loadGeocodeConfig');
  });

  it('should export buildGeocodeUrl function', () => {
    expect(geocodingContent).toContain('export function buildGeocodeUrl');
  });

  it('should export geocodeLocation function', () => {
    expect(geocodingContent).toContain('export async function geocodeLocation');
  });

  it('should define DEFAULT_GEOCODE_API_URL', () => {
    expect(geocodingContent).toContain('DEFAULT_GEOCODE_API_URL');
    expect(geocodingContent).toContain('nominatim.openstreetmap.org');
  });
});

describe('weather/common.ts', () => {
  const commonPath = path.join(__dirname, 'weather', 'common.ts');
  let commonContent: string;

  beforeEach(() => {
    commonContent = fs.readFileSync(commonPath, 'utf-8');
  });

  it('should export DEFAULT_WEATHER_TIMEOUT_MS', () => {
    expect(commonContent).toContain('export const DEFAULT_WEATHER_TIMEOUT_MS');
  });

  it('should export getForecastApiUrl function', () => {
    expect(commonContent).toContain('export async function getForecastApiUrl');
  });

  it('should export getHistoricalApiUrl function', () => {
    expect(commonContent).toContain('export async function getHistoricalApiUrl');
  });

  it('should export getWeatherTimeoutMs function', () => {
    expect(commonContent).toContain('export async function getWeatherTimeoutMs');
  });

  it('should export UnitChoice type', () => {
    expect(commonContent).toContain('export type UnitChoice');
  });

  it('should export DailyWeather type', () => {
    expect(commonContent).toContain('export type DailyWeather');
  });

  it('should define DEFAULT_FORECAST_API_URL', () => {
    expect(commonContent).toContain('DEFAULT_FORECAST_API_URL');
    expect(commonContent).toContain('open-meteo.com');
  });

  it('should define DEFAULT_HISTORICAL_API_URL', () => {
    expect(commonContent).toContain('DEFAULT_HISTORICAL_API_URL');
    expect(commonContent).toContain('archive-api.open-meteo.com');
  });
});

describe('config/settingsStore.ts', () => {
  const storePath = path.join(__dirname, 'config', 'settingsStore.ts');
  let storeContent: string;

  beforeEach(() => {
    storeContent = fs.readFileSync(storePath, 'utf-8');
  });

  it('should export RedisClient interface', () => {
    expect(storeContent).toContain('export interface RedisClient');
  });

  it('should export SettingsStoreCore class', () => {
    expect(storeContent).toContain('export class SettingsStoreCore');
  });

  it('should define getModels method as async function', async () => {
    const { SettingsStoreCore } = require('./config/settingsStore');
    const instance = new SettingsStoreCore();
    expect(typeof instance.getModels).toBe('function');
    // Check it's async by verifying it returns a Promise
    await expect(instance.getModels()).resolves.toBeDefined();
  });

  it('should define setModels method as async function', async () => {
    const { SettingsStoreCore } = require('./config/settingsStore');
    const instance = new SettingsStoreCore();
    expect(typeof instance.setModels).toBe('function');
    // Check it's async by verifying it returns a Promise
    await expect(instance.setModels({} as any)).resolves.toBeDefined();
  });

  it('should define getProviders method as async function', async () => {
    const { SettingsStoreCore } = require('./config/settingsStore');
    const instance = new SettingsStoreCore();
    expect(typeof instance.getProviders).toBe('function');
    // Check it's async by verifying it returns a Promise
    await expect(instance.getProviders()).resolves.toBeDefined();
  });

  it('should define getServices method as async function', async () => {
    const { SettingsStoreCore } = require('./config/settingsStore');
    const instance = new SettingsStoreCore();
    expect(typeof instance.getServices).toBe('function');
    // Check it's async by verifying it returns a Promise
    await expect(instance.getServices()).resolves.toBeDefined();
  });

  it('should use Redis import', () => {
    expect(storeContent).toContain('ioredis');
  });

  it('should use settingsManager', () => {
    expect(storeContent).toContain('SettingsManagerCore');
  });
});

describe('config barrel export verification', () => {
  it('settingsStore.ts should export schema types', () => {
    const storePath = path.join(__dirname, 'config', 'settingsStore.ts');
    const storeContent = fs.readFileSync(storePath, 'utf-8');
    
    expect(storeContent).toContain('ProviderSchema');
    expect(storeContent).toContain('ModelsSettingsSchema');
    expect(storeContent).toContain('ServicesSettingsSchema');
    expect(storeContent).toContain('OverseerrServiceSchema');
  });
});
