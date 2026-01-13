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

export type WikipediaSearchResult = {
  page_id: number;
  page_title: string;
  description: string;
  index: number;
};

/**
 * Dependencies for the Wikipedia search tool.
 */
export interface WikipediaDependencies {
  resolveSearchConfig: typeof resolveSearchConfig;
  buildSearXNGUrl: typeof buildSearXNGUrl;
  safeJson: typeof safeJson;
  parseSearXNGResults: typeof parseSearXNGResults;
  fetch: typeof fetch;
  createProgressReporter: typeof createProgressReporter;
  getSearchingUpdate: typeof getSearchingUpdate;
}

async function executeWikipediaSearch(
  query: string,
  n_results: number,
  starting_index: number,
  progress: ProgressReporter,
  deps: WikipediaDependencies,
): Promise<string> {
  try {
    progress.report(deps.getSearchingUpdate());

    const config = await deps.resolveSearchConfig();
    if (!config.ok) {
      return `Wikipedia search tool is not configured (${config.reason})`;
    }

    const url = deps.buildSearXNGUrl(config.apiUrl, query, n_results + starting_index, starting_index + 1, "site:wikipedia.org");

    const response = await deps.fetch(url, {
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const body = await response.text();
      return `Wikipedia search failed: ${response.status} ${response.statusText}`;
    }

    const data = await deps.safeJson(response);
    const rawResults = deps.parseSearXNGResults(data);

    const results: WikipediaSearchResult[] = rawResults
      .slice(starting_index)
      .map((item: SearchResultItem, idx: number) => ({
        page_id: idx + 1,
        page_title: item.title ?? "",
        description: item.description ?? "",
        index: starting_index + idx + 1,
      }));

    progress.reset();

    return JSON.stringify(results);
  } catch (error) {
    return `Wikipedia search failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Create the Wikipedia search tool with injected dependencies.
 */
export function createWikipediaSearchTool(deps: WikipediaDependencies) {
  const toolImpl = tool(
    async (
      { query, n_results, starting_index }: { query: string; n_results?: number; starting_index?: number },
      _config: RunnableConfig,
    ) => {
      const progress = deps.createProgressReporter(_config, "wikipedia_search");
      return executeWikipediaSearch(
        query,
        n_results ?? 10,
        starting_index ?? 0,
        progress,
        deps,
      );
    },
    {
      name: "wikipedia_search",
      description: `Search Wikipedia for articles by title or topic.`,
      schema: z.object({
        query: z.string().min(1),
        n_results: z.number().int().min(1).max(50).optional().default(10),
        starting_index: z.number().int().min(0).optional().default(0),
      }),
    },
  );

  return Object.assign(toolImpl, {
    interpretationPrompt: ``,
  });
}

/**
 * Create the Wikipedia search tool factory with optional dependency overrides.
 */
export function createWikipediaSearchToolFactory(
  overrides?: Partial<WikipediaDependencies>
): ToolFactory {
  const defaultDependencies: WikipediaDependencies = {
    resolveSearchConfig,
    buildSearXNGUrl,
    safeJson,
    parseSearXNGResults,
    fetch,
    createProgressReporter,
    getSearchingUpdate,
  };

  const deps = { ...defaultDependencies, ...overrides };

  return async () => {
    const tool = createWikipediaSearchTool(deps);
    return { ok: true, tool, name: tool.name };
  };
}

/**
 * Default factory for backward compatibility.
 */
export const wikipediaSearchToolFactory = createWikipediaSearchToolFactory();

/**
 * Wikipedia search tool instance for backward compatibility.
 */
export const wikipediaSearchTool = createWikipediaSearchTool({
  resolveSearchConfig,
  buildSearXNGUrl,
  safeJson,
  parseSearXNGResults,
  fetch,
  createProgressReporter,
  getSearchingUpdate,
});
