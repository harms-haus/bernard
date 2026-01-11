import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";

import {
  resolveSearchConfig,
  buildSearXNGUrl,
  safeJson,
  parseSearXNGResults,
  SearchResultItem,
} from "@/lib/searxng";
import { ToolFactory } from "./types";
import { createProgressReporter, ProgressReporter } from "../utils";
import { getSearchingUpdate } from "../updates";

type WikipediaSearchResult = {
  page_id: number;
  page_title: string;
  description: string;
  index: number;
};

async function executeWikipediaSearch(
  query: string,
  n_results: number = 10,
  starting_index: number = 0,
  progress: ProgressReporter,
): Promise<string> {
  try {
    progress.report(getSearchingUpdate());

    const config = await resolveSearchConfig();
    if (!config.ok) {
      return `Wikipedia search tool is not configured (${config.reason})`;
    }

    const url = buildSearXNGUrl(config.apiUrl, query, n_results + starting_index, starting_index + 1, "site:wikipedia.org");

    const response = await fetch(url, {
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const body = await response.text();
      return `Wikipedia search failed: ${response.status} ${response.statusText}`;
    }

    const data = await safeJson(response);
    const rawResults = parseSearXNGResults(data);

    const results: WikipediaSearchResult[] = rawResults
      .slice(starting_index)
      .map((item: SearchResultItem, idx: number) => ({
        page_id: idx + 1,
        page_title: item.title ?? "",
        description: item.description ?? "",
        index: starting_index + idx + 1,
      }));

    progress.reset();

    // CRITICAL: Ensure proper JSON stringification
    const jsonString = JSON.stringify(results);
    console.log("[wikipedia-search] JSON.stringify result type:", typeof jsonString);
    console.log("[wikipedia-search] JSON output length:", jsonString.length);
    console.log("[wikipedia-search] First 200 chars:", jsonString.substring(0, 200));
    console.log("[wikipedia-search] Result is valid JSON:", jsonString.startsWith("["));

    return jsonString;
  } catch (error) {
    console.log("[wikipedia-search] Error:", error);
    return `Wikipedia search failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const wikipediaSearchToolImpl = tool(
  async (
    { query, n_results, starting_index }: { query: string; n_results?: number; starting_index?: number },
    _config: RunnableConfig,
  ) => {
    const result = await executeWikipediaSearch(query, n_results, starting_index, createProgressReporter(_config, "wikipedia_search"));
    console.log("[wikipedia-search] Tool returning:", typeof result, result?.substring?.(0, 100));
    return result;
  },
  {
    name: "wikipedia_search",
    description: `Search Wikipedia for articles by title or topic.
 e.g. for finding information about a specific person, place, animal, event, category, etc.
 e.g. "What is the capital of France?" -> "France", "Who was the 8th president of the United States?" -> "United States Presidents`,
    schema: z.object({
      query: z.string().min(1),
      n_results: z.number().int().min(1).max(50).optional().default(10),
      starting_index: z.number().int().min(0).optional().default(0),
    }),
  },
);

export const wikipediaSearchTool = Object.assign(wikipediaSearchToolImpl, {
  interpretationPrompt: ``,
});

export const wikipediaSearchToolFactory: ToolFactory = async () => {
  return { ok: true, tool: wikipediaSearchTool, name: wikipediaSearchTool.name };
};
