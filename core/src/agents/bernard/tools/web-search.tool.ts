import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";

import { executeSearXNGSearch, verifySearchConfigured } from "@/lib/searxng";
export { verifySearchConfigured } from "@/lib/searxng";
import { ToolFactory } from "./types";
import { createProgressReporter, ProgressReporter } from "../utils";
import { getSearchingUpdate } from "../updates";

const DEFAULT_RESULT_COUNT = 3;

export type SearchConfigResult =
  | { ok: true; apiKey: string; apiUrl: string; provider: "searxng" }
  | { ok: false; reason: string };

export type SearchResultItem = { title?: string; url?: string; description?: string };

/**
 * Dependencies for the web search tool.
 * All external calls are abstracted for testability.
 */
export interface WebSearchDependencies {
  verifySearchConfigured: () => Promise<{ ok: boolean; reason?: string }>;
  fetchSettings: () => Promise<Awaited<ReturnType<typeof import("@/lib/config/settingsCache").getSettings>> | null>;
  executeSearXNGSearch: typeof executeSearXNGSearch;
  createProgressReporter: typeof createProgressReporter;
  getSearchingUpdate: typeof getSearchingUpdate;
}

const MISSING_KEY_REASON = "Missing search API configuration.";

function normalizeApiKey(rawKey: string | null | undefined): { ok: true; apiKey: string } | { ok: false; reason: string } {
  const apiKey = rawKey?.trim();
  if (!apiKey) {
    return { ok: false, reason: MISSING_KEY_REASON };
  }
  const PLACEHOLDER_API_KEYS = new Set(["changeme", "searxng-api-key"]);
  if (PLACEHOLDER_API_KEYS.has(apiKey.toLowerCase())) {
    return { ok: false, reason: "Replace API key with a real token." };
  }
  return { ok: true, apiKey };
}

function normalizeApiUrl(rawUrl: string | null | undefined): { ok: true; apiUrl: string } | { ok: false; reason: string } {
  const trimmed = (rawUrl ?? "").trim();
  if (!trimmed) {
    return { ok: false, reason: "API URL is empty or missing." };
  }
  try {
    return { ok: true, apiUrl: new URL(trimmed).toString() };
  } catch {
    return { ok: false, reason: "Invalid search API URL (must be an absolute URL)." };
  }
}

async function fetchSettingsWithTimeout(
  fetchSettings: WebSearchDependencies['fetchSettings'],
  timeoutMs: number
): Promise<Awaited<ReturnType<typeof import("@/lib/config/settingsCache").getSettings>> | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    fetchSettings().catch(() => null),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
  return result;
}

function resolveSearchConfigFromSettings(
  settings: Awaited<ReturnType<typeof import("@/lib/config/settingsCache").getSettings>> | null
): SearchConfigResult {
  const searchSvc = settings?.services?.search;
  if (searchSvc?.apiUrl) {
    const urlResult = normalizeApiUrl(searchSvc.apiUrl);
    if (!urlResult.ok) return urlResult;

    if (searchSvc.apiKey) {
      const keyResult = normalizeApiKey(searchSvc.apiKey);
      if (!keyResult.ok) return keyResult;
      return { ok: true, apiKey: keyResult.apiKey, apiUrl: urlResult.apiUrl, provider: "searxng" };
    }

    return { ok: true, apiKey: "", apiUrl: urlResult.apiUrl, provider: "searxng" };
  }

  return { ok: false, reason: MISSING_KEY_REASON };
}

async function executeSearch(
  query: string,
  progress: ProgressReporter,
  count: number | undefined,
  startingIndex: number | undefined,
  deps: WebSearchDependencies
): Promise<string> {
  const settings = await fetchSettingsWithTimeout(deps.fetchSettings, 500);
  const config = resolveSearchConfigFromSettings(settings);
  
  if (!config.ok) {
    return `Search tool is not configured (${config.reason})`;
  }

  progress.report(deps.getSearchingUpdate());

  const result = await deps.executeSearXNGSearch(query, count ?? DEFAULT_RESULT_COUNT, startingIndex ?? 1);

  progress.reset();

  return result;
}

/**
 * Create the web search tool with injected dependencies.
 * This allows for easier testing by mocking external dependencies.
 */
export function createWebSearchTool(deps: WebSearchDependencies) {
  return tool(
    async (
      { query, count, starting_index }: { query: string; count?: number; starting_index?: number },
      _config: RunnableConfig,
    ) => {
      const progress = deps.createProgressReporter(_config, "web_search");

      const result = await executeSearch(query, progress, count, starting_index, deps);

      progress.reset();

      return result;
    },
    {
      name: "web_search",
      description: "Search the web for fresh information.",
      schema: z.object({
        query: z.string().min(3),
        count: z.number().int().min(1).max(8).optional(),
        starting_index: z.number().int().min(1).optional().default(1),
      }),
    },
  );
}

/**
 * Create the web search tool factory with optional dependency overrides.
 * This allows for easier testing by mocking external dependencies.
 */
export function createWebSearchToolFactory(
  overrides?: Partial<WebSearchDependencies>
): ToolFactory {
  const defaultDependencies: WebSearchDependencies = {
    verifySearchConfigured,
    fetchSettings: () => import("@/lib/config/settingsCache").then((mod) => mod.getSettings()),
    executeSearXNGSearch,
    createProgressReporter,
    getSearchingUpdate,
  };

  const deps = { ...defaultDependencies, ...overrides };

  return async () => {
    const isValid = await deps.verifySearchConfigured();
    if (!isValid.ok) {
      return { ok: false, name: "web_search", reason: isValid.reason ?? "" };
    }
    const tool = createWebSearchTool(deps);
    return { ok: true, tool, name: tool.name };
  };
}

/**
 * Default web search tool factory (backward compatible).
 */
export const webSearchToolFactory = createWebSearchToolFactory();
