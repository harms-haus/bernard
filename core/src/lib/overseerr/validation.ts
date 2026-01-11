/**
 * Overseerr Tool Validation
 */
import type { OverseerrServiceSettings } from '@/lib/config/appSettings';
import { createOverseerrClient } from './client';
import type { OverseerrClient } from './client';

/**
 * Validate Overseerr configuration
 */
export function isValidOverseerrConfig(
  config: OverseerrServiceSettings | undefined
): config is OverseerrServiceSettings {
  if (!config) return false;
  try {
    new URL(config.baseUrl);
    if (!config.apiKey || typeof config.apiKey !== 'string') return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Create Overseerr client with validation
 */
export function getOverseerrClient(
  settings: OverseerrServiceSettings | undefined
): { ok: true; client: OverseerrClient } | { ok: false; reason: string } {
  if (!settings) {
    return { ok: false, reason: 'Overseerr service is not configured' };
  }

  if (!isValidOverseerrConfig(settings)) {
    return { ok: false, reason: 'Invalid Overseerr configuration' };
  }

  const client = createOverseerrClient(settings);
  if (!client) {
    return { ok: false, reason: 'Failed to create Overseerr client' };
  }

  return { ok: true, client };
}
