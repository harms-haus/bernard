/* eslint-disable @typescript-eslint/unbound-method */
import { tool } from "@langchain/core/tools";
import { z } from "zod";

import wiki from "wikipedia";
import axios from "axios";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import { countTokensInText, sliceTokensFromText, DEFAULT_ENCODING } from "@/lib/conversation/tokenCounter";

// Set user agent for Wikipedia API requests (required by Wikipedia's policy)
// Note: Wikipedia now requires both Api-User-Agent and User-Agent headers for anti-bot measures
wiki.setUserAgent("Bernard-AI/1.0 (https://github.com/your-repo/bernard)");

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

type WikipediaEntryResult = {
  n_tokens: number;
  content: string;
  n_next_tokens: number;
};

/**
 * Execute Wikipedia entry retrieval using the wikipedia package
 */
async function executeWikipediaEntry(
  page_identifier: string,
  token_offset: number = 0,
  max_tokens: number = 1500
): Promise<string> {
  const page = await wiki.page(page_identifier, { redirect: true });
  const fullContent = await page.content({ redirect: true });

  // Use token-based slicing instead of character-based slicing
  const totalTokens = countTokensInText(fullContent, DEFAULT_ENCODING);

  // If the offset is beyond the total tokens, return the last max_tokens tokens
  // This maintains backward compatibility and provides better UX for pagination
  const effectiveOffset = Math.min(token_offset, Math.max(0, totalTokens - max_tokens));

  const content = sliceTokensFromText(fullContent, effectiveOffset, max_tokens, DEFAULT_ENCODING);
  const n_tokens = countTokensInText(content, DEFAULT_ENCODING);
  const n_next_tokens = Math.max(0, totalTokens - effectiveOffset - n_tokens);

  const result: WikipediaEntryResult = { n_tokens, content, n_next_tokens };
  return JSON.stringify(result);
}

const wikipediaEntryToolImpl = tool(
  async ({ page_identifier, token_offset, max_tokens }) => {
    return executeWikipediaEntry(page_identifier, token_offset, max_tokens);
  },
  {
    name: "wikipedia_entry",
    description: "Retrieve text content from a specific Wikipedia article with token offset and length limits.",
    schema: z.object({
      page_identifier: z.string().min(1),
      token_offset: z.number().int().min(0).optional().default(0),
      max_tokens: z.number().int().min(1).max(10000).optional().default(1500)
    })
  }
);

export const wikipediaEntryTool = Object.assign(wikipediaEntryToolImpl, {
  interpretationPrompt: ``
});
/* eslint-enable @typescript-eslint/unbound-method */
