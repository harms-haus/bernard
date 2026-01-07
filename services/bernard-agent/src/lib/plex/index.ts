// Device mapping exports
export {
  resolveDeviceConfig,
  resolveHAEntityId,
  resolveHAPlexEntityId,
  resolveAdbAddress,
  getDeviceName,
  getSupportedLocations
} from "./device-mapping";

// Media search exports
export type {
  PlexConfig,
  PlexMediaItem,
  LibrarySection,
  PlexClientInfo
} from "./media-search";

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
  type RankedPlexMediaItemWithScore
} from "./media-search";
