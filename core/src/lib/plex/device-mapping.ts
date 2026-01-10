/**
 * Device mapping for Plex media playback
 * Maps location identifiers to Home Assistant media player entities and Plex client IDs
 */
export interface DeviceConfig {
  adbAddress?: string; // ADB address for direct ADB commands
  haEntityId?: string; // Home Assistant entity ID for ADB commands
  haPlexEntityId?: string; // Home Assistant entity ID for Plex commands
  plexClientId?: string; // Plex client machine ID for direct navigation
  deviceName: string; // Human-readable device name
}

export type PlexDeviceMapping = Record<string, DeviceConfig>;

/**
 * Hard-coded device mapping for supported locations
 * This is the single source of truth for device configurations
 */
export const DEVICE_MAPPING: PlexDeviceMapping = {
  living_room: {
    adbAddress: "10.97.1.90:5555",
    haEntityId: "media_player.living_room_tv_lucifer",
    haPlexEntityId: "media_player.living_room_plex_lucifer",
    plexClientId: "8d526b29a260ac38-com-plexapp-android",
    deviceName: "Living Room TV",
  },
  main_bed: {
    adbAddress: "10.97.1.92:5555",
    haEntityId: "media_player.main_bed_tv_asmodeus",
    haPlexEntityId: "media_player.main_bed_plex_asmodeus",
    plexClientId: "dc1b3ceb227d64ba-com-plexapp-android",
    deviceName: "Bedroom TV",
  },
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
 * Resolve location to Home Assistant Plex entity ID (if available)
 */
export function resolveHAPlexEntityId(locationId: string): string | null {
  const config = resolveDeviceConfig(locationId);
  return config?.haPlexEntityId || null;
}

/**
 * Get device name from mapping, fallback to location ID
 */
export function getDeviceName(locationId: string): string {
  const config = resolveDeviceConfig(locationId);
  return config?.deviceName || locationId;
}

/**
 * Resolve location to ADB address (if available)
 */
export function resolveAdbAddress(locationId: string): string | null {
  const config = resolveDeviceConfig(locationId);
  return config?.adbAddress || null;
}

/**
 * Check if a location supports ADB commands via Home Assistant
 */
export function supportsADB(locationId: string): boolean {
  return resolveHAEntityId(locationId) !== null;
}

/**
 * Check if a location supports direct ADB commands
 */
export function supportsDirectADB(locationId: string): boolean {
  return resolveAdbAddress(locationId) !== null;
}

/**
 * Check if a location supports direct Plex navigation
 */
export function supportsPlexNavigation(locationId: string): boolean {
  return resolvePlexClientId(locationId) !== null;
}
