/**
 * Device mapping for Plex media playback
 * Maps location identifiers to Home Assistant media player entities and Plex client IDs
 */
export interface DeviceConfig {
  haEntityId?: string;        // Home Assistant entity ID for ADB commands
  plexClientId?: string;      // Plex client machine ID for direct navigation
  deviceName: string;         // Human-readable device name
}

export type PlexDeviceMapping = Record<string, DeviceConfig>;

/**
 * Hard-coded device mapping for supported locations
 * This is the single source of truth for device configurations
 */
export const DEVICE_MAPPING: PlexDeviceMapping = {
  'livingroom': {
    haEntityId: 'media_player.living_room_tv_lucifer',
    plexClientId: '8d526b29a260ac38-com-plexapp-android',
    deviceName: 'Living Room TV'
  },
  'bedroom': {
    haEntityId: 'media_player.main_bed_tv_asmodeus',
    plexClientId: 'dc1b3ceb227d64ba-com-plexapp-android', 
    deviceName: 'Bedroom TV'
  }
};

/**
 * Get all supported location identifiers
 */
export function getSupportedLocations(): string[] {
  return Object.keys(DEVICE_MAPPING);
}

/**
 * Resolve location to device configuration
 */
export function resolveDeviceConfig(locationId: string): DeviceConfig | null {
  return DEVICE_MAPPING[locationId] || null;
}

/**
 * Resolve location to Home Assistant entity ID (if available)
 */
export function resolveHAEntityId(locationId: string): string | null {
  const config = resolveDeviceConfig(locationId);
  return config?.haEntityId || null;
}

/**
 * Resolve location to Plex client ID (if available)
 */
export function resolvePlexClientId(locationId: string): string | null {
  const config = resolveDeviceConfig(locationId);
  return config?.plexClientId || null;
}

/**
 * Get device name from mapping, fallback to location ID
 */
export function getDeviceName(locationId: string): string {
  const config = resolveDeviceConfig(locationId);
  return config?.deviceName || locationId;
}

/**
 * Check if a location supports ADB commands via Home Assistant
 */
export function supportsADB(locationId: string): boolean {
  return resolveHAEntityId(locationId) !== null;
}

/**
 * Check if a location supports direct Plex navigation
 */
export function supportsPlexNavigation(locationId: string): boolean {
  return resolvePlexClientId(locationId) !== null;
}
