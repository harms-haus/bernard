import { tool } from "@langchain/core/tools";
import { z } from "zod";

import wiki from "wikipedia";

// Set user agent for Wikipedia API requests (required by Wikipedia's policy)
// Note: Wikipedia now requires both Api-User-Agent and User-Agent headers for anti-bot measures
wiki.setUserAgent("Bernard-AI/1.0 (https://github.com/your-repo/bernard)");

// Monkey patch the wikipedia library's request function to add User-Agent header
// This is needed because Wikipedia now blocks requests that only have Api-User-Agent
const axios = require('axios');
const originalGet = axios.default.get;
axios.default.get = function(url: string, config?: any) {
  const newConfig = {
    ...config,
    headers: {
      ...config?.headers,
      'User-Agent': 'Bernard-AI/1.0 (compatible; Wikipedia-API/1.0)'
    }
  };
  return originalGet(url, newConfig);
};

type WikipediaSearchResult = {
  page_id: number;
  page_title: string;
  description: string;
  index: number;
};

type WikipediaEntryResult = {
  n_chars: number;
  content: string;
  n_next_chars: number;
};

/**
 * Execute Wikipedia search using the wikipedia package
 */
async function executeWikipediaSearch(query: string, n_results: number = 10): Promise<string> {
  try {
    const searchResults = await wiki.search(query, { limit: n_results });
    const results: WikipediaSearchResult[] = searchResults.results.map((result, index) => ({
      page_id: result.pageid,
      page_title: result.title,
      description: result.snippet || '',
      index: index + 1
    }));
    return JSON.stringify(results);
  } catch (error) {
    return `Wikipedia search failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Execute Wikipedia entry retrieval using the wikipedia package
 */
async function executeWikipediaEntry(
  page_identifier: string,
  char_offset: number = 0,
  max_chars: number = 1500
): Promise<string> {
  try {
    const page = await wiki.page(page_identifier, { redirect: true });
    const fullContent = await page.content({ redirect: true });

    // Ensure char_offset doesn't exceed content length
    const startPos = Math.min(char_offset, fullContent.length);
    const endPos = Math.min(startPos + max_chars, fullContent.length);

    const content = fullContent.slice(startPos, endPos);
    const n_chars = content.length;
    const n_next_chars = fullContent.length - endPos;

    const result: WikipediaEntryResult = { n_chars, content, n_next_chars };
    return JSON.stringify(result);
  } catch (error) {
    return `Wikipedia entry failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const wikipediaSearchToolImpl = tool(
  async ({ query, n_results }) => {
    return executeWikipediaSearch(query, n_results);
  },
  {
    name: "wikipedia_search",
    description: "Search Wikipedia for articles matching a query.",
    schema: z.object({
      query: z.string().min(1),
      n_results: z.number().int().min(1).max(50).optional().default(10)
    })
  }
);

const wikipediaEntryToolImpl = tool(
  async ({ page_identifier, char_offset, max_chars }) => {
    return executeWikipediaEntry(page_identifier, char_offset, max_chars);
  },
  {
    name: "wikipedia_entry",
    description: "Retrieve content from a specific Wikipedia page with character offset and length limits.",
    schema: z.object({
      page_identifier: z.string().min(1),
      char_offset: z.number().int().min(0).optional().default(0),
      max_chars: z.number().int().min(1).max(10000).optional().default(1500)
    })
  }
);

export const wikipediaSearchTool = Object.assign(wikipediaSearchToolImpl, {
  interpretationPrompt: ``
});

export const wikipediaEntryTool = Object.assign(wikipediaEntryToolImpl, {
  interpretationPrompt: ``
});
