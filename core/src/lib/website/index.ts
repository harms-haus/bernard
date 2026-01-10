// Website content caching utilities
export {
  get as getCachedContent,
  set as setCachedContent,
  clear as clearExpiredCache,
  getCacheStats
} from '@/lib/website/content-cache';

export type {
  CacheEntry
} from '@/lib/website/content-cache';
