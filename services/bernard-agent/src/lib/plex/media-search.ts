/**
 * Plex Media Search Utilities
 *
 * Provides functions for searching and retrieving media from Plex servers.
 */

import { calculateStringSimilarity } from "@/lib/string";

export type PlexConfig = {
  baseUrl: string;
  token: string;
};

export interface PlexMediaItem {
  ratingKey: string;
  key: string;
  title: string;
  type: 'movie' | 'show' | 'season' | 'episode';
  year: number;
  thumb: string;
  art: string;
  summary?: string;
  duration?: number;
  addedAt: number;
  viewCount?: number;
  viewOffset?: number;
}

export interface LibrarySection {
  key: string;
  title: string;
  type: string;
  thumb: string;
}

/**
 * Search Plex using the hubs/search endpoint
 */
export async function searchPlexMedia(
  plexConfig: PlexConfig,
  query: string,
  _libraryKey: string
): Promise<PlexMediaItem[]> {
  const searchUrl = `${plexConfig.baseUrl}/hubs/search?query=${encodeURIComponent(query)}`;

  const response = await fetch(searchUrl, {
    headers: {
      'X-Plex-Token': plexConfig.token,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Plex search failed: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();

  // Parse XML response
  return parsePlexHubsSearchResponse(text);
}

/**
 * Parse Plex hubs/search XML response
 */
function parsePlexHubsSearchResponse(xmlText: string): PlexMediaItem[] {
  const results: PlexMediaItem[] = [];

  // Match Video and Directory elements within Hub containers
  // Video elements have nested content (Media, Genre, Director, etc.)
  const videoMatches = xmlText.matchAll(/<Video([^>]*)>[\s\S]*?<\/Video>/g);
  for (const match of videoMatches) {
    const attrs = match[1];
    if (!attrs) continue;
    const item = parsePlexXmlAttributes(attrs);
    if (item) results.push(item);
  }

  // Directory elements (for shows/seasons) also have nested content
  const dirMatches = xmlText.matchAll(/<Directory([^>]*)>[\s\S]*?<\/Directory>/g);
  for (const match of dirMatches) {
    const attrs = match[1];
    if (!attrs) continue;
    const item = parsePlexXmlAttributes(attrs);
    if (item) results.push(item);
  }

  return results;
}

/**
 * Parse attributes from Plex XML element into PlexMediaItem
 */
function parsePlexXmlAttributes(attrs: string): PlexMediaItem | null {
  const getAttr = (name: string): string | undefined => {
    const match = attrs.match(new RegExp(`${name}="([^"]*)"`));
    return match?.[1];
  };

  const ratingKey = getAttr('ratingKey');
  const key = getAttr('key');
  const title = getAttr('title');
  const typeStr = getAttr('type');
  const type = (typeStr === 'movie' || typeStr === 'show' || typeStr === 'season' || typeStr === 'episode')
    ? typeStr
    : undefined;
  const yearStr = getAttr('year');
  const year = yearStr ? parseInt(yearStr, 10) : 0;
  const thumb = getAttr('thumb') ?? '';
  const art = getAttr('art') ?? '';
  const summary = getAttr('summary');
  const durationStr = getAttr('duration');
  const duration = durationStr ? parseInt(durationStr, 10) : undefined;
  const addedAtStr = getAttr('addedAt');
  const addedAt = addedAtStr ? parseInt(addedAtStr, 10) : 0;
  const viewCountStr = getAttr('viewCount');
  const viewCount = viewCountStr ? parseInt(viewCountStr, 10) : undefined;
  const viewOffsetStr = getAttr('viewOffset');
  const viewOffset = viewOffsetStr ? parseInt(viewOffsetStr, 10) : undefined;

  if (ratingKey && key && title && type) {
    const item: PlexMediaItem = {
      ratingKey,
      key,
      title,
      type,
      year,
      thumb,
      art,
      addedAt
    };
    if (summary !== undefined) item.summary = summary;
    if (duration !== undefined) item.duration = duration;
    if (viewCount !== undefined) item.viewCount = viewCount;
    if (viewOffset !== undefined) item.viewOffset = viewOffset;
    return item;
  }

  return null;
}

/**
 * Get Plex library sections
 */
export async function getPlexLibrarySections(plexConfig: PlexConfig): Promise<LibrarySection[]> {
  const response = await fetch(`${plexConfig.baseUrl}/library/sections`, {
    headers: {
      'X-Plex-Token': plexConfig.token,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get Plex library sections: ${response.status}`);
  }

  const data = await response.json() as {
    MediaContainer?: {
      Directory?: Array<{
        key: string;
        title: string;
        type: string;
        thumb: string;
      }>
    }
  };

  return data.MediaContainer?.Directory || [];
}

/**
 * Get Plex item metadata
 */
export async function getPlexItemMetadata(
  plexConfig: PlexConfig,
  ratingKey: string
): Promise<PlexMediaItem | null> {
  const response = await fetch(`${plexConfig.baseUrl}/library/metadata/${ratingKey}`, {
    headers: {
      'X-Plex-Token': plexConfig.token,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json() as {
    MediaContainer?: {
      Metadata?: PlexMediaItem[]
    }
  };

  return data.MediaContainer?.Metadata?.[0] || null;
}

/**
 * Rank search results by relevance
 */
export function rankSearchResults(results: PlexMediaItem[], query: string): Array<PlexMediaItem & { _score: number }> {
  const normalizedQuery = query.toLowerCase().trim();

  return results
    .map(result => {
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

      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      if (result.addedAt * 1000 > thirtyDaysAgo) {
        score += 15;
      }

      return { ...result, _score: score };
    })
    .sort((a, b) => b._score - a._score);
}

/**
 * Search Plex media with multi-factor ranking
 */
export async function searchPlexMediaWithRanking(
  plexConfig: PlexConfig,
  query: string,
  options: {
    limit?: number;
    offset?: number;
    minSimilarity?: number;
  } = {}
): Promise<Array<{ item: PlexMediaItem; similarity: number; watchTime: number; recency: number; totalScore: number }>> {
  const { limit = 10, offset = 0, minSimilarity = 0.3 } = options;

  const results = await searchPlexMedia(plexConfig, query, '');

  const now = Date.now();
  const rankedResults: Array<{ item: PlexMediaItem; similarity: number; watchTime: number; recency: number; totalScore: number }> = [];

  for (const item of results) {
    const similarity = calculateStringSimilarity(query, item.title);

    if (similarity < minSimilarity) {
      continue;
    }

    const watchTime = Math.min(100, (item.viewCount || 0) * 5);
    const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);
    const recency = item.addedAt * 1000 > ninetyDaysAgo
      ? 100 * (1 - (now - item.addedAt * 1000) / (90 * 24 * 60 * 60 * 1000))
      : 0;

    const totalScore = (similarity * 50) + (watchTime * 0.3) + (recency * 0.2);

    rankedResults.push({ item, similarity, watchTime, recency, totalScore });
  }

  rankedResults.sort((a, b) => b.totalScore - a.totalScore);
  return rankedResults.slice(offset, offset + limit);
}

/**
 * Calculate watch progress
 */
export function calculatePlexMediaProgress(viewOffset: number | undefined, duration: number | undefined): number {
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

/**
 * Get last play timestamp
 */
export function getLastPlexPlayTime(metadata: PlexMediaItem | null): number | null {
  if (!metadata) {
    return null;
  }

  if (metadata.viewOffset && metadata.viewOffset > 0) {
    return Date.now();
  }

  return null;
}

/**
 * Plex client information
 */
export interface PlexClientInfo {
  machineIdentifier: string;
  name: string;
  product: string;
  platform: string;
  device: string;
}

/**
 * Get Plex server identity information
 */
export async function getPlexServerIdentity(plexConfig: PlexConfig): Promise<{ machineIdentifier: string }> {
  const response = await fetch(`${plexConfig.baseUrl}/identity`, {
    headers: {
      'X-Plex-Token': plexConfig.token,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get Plex server identity: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { MediaContainer?: { machineIdentifier?: string } };
  const machineIdentifier = data.MediaContainer?.machineIdentifier;

  if (!machineIdentifier) {
    throw new Error('Server machine identifier not found in identity response');
  }

  return { machineIdentifier };
}

/**
 * Discover Plex clients and find one by machine identifier
 */
export async function discoverPlexClient(
  plexConfig: PlexConfig,
  machineIdentifier: string
): Promise<PlexClientInfo | null> {
  const response = await fetch(`${plexConfig.baseUrl}/clients`, {
    headers: {
      'X-Plex-Token': plexConfig.token,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json() as {
    MediaContainer?: {
      Server?: Array<{
        machineIdentifier: string;
        name: string;
        product: string;
        platform: string;
        device: string;
      }>
    }
  };

  const client = data.MediaContainer?.Server?.find(s => s.machineIdentifier === machineIdentifier);

  if (!client) {
    return null;
  }

  return {
    machineIdentifier: client.machineIdentifier,
    name: client.name,
    product: client.product,
    platform: client.platform,
    device: client.device
  };
}

/**
 * Ranked Plex media item with scoring information
 */
export type RankedPlexMediaItemWithScore = {
  item: PlexMediaItem;
  similarity: number;
  watchTime: number;
  recency: number;
  totalScore: number;
};

/**
 * Search Plex for the best match
 */
export async function searchPlexBestMatch(
  plexConfig: PlexConfig,
  mediaQuery: string,
  deps: {
    getPlexLibrarySectionsImpl: typeof getPlexLibrarySections;
    searchPlexMediaImpl: typeof searchPlexMedia;
    rankSearchResultsImpl: typeof rankSearchResults;
  }
): Promise<{ bestMatch: PlexMediaItem; mediaType: 'movie' | 'show' }> {
  const librarySections = await deps.getPlexLibrarySectionsImpl(plexConfig);

  const mediaSections = librarySections.filter(section =>
    section.type === 'movie' || section.type === 'show'
  );

  if (mediaSections.length === 0) {
    throw new Error('No Movies or TV Shows libraries found in Plex');
  }

  const allResults: PlexMediaItem[] = [];

  for (const section of mediaSections) {
    try {
      const results = await deps.searchPlexMediaImpl(plexConfig, mediaQuery, section.key);
      allResults.push(...results);
    } catch (error) {
      console.warn(`Failed to search section ${section.title}:`, error);
    }
  }

  if (allResults.length === 0) {
    throw new Error(`No media found matching "${mediaQuery}" in Plex libraries`);
  }

  const rankedResults = deps.rankSearchResultsImpl(allResults, mediaQuery);
  const bestMatch = rankedResults[0];

  if (!bestMatch) {
    throw new Error(`No media found matching "${mediaQuery}" in Plex libraries`);
  }

  const mediaType = bestMatch.type === 'movie' ? 'movie' : 'show';

  return { bestMatch, mediaType };
}
