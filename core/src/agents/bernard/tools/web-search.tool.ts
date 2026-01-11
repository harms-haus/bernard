import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";

import { executeSearXNGSearch, verifySearchConfigured } from "@/lib/searxng";
export { verifySearchConfigured } from "@/lib/searxng";
import { ToolFactory } from "./types";
import { createProgressReporter, ProgressReporter } from "../utils";
import { getSearchingUpdate } from "../updates";

const DEFAULT_RESULT_COUNT = 3;

type SearchConfigResult =
  | { ok: true; apiKey: string; apiUrl: string; provider: "searxng" }
  | { ok: false; reason: string };

type SearchResultItem = { title?: string; url?: string; description?: string };

const PLACEHOLDER_API_KEYS = new Set(["changeme", "searxng-api-key"]);
const MISSING_KEY_REASON = "Missing search API configuration.";
const MISSING_CONFIG_REASON = "Missing search API configuration.";

async function fetchSettingsWithTimeout(timeoutMs: number): Promise<Awaited<ReturnType<typeof import("@/lib/config/settingsCache").getSettings>> | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    import("@/lib/config/settingsCache")
      .then((mod) => mod.getSettings())
      .catch(() => null),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
  return result;
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

async function resolveSearchConfigFromSettings(): Promise<SearchConfigResult> {
  const settings = await fetchSettingsWithTimeout(500);

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

const webSearchTool = tool(
  async (
    { query, count, starting_index }: { query: string; count?: number; starting_index?: number },
    _config: RunnableConfig,
  ) => {
    const progress = createProgressReporter(_config, "web_search");
    progress.report(getSearchingUpdate());

    const result = await executeSearch(query, progress, count, starting_index);

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

async function executeSearch(
  query: string,
  progress: ProgressReporter,
  count?: number,
  startingIndex?: number,
): Promise<string> {
  const config = await resolveSearchConfigFromSettings();
  if (!config.ok) {
    return `Search tool is not configured (${config.reason})`;
  }

  progress.report(getSearchingUpdate());

  const result = await executeSearXNGSearch(query, count ?? DEFAULT_RESULT_COUNT, startingIndex ?? 1);

  progress.reset();

  return result;
}

export const webSearchToolFactory: ToolFactory = async () => {
  const isValid = await verifySearchConfigured();
  if (!isValid.ok) {
    return { ok: false, name: webSearchTool.name, reason: isValid.reason ?? "" };
  }
  return { ok: true, tool: webSearchTool, name: webSearchTool.name };
};
