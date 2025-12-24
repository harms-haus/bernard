import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { getSettings } from "@/lib/config/settingsCache";
import { logger } from "@/lib/logging";

const DEFAULT_SEARXNG_API_URL = "https://searxng.example.com/search";
const DEFAULT_RESULT_COUNT = 3;
const SETTINGS_TIMEOUT_MS = 500;
const PLACEHOLDER_API_KEYS = new Set(["changeme", "searxng-api-key"]);

// SearXNG-specific types
type SearXNGResultItem = {
  title: string;
  url: string;
  content?: string;
  engine: string;
  score?: number;
};

type SearXNGResponseBody = {
  results: SearXNGResultItem[];
  query?: string;
  number_of_results?: number;
};

// Common types
type SearchConfigResult =
  | { ok: true; apiKey: string; apiUrl: string; provider: "searxng" }
  | { ok: false; reason: string };

type SearchResultItem = { title?: string; url?: string; description?: string };

const MISSING_KEY_REASON = "Missing search API configuration.";
const INVALID_URL_REASON = "Invalid search API URL (must be an absolute URL).";

/** Allows tests to replace the settings fetcher to avoid touching real stores. */
let settingsFetcher: typeof getSettings = getSettings;

/**
 * Replace the settings fetcher (primarily for tests to inject fakes).
 */
export function setSettingsFetcher(fetcher: typeof getSettings) {
  settingsFetcher = fetcher;
}

/**
 * Returns true when NODE_ENV indicates testing or when Node's --test flag is present.
 */
function isTestEnvironment() {
  return process.env["NODE_ENV"] === "test" || process.execArgv.some((arg) => arg.includes("--test"));
}

function normalizeApiKey(rawKey: string | null | undefined): { ok: true; apiKey: string } | { ok: false; reason: string } {
  const apiKey = rawKey?.trim();
  if (!apiKey) {
    return { ok: false, reason: MISSING_KEY_REASON };
  }
  if (PLACEHOLDER_API_KEYS.has(apiKey.toLowerCase())) {
    return { ok: false, reason: "Replace API key with a real token." };
  }
  return { ok: true, apiKey };
}

function normalizeApiUrl(rawUrl: string | null | undefined): { ok: true; apiUrl: string } | { ok: false; reason: string } {
  const trimmed = (rawUrl ?? DEFAULT_SEARXNG_API_URL).trim();
  if (!trimmed) {
    return { ok: false, reason: "API URL is empty or missing." };
  }
  try {
    return { ok: true, apiUrl: new URL(trimmed).toString() };
  } catch {
    return { ok: false, reason: INVALID_URL_REASON };
  }
}

/**
 * Resolve SearXNG configuration from the environment.
 */
export function resolveSearXNGConfigFromEnv(opts: { allowMissing?: boolean } = {}): SearchConfigResult | null {
  const searxngUrl = process.env["SEARXNG_API_URL"];
  const searxngKey = process.env["SEARXNG_API_KEY"];
  
  // SearXNG configuration takes priority
  if (searxngUrl) {
    const urlResult = normalizeApiUrl(searxngUrl);
    if (!urlResult.ok) return urlResult;
    
    // SearXNG key is optional for some instances
    if (searxngKey) {
      const keyResult = normalizeApiKey(searxngKey);
      if (!keyResult.ok) {
        if (!opts.allowMissing && keyResult.reason === MISSING_KEY_REASON) {
          return null;
        }
        return keyResult;
      }
      return { ok: true, apiKey: keyResult.apiKey, apiUrl: urlResult.apiUrl, provider: "searxng" };
    }
    
    // SearXNG without API key
    return { ok: true, apiKey: "", apiUrl: urlResult.apiUrl, provider: "searxng" };
  }
  
  return null;
}

/**
 * Resolve SearXNG configuration from settings.
 */
async function resolveSearchConfigFromSettings(): Promise<SearchConfigResult> {
  const settings = await fetchSettingsWithTimeout(SETTINGS_TIMEOUT_MS);

  // Try search settings (which supports SearXNG)
  const searchSvc = settings?.services?.search;
  if (searchSvc?.apiUrl) {
    const urlResult = normalizeApiUrl(searchSvc.apiUrl);
    if (!urlResult.ok) return urlResult;

    if (searchSvc.apiKey) {
      const keyResult = normalizeApiKey(searchSvc.apiKey);
      if (!keyResult.ok) return keyResult;
      return { ok: true, apiKey: keyResult.apiKey, apiUrl: urlResult.apiUrl, provider: "searxng" };
    }

    // SearXNG without API key
    return { ok: true, apiKey: "", apiUrl: urlResult.apiUrl, provider: "searxng" };
  }

  return { ok: false, reason: MISSING_KEY_REASON };
}

/**
 * Resolve search configuration with SearXNG priority, then settings.
 */
export async function resolveSearchConfig(): Promise<SearchConfigResult> {
  // Priority 1: SearXNG environment variables
  const searxngConfig = resolveSearXNGConfigFromEnv({ allowMissing: false });
  if (searxngConfig) return searxngConfig;
  
  if (isTestEnvironment()) {
    return { ok: false, reason: MISSING_KEY_REASON };
  }
  
  // Priority 2: Settings fallback
  return resolveSearchConfigFromSettings();
}

/**
 * Verify configuration is present, returning an object suitable for health checks.
 */
export const verifySearchConfigured = () => {
  const searxngConfig = resolveSearXNGConfigFromEnv({ allowMissing: true });
  if (searxngConfig?.ok) return { ok: true };
  
  return { ok: false, reason: searxngConfig?.reason ?? MISSING_KEY_REASON };
};

/**
 * Safely parse JSON responses, returning an error object on failure.
 */
export async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch (err) {
    return { error: "Failed to parse JSON response", detail: String(err) };
  }
}

/**
 * Build SearXNG search URL with query, count, and page number parameters.
 */
export function buildSearXNGUrl(apiUrl: string, query: string, count?: number, startingIndex?: number): URL {
  const url = new URL(apiUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("pageno", String(startingIndex ?? 1));
  url.searchParams.set("language", "en-US");

  if (count) {
    url.searchParams.set("num", String(Math.min(count, 8)));
  }

  return url;
}

/**
 * Parse SearXNG results from response payload.
 */
export function parseSearXNGResults(data: unknown): SearchResultItem[] {
  try {
    const response = data as SearXNGResponseBody | null | undefined;
    if (!response?.results || !Array.isArray(response.results)) {
      return [];
    }
    
    return response.results.map(result => ({
      title: result.title,
      url: result.url,
      description: result.content || result.engine
    }));
  } catch (error) {
    logger.error('SearXNG response parsing failed: %s', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Format search results into a concise numbered list.
 */
export function formatResults(items: SearchResultItem[], count?: number): string {
  const limited = items.slice(0, count ?? DEFAULT_RESULT_COUNT);
  if (!limited.length) return "No results.";
  return limited
    .map((item, idx) => `${idx + 1}. ${item.title ?? "Untitled"} — ${item.url ?? ""} :: ${item.description ?? ""}`)
    .join("\n");
}

async function fetchSearXNGSearch(url: URL, apiKey: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  
  return fetch(url, {
    headers,
    // Add timeout using AbortController
    signal: AbortSignal.timeout(5000)
  });
}

async function handleSearchResponse(res: Response, count?: number): Promise<string> {
  if (!res.ok) {
    const body = await res.text();
    logger.error('Search API error: %s %s - %s', res.status, res.statusText, body);
    return `Search failed: ${res.status} ${res.statusText}`;
  }
  
  const data = await safeJson(res);
  
  // Parse SearXNG results
  let items: SearchResultItem[] = [];
  
  // Check if this looks like a SearXNG response
  if (data && typeof data === 'object' && data.hasOwnProperty('results')) {
    items = parseSearXNGResults(data);
  }
  
  return formatResults(items, count);
}

async function executeSearch(query: string, count?: number, startingIndex?: number): Promise<string> {
  const config = await resolveSearchConfig();
  if (!config.ok) {
    return `Search tool is not configured (${config.reason})`;
  }

  logger.info('Executing search: query="%s" count=%d starting_index=%d provider=%s',
    query, count ?? DEFAULT_RESULT_COUNT, startingIndex ?? 1, config.provider);

  const url = buildSearXNGUrl(config.apiUrl, query, count, startingIndex);

  try {
    const res = await fetchSearXNGSearch(url, config.apiKey);
    return handleSearchResponse(res, count);
  } catch (error) {
    logger.error('Search request failed: %s', error instanceof Error ? error.message : String(error));
    return 'Search service unavailable, please try again later';
  }
}

async function fetchSettingsWithTimeout(timeoutMs: number): Promise<Awaited<ReturnType<typeof getSettings>> | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    settingsFetcher().catch(() => null),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    })
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
  return result as Awaited<ReturnType<typeof getSettings>> | null;
}

const webSearchToolImpl = tool(
  async ({ query, count, starting_index }) => {
    return executeSearch(query, count, starting_index);
  },
  {
    name: "web_search",
    description: "Search the web for fresh information.",
    schema: z.object({
      query: z.string().min(3),
      count: z.number().int().min(1).max(8).optional(),
      starting_index: z.number().int().min(1).optional().default(1)
    })
  }
);

export const webSearchTool = Object.assign(webSearchToolImpl, {
  verifyConfiguration: verifySearchConfigured,
  interpretationPrompt: ``
});