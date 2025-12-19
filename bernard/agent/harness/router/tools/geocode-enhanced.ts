import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { getSettings } from "@/lib/config/settingsCache";
import type { RecordKeeper } from "@/lib/conversation/recordKeeper";
import { createGeocodeTool } from "./geocode";

const DEFAULT_GEOCODE_API_URL = "https://nominatim.openstreetmap.org/search";
const MISSING_USER_AGENT_REASON =
  "Missing NOMINATIM_USER_AGENT (required by Nominatim usage policy).";

type GeocodeConfig = {
  apiUrl: string;
  userAgent?: string;
  email?: string;
  referer?: string;
};

type EnhancedGeocodeDeps = {
  fetchImpl?: typeof fetch;
  configLoader?: () => Promise<GeocodeConfig>;
  jsonParser?: (res: Response) => Promise<unknown>;
  conversationContext?: string[];
};

type ToolRunContext = {
  recordKeeper?: RecordKeeper;
  turnId?: string;
  conversationMessages?: any[];
};

const loadConfig = async (): Promise<GeocodeConfig> => {
  const settings = await getSettings().catch(() => null);
  const svc = settings?.services.geocoding;
  const userAgent = svc?.userAgent ?? process.env["NOMINATIM_USER_AGENT"];
  const email = svc?.email ?? process.env["NOMINATIM_EMAIL"];
  const referer = svc?.referer ?? process.env["NOMINATIM_REFERER"];

  return {
    apiUrl: svc?.url ?? process.env["NOMINATIM_URL"] ?? DEFAULT_GEOCODE_API_URL,
    ...(userAgent ? { userAgent } : {}),
    ...(email ? { email } : {}),
    ...(referer ? { referer } : {})
  };
};

const getToolRunContext = (runOpts?: unknown): ToolRunContext => {
  const configurable = (runOpts as { configurable?: ToolRunContext } | undefined)?.configurable;
  const recordKeeper = configurable?.recordKeeper;
  const turnId = configurable?.turnId;
  const conversationMessages = configurable?.conversationMessages;

  return {
    ...(recordKeeper ? { recordKeeper } : {}),
    ...(turnId ? { turnId } : {}),
    ...(conversationMessages ? { conversationMessages } : {})
  };
};

/**
 * Extract potential location information from conversation context
 */
function extractLocationFromContext(context: any[] = []): string | null {
  if (!context || !context.length) return null;

  // Look for location patterns in the conversation
  const locationPatterns = [
    /\b(in|at|near|around)\s+([\w\s,]+)\b/i,
    /\b([\w\s]+)\s+(weather|forecast|temperature)\b/i,
    /\b(weather|forecast|temperature)\s+(in|for)\s+([\w\s,]+)\b/i,
    /\b([A-Za-z\s]+),\s*([A-Z]{2})\b/,
    /\b([A-Za-z\s]+)\s+([A-Z]{2})\b/
  ];

  // Check messages in reverse order (most recent first)
  for (let i = context.length - 1; i >= 0; i--) {
    const message = context[i];
    const content = message.content ?? "";
    const text = typeof content === "string" ? content : JSON.stringify(content);

    for (const pattern of locationPatterns) {
      const match = text.match(pattern);
      if (match) {
        // Try to extract the location part
        for (let j = 1; j < match.length; j++) {
          const matchPart = match[j];
          if (matchPart && typeof matchPart === "string" && matchPart.trim().length >= 3) {
            return matchPart.trim();
          }
        }
      }
    }

    // Also check for direct location mentions
    const directMatches = text.match(/\b([A-Za-z\s]{3,}),\s*([A-Z]{2})\b/);
    if (directMatches && directMatches[0]) {
      return directMatches[0].trim();
    }
  }

  return null;
}

const createEnhancedGeocodeTool = (deps: EnhancedGeocodeDeps = {}) => {
  const {
    fetchImpl = fetch,
    configLoader = loadConfig,
    jsonParser,
    conversationContext
  } = deps;

  // Create the base geocode tool
  const baseGeocodeTool = createGeocodeTool({
    fetchImpl,
    configLoader,
    jsonParser: jsonParser ?? (async (res: Response): Promise<unknown> => {
      try {
        return await res.json();
      } catch (err) {
        return { error: "Failed to parse JSON response", detail: String(err) };
      }
    })
  });

  const enhancedGeocodeTool = tool(
    async ({ query, limit, country, language }, runOpts?: unknown) => {
      const config = await configLoader();
      if (!config.userAgent) {
        return "Geocoding tool is not configured (missing NOMINATIM_USER_AGENT).";
      }

      // Get conversation context
      const ctx = getToolRunContext(runOpts);
      const extractedQuery = query ?? extractLocationFromContext(ctx.conversationMessages);

      // If we still don't have a query, return an error
      if (!extractedQuery || typeof extractedQuery !== "string" || extractedQuery.trim().length < 3) {
        return "Error: No valid location provided for geocoding. Please specify a location.";
      }

      // Use the base geocode tool with the extracted query
      return baseGeocodeTool.invoke({
        query: extractedQuery,
        limit,
        country,
        language
      });
    },
    {
      name: "geocode_search",
      description: 
        "Look up latitude/longitude for a place name using OpenStreetMap Nominatim. Can extract location from conversation context if not explicitly provided.",
      schema: z.object({
        query: z
          .string()
          .min(3)
          .optional()
          .describe("Place name or address to geocode. If not provided, will attempt to extract from conversation context."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe("How many matches to return (max 5)."),
        country: z
          .string()
          .regex(/^[A-Za-z]{2}$/)
          .optional()
          .describe("Optional ISO 3166-1 alpha-2 country filter (e.g., US, DE)."),
        language: z
          .string()
          .min(2)
          .max(10)
          .optional()
          .describe("Preferred language code for results (e.g., en, fr).")
      })
    }
  );

  return Object.assign(enhancedGeocodeTool, {
    verifyConfiguration: baseGeocodeTool.verifyConfiguration
  });
};

const enhancedGeocodeSearchTool = createEnhancedGeocodeTool();

export {
  createEnhancedGeocodeTool,
  enhancedGeocodeSearchTool,
  extractLocationFromContext
};