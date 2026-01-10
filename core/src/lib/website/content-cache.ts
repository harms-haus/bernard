/**
 * Cache for website content extracted by Readability
 * Stores extracted article content with 10-minute TTL
 */

export interface CacheEntry {
  content: string;
  title: string;
  url: string;
  byline: string | null;
  timestamp: number;
}

const CACHE_TTL_MS = 600_000; // 10 minutes
const cache = new Map<string, CacheEntry>();

/**
 * Get cached website content if it exists and hasn't expired
 * @param uri - Website URI to look up
 * @param forceRefresh - If true, ignore cache and return null
 * @returns Cached entry or null if not found/expired
 */
export function get(uri: string, forceRefresh = false): CacheEntry | null {
  if (forceRefresh) {
    return null;
  }

  const entry = cache.get(uri);
  if (!entry) {
    return null;
  }

  const now = Date.now();
  if (now - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(uri);
    return null;
  }

  return entry;
}

/**
 * Store website content in cache
 * @param uri - Website URI as cache key
 * @param entry - Content to cache
 */
export function set(uri: string, entry: CacheEntry): void {
  cache.set(uri, entry);
}

/**
 * Clear cache for specific URI or all entries
 * @param uri - Optional URI to clear, clears all if not specified
 */
export function clear(uri?: string): void {
  if (uri) {
    cache.delete(uri);
  } else {
    cache.clear();
  }
}

/**
 * Get cache statistics for debugging/testing
 */
export function getCacheStats() {
  return {
    size: cache.size,
    entries: Array.from(cache.keys()),
    ttlMs: CACHE_TTL_MS
  };
}
