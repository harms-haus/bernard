/* eslint-disable @typescript-eslint/unbound-method */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import { createProgressReporter } from "./progress.js";

import wiki from "wikipedia";

import axios from 'axios';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

// Monkey patch the wikipedia library's request function to add User-Agent header
// This is needed because Wikipedia now blocks requests that only have Api-User-Agent
const originalGet = axios.get;
axios.get = (function(this: void, url: string, config?: AxiosRequestConfig): Promise<AxiosResponse> {
  const newConfig = {
    ...config,
    headers: {
      ...config?.headers,
      'User-Agent': 'Bernard-AI/1.0 (compatible; Wikipedia-API/1.0)'
    }
  } as AxiosRequestConfig;
  return originalGet(url, newConfig);
} as typeof axios.get);

type WikipediaSearchResult = {
  page_id: number;
  page_title: string;
  description: string;
  index: number;
};

// Type for raw Wikipedia API result
interface WikipediaAPIResult {
  pageid: number;
  title: string;
  snippet?: string;
}

/**
 * Execute Wikipedia search using the wikipedia package
 */
async function executeWikipediaSearch(
  query: string,
  n_results: number = 10,
  starting_index: number = 0,
  progress?: ReturnType<typeof createProgressReporter>,
): Promise<string> {
  try {
    if (progress) {
      progress.progress(1, 2, `Searching Wikipedia for "${query}"`);
    }

    const searchResults = await wiki.search(query, {
      limit: n_results + starting_index
    });
    
    const results: WikipediaSearchResult[] = (searchResults.results as WikipediaAPIResult[])
      .slice(starting_index)
      .map((result, index) => ({
        page_id: result.pageid,
        page_title: result.title,
        description: result.snippet || '',
        index: starting_index + index + 1
      }));

    if (progress) {
      progress.complete(`Retrieved ${results.length} Wikipedia results`);
    }

    return JSON.stringify(results);
  } catch (error) {
    if (progress) {
      progress.error(error instanceof Error ? error : new Error(String(error)));
    }
    return `Wikipedia search failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const wikipediaSearchToolImpl = tool(
  async (
    { query, n_results, starting_index }: { query: string; n_results?: number; starting_index?: number },
    config: RunnableConfig,
  ) => {
    const progress = createProgressReporter(config, "wikipedia_search");

    progress.start(`Searching Wikipedia for "${query}"`);

    try {
      const result = await executeWikipediaSearch(query, n_results, starting_index, progress);
      return result;
    } catch (error) {
      progress.error(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  },
  {
    name: "wikipedia_search",
    description: `Search Wikipedia for articles by title or topic.
 e.g. for finding information about a specific person, place, animal, event, category, etc.
 e.g. "What is the capital of France?" -> "France", "Who was the 8th president of the United States?" -> "United States Presidents`,
    schema: z.object({
      query: z.string().min(1),
      n_results: z.number().int().min(1).max(50).optional().default(10),
      starting_index: z.number().int().min(0).optional().default(0)
    })
  }
);

export const wikipediaSearchTool = Object.assign(wikipediaSearchToolImpl, {
  interpretationPrompt: ``
});
/* eslint-enable @typescript-eslint/unbound-method */
