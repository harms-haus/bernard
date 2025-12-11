import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { getSettings } from "@/lib/config/settingsCache";

const DEFAULT_SEARCH_API_URL = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_RESULT_COUNT = 3;
const SETTINGS_TIMEOUT_MS = 500;
const PLACEHOLDER_API_KEYS = new Set(["brave-api-key", "changeme"]);

type SearchConfigResult =
  | { ok: true; apiKey: string; apiUrl: string }
  | { ok: false; reason: string };

type SearchResultItem = { title?: string; url?: string; description?: string };
type SearchResponseBody = { web?: { results?: SearchResultItem[] } };

const MISSING_KEY_REASON = "Missing SEARCH_API_KEY or BRAVE_API_KEY.";
const INVALID_URL_REASON = "Invalid SEARCH_API_URL (must be an absolute URL).";

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
    return { ok: false, reason: "Replace SEARCH_API_KEY/BRAVE_API_KEY with a real token." };
  }
  return { ok: true, apiKey };
}

function normalizeApiUrl(rawUrl: string | null | undefined): { ok: true; apiUrl: string } | { ok: false; reason: string } {
  const trimmed = (rawUrl ?? DEFAULT_SEARCH_API_URL).trim();
  if (!trimmed) {
    return { ok: false, reason: "SEARCH_API_URL is empty or missing." };
  }
  try {
    return { ok: true, apiUrl: new URL(trimmed).toString() };
  } catch {
    return { ok: false, reason: INVALID_URL_REASON };
  }
}

/**
 * Resolve search configuration from the environment.
 * @returns The config, an error, or null when missing and allowMissing is false.
 */
export function resolveSearchConfigFromEnv(opts: { allowMissing?: boolean } = {}): SearchConfigResult | null {
  const keyResult = normalizeApiKey(process.env["SEARCH_API_KEY"] ?? process.env["BRAVE_API_KEY"]);
  if (!keyResult.ok) {
    if (!opts.allowMissing && keyResult.reason === MISSING_KEY_REASON) {
      return null;
    }
    return keyResult;
  }

  const urlResult = normalizeApiUrl(process.env["SEARCH_API_URL"]);
  if (!urlResult.ok) return urlResult;

  return { ok: true, apiKey: keyResult.apiKey, apiUrl: urlResult.apiUrl };
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

async function resolveSearchConfigFromSettings(): Promise<SearchConfigResult> {
  const settings = await fetchSettingsWithTimeout(SETTINGS_TIMEOUT_MS);
  const svc = settings?.services.search;

  const keyResult = normalizeApiKey(svc?.apiKey);
  if (!keyResult.ok) return keyResult;

  const urlResult = normalizeApiUrl(svc?.apiUrl);
  if (!urlResult.ok) return urlResult;

  return { ok: true, apiKey: keyResult.apiKey, apiUrl: urlResult.apiUrl };
}

/**
 * Resolve search configuration, preferring env vars then settings, with test guard.
 */
export async function resolveSearchConfig(): Promise<SearchConfigResult> {
  const envConfig = resolveSearchConfigFromEnv({ allowMissing: false });
  if (envConfig) return envConfig;

  if (isTestEnvironment()) {
    return { ok: false, reason: MISSING_KEY_REASON };
  }

  return resolveSearchConfigFromSettings();
}

/**
 * Verify configuration is present, returning an object suitable for health checks.
 */
export const verifySearchConfigured = () => {
  const config = resolveSearchConfigFromEnv({ allowMissing: true });
  return config?.ok ? { ok: true } : { ok: false, reason: config?.reason ?? MISSING_KEY_REASON };
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
 * Build the search URL with query and count parameters.
 */
export function buildSearchUrl(apiUrl: string, query: string, count?: number): URL {
  const url = new URL(apiUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count ?? DEFAULT_RESULT_COUNT));
  return url;
}

/**
 * Extract web results from a response payload.
 */
export function parseWebResults(data: unknown): SearchResultItem[] {
  const results = (data as SearchResponseBody | null | undefined)?.web?.results;
  return Array.isArray(results) ? results : [];
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

async function fetchSearch(url: URL, apiKey: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });
}

async function handleSearchResponse(res: Response, count?: number): Promise<string> {
  if (!res.ok) {
    const body = await res.text();
    return `Search failed: ${res.status} ${res.statusText} ${body}`;
  }

  const data = await safeJson(res);
  const items = parseWebResults(data);
  return formatResults(items, count);
}

async function executeSearch(query: string, count?: number): Promise<string> {
  const config = await resolveSearchConfig();
  if (!config.ok) {
    return `Search tool is not configured (${config.reason})`;
  }

  const url = buildSearchUrl(config.apiUrl, query, count);
  const res = await fetchSearch(url, config.apiKey);
  return handleSearchResponse(res, count);
}

const webSearchToolImpl = tool(
  async ({ query, count }) => {
    return executeSearch(query, count);
  },
  {
    name: "web_search",
    description: "Search the web for fresh information.",
    schema: z.object({
      query: z.string().min(3),
      count: z.number().int().min(1).max(8).optional()
    })
  }
);

export const webSearchTool = Object.assign(webSearchToolImpl, {
  verifyConfiguration: verifySearchConfigured
});



