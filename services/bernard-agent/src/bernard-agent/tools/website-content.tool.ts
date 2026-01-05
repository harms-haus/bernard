import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

import { logger } from "@/lib/logging";
import { countTokensInText, sliceTokensFromText } from "@/lib/tokenCounter";
import { getCachedContent, setCachedContent } from "@/lib/website";
import { verifySearchConfigured } from "./web-search.tool";
import { ToolFactory } from "./types";

const FETCH_TIMEOUT_MS = 10000; // 10 seconds
const DEFAULT_START_TOKENS = 0;
const DEFAULT_READ_TOKENS = 1500;

// Tool input/output types
interface GetWebsiteContentInput {
  uri: string;
  startTokens?: number;
  readTokens?: number;
  forceRefresh?: boolean;
}

interface GetWebsiteContentOutput {
  title: string;
  content: string;
  url: string;
  byline: string | null;
  totalTokens: number;
  returnedTokens: number;
  startTokens: number;
  readTokens: number;
  hasMore: boolean;
}

/**
 * Fetch HTML content from a URI with timeout
 */
async function fetchHtml(uri: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(uri, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VoiceAssistant/1.0)'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    return html;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout: website took too long to respond');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extract readable content from HTML using Readability
 */
function extractContent(html: string, uri: string): GetWebsiteContentOutput | null {
  try {
    const dom = new JSDOM(html, {
      url: uri,
      runScripts: 'outside-only' // Security: prevent script execution
    });

    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.textContent) {
      return null;
    }

    return {
      title: article.title || '',
      content: article.textContent,
      url: uri, // Readability doesn't provide URL, use original URI
      byline: article.byline || null,
      totalTokens: 0, // Will be calculated after extraction
      returnedTokens: 0, // Will be calculated after slicing
      startTokens: 0, // Will be set by caller
      readTokens: 0, // Will be set by caller
      hasMore: false // Will be calculated after slicing
    };
  } catch (error) {
    logger.error('Readability extraction failed: %s', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Validate URI format
 */
function validateUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

/**
 * Main tool implementation
 */
async function getWebsiteContent(
  input: GetWebsiteContentInput,
): Promise<string> {
  const {
    uri,
    startTokens = DEFAULT_START_TOKENS,
    readTokens = DEFAULT_READ_TOKENS,
    forceRefresh = false
  } = input;

  try {
    // Validate inputs
    if (!uri) {
      return 'Error: uri parameter is required';
    }

    if (!validateUri(uri)) {
      return 'Error: invalid URI format (must be http:// or https://)';
    }

    if (startTokens < 0) {
      return 'Error: startTokens must be >= 0';
    }

    if (readTokens <= 0) {
      return 'Error: readTokens must be > 0';
    }

    // Check cache first (unless force refresh)
    let cachedContent = getCachedContent(uri, forceRefresh);

    if (!cachedContent) {
      logger.info('Fetching website content: %s', uri);

      // Fetch HTML
      const html = await fetchHtml(uri);

      // Extract content with Readability
      const extracted = extractContent(html, uri);
      if (!extracted) {
        return 'Error: Could not extract readable content from the webpage';
      }

      // Cache the extracted content
      cachedContent = {
        content: extracted.content,
        title: extracted.title,
        url: extracted.url,
        byline: extracted.byline,
        timestamp: Date.now()
      };
      setCachedContent(uri, cachedContent);
    }

    // Count total tokens in the full content
    const totalTokens = countTokensInText(cachedContent.content);

    // Slice content by tokens
    const slicedContent = sliceTokensFromText(
      cachedContent.content,
      startTokens,
      readTokens
    );
    const returnedTokens = countTokensInText(slicedContent);

    // Calculate if more content is available
    const hasMore = (startTokens + readTokens) < totalTokens;

    // Format response as readable text
    const result: GetWebsiteContentOutput = {
      title: cachedContent.title,
      content: slicedContent,
      url: cachedContent.url,
      byline: cachedContent.byline,
      totalTokens,
      returnedTokens,
      startTokens,
      readTokens,
      hasMore
    };

    // Return human-readable summary
    return `**${result.title}**\n\n${result.content}\n\n---\nURL: ${result.url}${result.byline ? `\nBy: ${result.byline}` : ''}\nTokens: ${result.returnedTokens}/${result.totalTokens} (start: ${result.startTokens}, read: ${result.readTokens})${result.hasMore ? ' - More content available' : ''}`;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('getWebsiteContent failed: %s', errorMessage);
    return `Error: Failed to retrieve website content: ${errorMessage}`;
  }
}

// Tool definition with schema validation
const getWebsiteContentToolImpl = tool(
  async (
    { uri, startTokens, readTokens, forceRefresh }: GetWebsiteContentInput,
    config: RunnableConfig,
  ) => {
    try {
      const result = await getWebsiteContent({
        uri,
        startTokens: startTokens ?? DEFAULT_START_TOKENS,
        readTokens: readTokens ?? DEFAULT_READ_TOKENS,
        forceRefresh: forceRefresh ?? false,
      });
      return result;
    } catch (error) {
      throw error;
    }
  },
  {
    name: "get_website_content",
    description: "Extract and return readable content from a website using Readability.js. Supports token-based slicing for large articles.",
    schema: z.object({
      uri: z.string().url().describe("The website URL to extract content from"),
      startTokens: z.number().int().min(0).optional().default(DEFAULT_START_TOKENS).describe("Starting token position (0-based)"),
      readTokens: z.number().int().min(1).optional().default(DEFAULT_READ_TOKENS).describe("Number of tokens to read from start position"),
      forceRefresh: z.boolean().optional().default(false).describe("Force refresh cache even if content is still valid")
    })
  }
);

export const getWebsiteContentTool = Object.assign(getWebsiteContentToolImpl, {
  interpretationPrompt: `When the user asks about website content, summarize what was extracted and mention if more content is available.`
});

export const getWebsiteContentToolDefinition = {
  name: "get_website_content",
  type: "static" as const,
  tool: getWebsiteContentTool
};

export const getWebsiteContentToolFactory: ToolFactory = async () => {
  const isValid = await verifySearchConfigured();
  if (!isValid.ok) {
    return { ok: false, name: getWebsiteContentTool.name, reason: isValid.reason ?? "" };
  }
  return { ok: true, tool: getWebsiteContentTool, name: getWebsiteContentTool.name };
};
