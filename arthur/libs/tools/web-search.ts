import { tool } from "@langchain/core/tools";
import { z } from "zod";

const SEARCH_API_URL =
  process.env.SEARCH_API_URL ?? "https://api.search.brave.com/res/v1/web/search";
const SEARCH_API_KEY = process.env.SEARCH_API_KEY ?? process.env.BRAVE_API_KEY;

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch (err) {
    return { error: "Failed to parse JSON response", detail: String(err) };
  }
}

export const webSearchTool = tool(
  async ({ query, count }) => {
    if (!SEARCH_API_KEY) {
      return "Search tool is not configured (missing SEARCH_API_KEY).";
    }
    const url = new URL(SEARCH_API_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(count ?? 3));

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${SEARCH_API_KEY}`
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

