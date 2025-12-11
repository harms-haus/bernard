import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { getSettings } from "@/lib/settingsCache";

const DEFAULT_SEARCH_API_URL = "https://api.search.brave.com/res/v1/web/search";
const PLACEHOLDER_API_KEYS = new Set(["brave-api-key", "changeme"]);

type SearchConfigResult =
  | { ok: true; apiKey: string; apiUrl: string }
  | { ok: false; reason: string };

async function resolveSearchConfig(): Promise<SearchConfigResult> {
  const settings = await getSettings().catch(() => null);
  const svc = settings?.services.search;
  const rawKey = svc?.apiKey ?? process.env["SEARCH_API_KEY"] ?? process.env["BRAVE_API_KEY"];
  const apiKey = rawKey?.trim();
  if (!apiKey) {
    return { ok: false, reason: "Missing SEARCH_API_KEY or BRAVE_API_KEY." };
  }
  if (PLACEHOLDER_API_KEYS.has(apiKey.toLowerCase())) {
    return { ok: false, reason: "Replace SEARCH_API_KEY/BRAVE_API_KEY with a real token." };
  }

  const rawUrlEnv = svc?.apiUrl ?? process.env["SEARCH_API_URL"];
  const rawUrl = (rawUrlEnv ?? DEFAULT_SEARCH_API_URL).trim();
  if (!rawUrl) {
    return { ok: false, reason: "SEARCH_API_URL is empty or missing." };
  }

  try {
    const parsedUrl = new URL(rawUrl);
    return { ok: true, apiKey, apiUrl: parsedUrl.toString() };
  } catch {
    return { ok: false, reason: "Invalid SEARCH_API_URL (must be an absolute URL)." };
  }
}

const verifySearchConfigured = async () => {
  const config = await resolveSearchConfig();
  return config.ok ? { ok: true } : { ok: false, reason: config.reason };
};

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch (err) {
    return { error: "Failed to parse JSON response", detail: String(err) };
  }
}

const webSearchToolImpl = tool(
  async ({ query, count }) => {
    const config = await resolveSearchConfig();
    if (!config.ok) {
      return `Search tool is not configured (${config.reason})`;
    }
    const url = new URL(config.apiUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(count ?? 3));

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`
      }
    });

    if (!res.ok) {
      const body = await res.text();
      return `Search failed: ${res.status} ${res.statusText} ${body}`;
    }

    const data = (await safeJson(res)) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };

    const items = data.web?.results ?? [];
    if (!items.length) return "No results.";

    const summary = items
      .slice(0, count ?? 3)
      .map(
        (item, idx) => `${idx + 1}. ${item.title ?? "Untitled"} — ${item.url ?? ""} :: ${item.description ?? ""}`
      )
      .join("\n");

    return summary;
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



