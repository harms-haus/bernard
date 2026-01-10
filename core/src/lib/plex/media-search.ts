/**
 * Plex Media Search Utilities
 * Provides functions for searching and retrieving media from Plex servers.
 */
import { calculateStringSimilarityJaroWinkler } from '@/lib/utils/string';
import { createPlexClient, type PlexConfig } from '@/lib/plex/client';

export type { PlexConfig } from '@/lib/plex/client';

export interface PlexMediaItem {
  ratingKey: string;
  key: string;
  title: string;
  type: "movie" | "show" | "season" | "episode";
  year: number;
  thumb: string;
  art: string;
  summary?: string;
  duration?: number;
  addedAt: number;
  viewCount?: number;
  viewOffset?: number;
  lastViewedAt?: number;  // Unix timestamp from Plex API
}

export type IntermediateSearchPlexMediaResult = PlexMediaItem & { similarity: number, watchTime: number, recency: number };

export type SearchPlexMediaResult = IntermediateSearchPlexMediaResult & { totalScore: number };

export type ModifyScoreFunction = (mediaInfo: IntermediateSearchPlexMediaResult) => number;

export interface LibrarySection {
  key: string;
  title: string;
  type: string;
  thumb: string;
}

/** Map node-plex-api response to PlexMediaItem */
function mapPlexApiItemToMediaItem(apiItem: any): PlexMediaItem {
  return {
    ratingKey: apiItem.ratingKey,
    key: apiItem.key,
    title: apiItem.title,
    type: apiItem.type,
    year: apiItem.year || 0,
    thumb: apiItem.thumb || "",
    art: apiItem.art || "",
    summary: apiItem.summary,
    duration: apiItem.duration,
    addedAt: apiItem.addedAt || 0,
    viewCount: apiItem.viewCount,
    viewOffset: apiItem.viewOffset,
    lastViewedAt: apiItem.lastViewedAt,
  };
}

/** Search Plex using the hubs/search endpoint */
export async function searchPlexMedia(
  plexConfig: PlexConfig,
  query: string,
  _libraryKey: string,
): Promise<PlexMediaItem[]> {
  try {
    const client = createPlexClient(plexConfig);
    const result = await client.query(
      `/hubs/search?query=${encodeURIComponent(query)}`,
    );

    const items: PlexMediaItem[] = [];
    const hubs = result.MediaContainer?.Hub || [];

    for (const hub of hubs) {
      // Handle different response formats from Plex API
      // /hubs/search returns Metadata array, not Video/Directory
      const metadata = hub.Metadata || [];
      const videos = hub.Video || [];
      const directories = hub.Directory || [];

      for (const item of metadata) {
        if (
          item.type === "movie" ||
          item.type === "show" ||
          item.type === "season" ||
          item.type === "episode"
        ) {
          items.push(mapPlexApiItemToMediaItem(item));
        }
      }

      for (const video of videos) {
        if (
          video.type === "movie" ||
          video.type === "show" ||
          video.type === "season" ||
          video.type === "episode"
        ) {
          items.push(mapPlexApiItemToMediaItem(video));
        }
      }

      for (const dir of directories) {
        if (
          dir.type === "movie" ||
          dir.type === "show" ||
          dir.type === "season" ||
          dir.type === "episode"
        ) {
          items.push(mapPlexApiItemToMediaItem(dir));
        }
      }
    }

    return items;
  } catch {
    return [];
  }
}

/** Get Plex library sections */
export async function getPlexLibrarySections(
  plexConfig: PlexConfig,
): Promise<LibrarySection[]> {
  try {
    const client = createPlexClient(plexConfig);
    const result = await client.query("/library/sections");

    const directories = result.MediaContainer?.Directory || [];
    return directories.map((dir: any) => ({
      key: dir.key,
      title: dir.title,
      type: dir.type,
      thumb: dir.thumb,
    }));
  } catch {
    return [];
  }
}

/** Get Plex item metadata */
export async function getPlexItemMetadata(
  plexConfig: PlexConfig,
  ratingKey: string,
): Promise<PlexMediaItem | null> {
  try {
    const client = createPlexClient(plexConfig);
    const result = await client.query(`/library/metadata/${ratingKey}`);
    const metadata = result.MediaContainer?.Metadata?.[0];
    return metadata ? mapPlexApiItemToMediaItem(metadata) : null;
  } catch {
    return null;
  }
}

/** Rank search results by relevance */
export function rankSearchResults(
  results: PlexMediaItem[],
  query: string,
): Array<PlexMediaItem & { _score: number }> {
  const normalizedQuery = query.toLowerCase().trim();

  return results
    .map((result) => {
      let score = 0;

      if (result.title.toLowerCase() === normalizedQuery) {
        score += 100;
      } else if (result.title.toLowerCase().startsWith(normalizedQuery)) {
        score += 80;
      } else if (result.title.toLowerCase().includes(normalizedQuery)) {
        score += 50;
      }

      if (result.viewCount && result.viewCount > 0) {
        score += Math.min(result.viewCount, 20);
      }

      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      if (result.addedAt * 1000 > thirtyDaysAgo) {
        score += 15;
      }

      return { ...result, _score: score };
    })
    .sort((a, b) => b._score - a._score);
}

/** Search Plex media with multi-factor ranking */
export async function searchPlexMediaWithRanking(
  plexConfig: PlexConfig,
  query: string,
  options: {
    limit?: number;
    offset?: number;
    minSimilarity?: number;
    modifyScore?: ModifyScoreFunction;
  } = {},
): Promise<
  Array<{
    item: PlexMediaItem;
    similarity: number;
    watchTime: number;
    recency: number;
    totalScore: number;
  }>
> {
  const { limit = 10, offset = 0, minSimilarity = 0.15, modifyScore = () => 0} = options;

  // /hubs/search searches all libraries at once
  const results = await searchPlexMedia(plexConfig, query, "");

  const now = Date.now();
  const rankedResults: Array<{
    item: PlexMediaItem;
    similarity: number;
    watchTime: number;
    recency: number;
    totalScore: number;
  }> = [];

  for (const item of results) {
    const similarity = calculateStringSimilarityJaroWinkler(query, item.title);

    if (similarity < minSimilarity) {
      continue;
    }

    const watchTime = Math.min(100, (item.viewCount || 0) * 5);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - sevenDays;
    const recency =
      item.addedAt * 1000 > sevenDaysAgo
        ? 100 * (1 - (now - item.addedAt * 1000) / sevenDays)
        : 0;

    const totalScore = similarity * 50 + modifyScore({ ...item, similarity, watchTime, recency });

    rankedResults.push({ item, similarity, watchTime, recency, totalScore });
  }

  rankedResults.sort((a, b) => b.totalScore - a.totalScore);
  return rankedResults.slice(offset, offset + limit);
}

/** Calculate watch progress */
export function calculatePlexMediaProgress(
  viewOffset: number | undefined,
  duration: number | undefined,
): number {
  if (!duration || duration <= 0) {
    return 0;
  }

  const offset = viewOffset || 0;
  const startOffset = duration * 0.05;
  const endBuffer = duration * 0.15;
  const usableDuration = duration - startOffset - endBuffer;

  if (usableDuration <= 0) {
    return offset > startOffset ? 100 : 0;
  }

  const effectiveOffset = Math.max(0, offset - startOffset);
  const progress = (effectiveOffset / usableDuration) * 100;
  return Math.max(0, Math.min(100, Math.round(progress * 10) / 10));
}

/** Get last play timestamp */
export function getLastPlexPlayTime(
  metadata: PlexMediaItem | null,
): number | null {
  if (!metadata) {
    return null;
  }

  // Plex provides lastViewedAt as Unix timestamp (seconds) - convert to milliseconds
  if (metadata.lastViewedAt) {
    return metadata.lastViewedAt * 1000;
  }

  // If no lastViewedAt but has been viewed (viewCount > 0 or viewOffset > 0)
  // Return current time as indication that it's been watched (no timestamp available)
  if ((metadata.viewCount && metadata.viewCount > 0) || (metadata.viewOffset && metadata.viewOffset > 0)) {
    return Date.now();
  }

  return null;
}

/** Plex client information */
export interface PlexClientInfo {
  machineIdentifier: string;
  name: string;
  product: string;
  platform: string;
  device: string;
}

/** Get Plex server identity information */
export async function getPlexServerIdentity(
  plexConfig: PlexConfig,
): Promise<{ machineIdentifier: string }> {
  const client = createPlexClient(plexConfig);
  const result = await client.query("/");
  const machineIdentifier = result.MediaContainer?.machineIdentifier;

  if (!machineIdentifier) {
    throw new Error("Server machine identifier not found in identity response");
  }

  return { machineIdentifier };
}

/** Discover Plex clients and find one by machine identifier */
export async function discoverPlexClient(
  plexConfig: PlexConfig,
  machineIdentifier: string,
): Promise<PlexClientInfo | null> {
  try {
    const client = createPlexClient(plexConfig);
    const clients = await client.find("/clients");
    const clientData = clients.find(
      (c: any) => c.machineIdentifier === machineIdentifier,
    );

    if (!clientData) {
      return null;
    }

    return {
      machineIdentifier: clientData.machineIdentifier,
      name: clientData.name,
      product: clientData.product,
      platform: clientData.platform,
      device: clientData.device,
    };
  } catch {
    return null;
  }
}

/** Ranked Plex media item with scoring information */
export type RankedPlexMediaItemWithScore = {
  item: PlexMediaItem;
  similarity: number;
  watchTime: number;
  recency: number;
  totalScore: number;
};

/** Search Plex for the best match */
export async function searchPlexBestMatch(
  plexConfig: PlexConfig,
  mediaQuery: string,
  deps: {
    getPlexLibrarySectionsImpl: typeof getPlexLibrarySections;
    searchPlexMediaImpl: typeof searchPlexMedia;
    rankSearchResultsImpl: typeof rankSearchResults;
  },
): Promise<{ bestMatch: PlexMediaItem; mediaType: "movie" | "show" }> {
  const librarySections = await deps.getPlexLibrarySectionsImpl(plexConfig);

  const mediaSections = librarySections.filter(
    (section) => section.type === "movie" || section.type === "show",
  );

  if (mediaSections.length === 0) {
    throw new Error("No Movies or TV Shows libraries found in Plex");
  }

  const allResults: PlexMediaItem[] = [];

  for (const section of mediaSections) {
    try {
      const results = await deps.searchPlexMediaImpl(
        plexConfig,
        mediaQuery,
        section.key,
      );
      allResults.push(...results);
    } catch (error) {
      console.warn(`Failed to search section ${section.title}:`, error);
    }
  }

  if (allResults.length === 0) {
    throw new Error(
      `No media found matching "${mediaQuery}" in Plex libraries`,
    );
  }

  const rankedResults = deps.rankSearchResultsImpl(allResults, mediaQuery);
  const bestMatch = rankedResults[0];

  if (!bestMatch) {
    throw new Error(
      `No media found matching "${mediaQuery}" in Plex libraries`,
    );
  }

  const mediaType = bestMatch.type === "movie" ? "movie" : "show";

  return { bestMatch, mediaType };
}
