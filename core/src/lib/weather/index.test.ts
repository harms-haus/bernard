import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('weather barrel export', () => {
  const indexPath = path.join(__dirname, 'index.ts');
  let indexContent: string;

  beforeEach(() => {
    indexContent = fs.readFileSync(indexPath, 'utf-8');
  });

  it('should export weather fetch functions', () => {
    expect(indexContent).toContain('getForecastApiUrl');
    expect(indexContent).toContain('getHistoricalApiUrl');
    expect(indexContent).toContain('fetchWeatherJson');
  });

  it('should export unit conversion functions', () => {
    expect(indexContent).toContain('resolveUnits');
    expect(indexContent).toContain('chooseUnits');
    expect(indexContent).toContain('likelyImperial');
  });

  it('should export geocoding functions', () => {
    expect(indexContent).toContain('geocodeLocation');
    expect(indexContent).toContain('buildGeocodeUrl');
  });

  it('should export formatting functions', () => {
    expect(indexContent).toContain('parseTarget');
    expect(indexContent).toContain('parseDateRange');
    expect(indexContent).toContain('getImperialUnits');
  });
});

describe('weather exports verification', () => {
  it('common.ts should export weather functions', () => {
    const commonPath = path.join(__dirname, 'common.ts');
    const commonContent = fs.readFileSync(commonPath, 'utf-8');
    
    // Check for export declarations anywhere in the file
    expect(commonContent).toMatch(/export async function getForecastApiUrl/);
    expect(commonContent).toMatch(/export async function fetchWeatherJson/);
    expect(commonContent).toMatch(/export function resolveUnits/);
    expect(commonContent).toMatch(/export function formatWeatherCode/);
    expect(commonContent).toMatch(/export type UnitChoice/);
  });

  it('geocoding.ts should export geocoding functions', () => {
    const geoPath = path.join(__dirname, 'geocoding.ts');
    const geoContent = fs.readFileSync(geoPath, 'utf-8');
    
    expect(geoContent).toContain('export async function geocodeLocation');
    expect(geoContent).toContain('export function buildGeocodeUrl');
    expect(geoContent).toContain('export async function loadGeocodeConfig');
    expect(geoContent).toContain('export type GeocodeConfig');
  });
});
