import { getSettingsStore, type BernardSettings } from "./settingsStore";

const CACHE_TTL_MS = 5_000;

let cached: { value: BernardSettings; expiresAt: number } | null = null;

export async function getSettings(forceRefresh = false): Promise<BernardSettings> {
  const now = Date.now();
  if (!forceRefresh && cached && now < cached.expiresAt) {
    return cached.value;
  }
  const store = getSettingsStore();
  const value = await store.getAll();
  cached = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

export function clearSettingsCache() {
  cached = null;
}

