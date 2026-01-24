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
    const url = new URL(config.baseUrl as string);

    if (!config.apiKey || typeof config.apiKey !== 'string') return false;

    const pathname = url.pathname;

    if (!pathname.includes('/api/v1')) {
      return false;
    }

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

  if (!settings.apiKey || typeof settings.apiKey !== 'string') {
    return { ok: false, reason: 'Overseerr API key is required' };
  }

  if (!settings.baseUrl) {
    return { ok: false, reason: 'Overseerr base URL is required' };
  }

  const url = settings.baseUrl as string;
  try {
    new URL(url);
  } catch {
    return { ok: false, reason: 'Invalid Overseerr base URL format' };
  }

  const pathname = new URL(url).pathname;
  if (!pathname.includes('/api/v1')) {
    return { ok: false, reason: 'Overseerr base URL must include /api/v1 (e.g., http://overseerr:5055/api/v1)' };
  }

  const client = createOverseerrClient(settings as { baseUrl: string; apiKey: string });
  if (!client) {
    return { ok: false, reason: 'Failed to create Overseerr client' };
  }

  return { ok: true, client };
}
