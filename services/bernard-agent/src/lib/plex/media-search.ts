/**
 * Plex Media Search Utilities
 *
 * Provides functions for searching and retrieving media from Plex servers.
 */

export type PlexConfig = {
  baseUrl: string;
  token: string;
};

/**
 * Plex Media Item interface
 */
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
  viewOffset?: number; // in milliseconds
}

/**
 * Plex Library Section interface
 */
export interface LibrarySection {
  key: string;
  title: string;
  type: string;
  thumb: string;
}

type RankedPlexMediaItem = PlexMediaItem & { _score: number };

/**
 * Plex client information
 */
export interface PlexClientInfo {
  machineIdentifier: string;
  name: string;
  host?: string;
  port?: number;
  protocol?: string;
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
    throw new Error(
      `Failed to get Plex server identity: ${response.status} ${response.statusText}`
    );
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
  try {
    const response = await fetch(`${plexConfig.baseUrl}/clients`, {
      headers: {
        'X-Plex-Token': plexConfig.token,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`Failed to discover Plex clients: ${response.status}`);
      return null;
    }

    const data = await response.json() as {
      MediaContainer?: {
        Server?: PlexClientInfo[]
      }
    };

    const clients = data.MediaContainer?.Server || [];
    return clients.find(client => client.machineIdentifier === machineIdentifier) || null;
  } catch (error) {
    console.warn('Error discovering Plex clients:', error);
    return null;
  }
}

/**
 * Search Plex media libraries
 */
export async function searchPlexMedia(
  plexConfig: PlexConfig,
  query: string,
  libraryKey: string
): Promise<PlexMediaItem[]> {
  const searchUrl = `${plexConfig.baseUrl}/library/sections/${libraryKey}/search?query=${encodeURIComponent(query)}`;

  const response = await fetch(searchUrl, {
    headers: {
      'X-Plex-Token': plexConfig.token,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Plex search failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    MediaContainer?: {
      Metadata?: PlexMediaItem[]
    }
  };

  return data.MediaContainer?.Metadata || [];
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
      Directory?: LibrarySection[]
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
export function rankSearchResults(results: PlexMediaItem[], query: string): RankedPlexMediaItem[] {
  const normalizedQuery = query.toLowerCase().trim();

  return results
    .map(result => {
      let score = 0;

      // Exact title match gets highest score
      if (result.title.toLowerCase() === normalizedQuery) {
        score += 100;
      }

      // Title starts with query
      if (result.title.toLowerCase().startsWith(normalizedQuery)) {
        score += 80;
      }

      // Title contains query
      if (result.title.toLowerCase().includes(normalizedQuery)) {
        score += 50;
      }

      // View count bonus (more watched = higher priority)
      if (result.viewCount && result.viewCount > 0) {
        score += Math.min(result.viewCount, 20);
      }

      // Recently added bonus (within 30 days)
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      if (result.addedAt * 1000 > thirtyDaysAgo) {
        score += 15;
      }

      return { ...result, _score: score };
    })
    .sort((a, b) => b._score - a._score);
}

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
): Promise<{ bestMatch: PlexMediaItem, mediaType: 'movie' | 'show' }> {
  const librarySections = await deps.getPlexLibrarySectionsImpl(plexConfig);

  // Focus on Movies and TV Shows sections
  const mediaSections = librarySections.filter(section =>
    section.type === 'movie' || section.type === 'show'
  );

  if (mediaSections.length === 0) {
    throw new Error('No Movies or TV Shows libraries found in Plex');
  }

  const allResults: PlexMediaItem[] = [];

  // Search each media section
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

  // Rank and get best match
  const rankedResults = deps.rankSearchResultsImpl(allResults, mediaQuery);
  const bestMatch = rankedResults[0];

  if (!bestMatch) {
    throw new Error(`No media found matching "${mediaQuery}" in Plex libraries`);
  }

  // Determine media type
  const mediaType = bestMatch.type === 'movie' ? 'movie' : 'show';

  return { bestMatch, mediaType };
}
