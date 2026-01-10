// Device mapping exports
export {
  resolveDeviceConfig,
  resolveHAEntityId,
  resolveHAPlexEntityId,
  resolveAdbAddress,
  getDeviceName,
  getSupportedLocations,
} from '@/lib/plex/device-mapping';

// Client factory exports
export type { PlexConfig } from '@/lib/plex/client';

// Media search exports
export type {
  PlexMediaItem,
  LibrarySection,
  PlexClientInfo,
} from '@/lib/plex/media-search';

export {
  getPlexServerIdentity,
  discoverPlexClient,
  searchPlexMedia,
  getPlexLibrarySections,
  getPlexItemMetadata,
  rankSearchResults,
  searchPlexBestMatch,
  calculatePlexMediaProgress,
  getLastPlexPlayTime,
  searchPlexMediaWithRanking,
  type RankedPlexMediaItemWithScore,
} from '@/lib/plex/media-search';
