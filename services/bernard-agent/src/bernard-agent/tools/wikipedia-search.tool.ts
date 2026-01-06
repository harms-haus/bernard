import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";

import wiki from "wikipedia";

// The wikipedia package has an ESM/CJS interop issue where in ESM mode,
// the wiki function is exported at default.default instead of default
const wikipedia = (wiki as { default?: typeof wiki }).default ?? wiki;

const USER_AGENT = 'Bernard/1.0 (a.harms.haus; blake@harms.haus) wikipedia/2.4.2';

import axios from 'axios';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import { ToolFactory } from "./types";
import { createProgressReporter, ProgressReporter } from "../utils";
import { getSearchingUpdate } from "../updates";

// Monkey patch the wikipedia library's request function to add User-Agent header
// This is needed because Wikipedia now blocks requests that only have Api-User-Agent
const originalGet = axios.get;
axios.get = (function(this: void, url: string, config?: AxiosRequestConfig): Promise<AxiosResponse> {
  const newConfig = {
    ...config,
    headers: {
    ...config?.headers,
      'Api-User-Agent': USER_AGENT,
      'User-Agent': USER_AGENT
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
  progress: ProgressReporter,
): Promise<string> {
  try {
    progress.report(getSearchingUpdate());

    wikipedia.setUserAgent(USER_AGENT);
    wikipedia.setLang('en');

    const searchResults = await wikipedia.search(query, {
      limit: n_results + starting_index,
    });
    
    const results: WikipediaSearchResult[] = (searchResults.results as WikipediaAPIResult[])
      .slice(starting_index)
      .map((result, index) => ({
        page_id: result.pageid,
        page_title: result.title,
        description: result.snippet || '',
        index: starting_index + index + 1
      }));
      
    progress.reset();

    return JSON.stringify(results);
  } catch (error) {
    return `Wikipedia search failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const wikipediaSearchToolImpl = tool(
  async (
    { query, n_results, starting_index }: { query: string; n_results?: number; starting_index?: number },
    _config: RunnableConfig,
  ) => {
    const result = await executeWikipediaSearch(query, n_results, starting_index, createProgressReporter(_config, "wikipedia_search"));
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
      starting_index: z.number().int().min(0).optional().default(0)
    })
  }
);

export const wikipediaSearchTool = Object.assign(wikipediaSearchToolImpl, {
  interpretationPrompt: ``
});

export const wikipediaSearchToolFactory: ToolFactory = async () => {
  return { ok: true, tool: wikipediaSearchTool, name: wikipediaSearchTool.name };
};
