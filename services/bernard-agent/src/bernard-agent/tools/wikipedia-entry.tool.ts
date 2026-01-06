import { tool } from "@langchain/core/tools";
import { z } from "zod";

import wiki from "wikipedia";

// The wikipedia package has an ESM/CJS interop issue where in ESM mode,
// the wiki function is exported at default.default instead of default
const wikipedia = (wiki as { default?: typeof wiki }).default ?? wiki;
import axios from "axios";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import { countTokensInText, sliceTokensFromText, DEFAULT_ENCODING } from "@/lib/tokenCounter";
import { ToolFactory } from "./types";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { createProgressReporter, ProgressReporter } from "../utils";
import { getReadingUpdate } from "../updates";

const TOOL_NAME = "wikipedia_entry";
const USER_AGENT = 'Bernard/1.0 (a.harms.haus; blake@harms.haus) wikipedia/2.4.2';

// Monkey patch the wikipedia library's request function to add User-Agent header
// This is needed because Wikipedia now blocks requests that only have Api-User-Agent
const originalGet = axios.get;
axios.get = (function(this: void, url: string, config?: AxiosRequestConfig): Promise<AxiosResponse> {
  const newConfig = {
    ...config,
    headers: {
      ...config?.headers,
      'Api-User-Agent': USER_AGENT
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
  max_tokens: number = 1500,
  progress: ProgressReporter,
): Promise<string> {
  
  wikipedia.setUserAgent(USER_AGENT);
  wikipedia.setLang('en');

  const page = await wikipedia.page(page_identifier, { redirect: true });
  progress(getReadingUpdate());
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
  async (
    { page_identifier, token_offset, max_tokens },
    config: LangGraphRunnableConfig,) => {
    const progress = createProgressReporter(config, TOOL_NAME);
    return executeWikipediaEntry(page_identifier, token_offset, max_tokens, progress);
  },
  {
    name: TOOL_NAME,
    description: "Retrieve text content from a specific Wikipedia article with token offset and length limits.",
    schema: z.object({
      page_identifier: z.string().min(1),
      token_offset: z.number().int().min(0).optional().default(0),
      max_tokens: z.number().int().min(1).max(10000).optional().default(1500)
    })
  }
);

export const wikipediaEntryToolFactory: ToolFactory = async () => {
  return { ok: true, tool: wikipediaEntryToolImpl, name: wikipediaEntryToolImpl.name };
};
