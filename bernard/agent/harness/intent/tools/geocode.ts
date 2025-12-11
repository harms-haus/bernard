import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { getSettings } from "@/lib/settingsCache";
import type { RecordKeeper } from "@/lib/recordKeeper";

const DEFAULT_GEOCODE_API_URL = "https://nominatim.openstreetmap.org/search";
const MISSING_USER_AGENT_REASON =
  "Missing NOMINATIM_USER_AGENT (required by Nominatim usage policy).";

type GeocodeConfig = {
  apiUrl: string;
  userAgent?: string;
  email?: string;
  referer?: string;
};

type Address = {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  county?: string;
  state?: string;
  country?: string;
  country_code?: string;
};

type NominatimPlace = {
  display_name?: string;
  lat?: string;
  lon?: string;
  class?: string;
  type?: string;
  importance?: number;
  address?: Address;
};

type GeocodeDeps = {
  fetchImpl?: typeof fetch;
  configLoader?: () => Promise<GeocodeConfig>;
  jsonParser?: (res: Response) => Promise<unknown>;
};

type ToolRunContext = {
  recordKeeper?: RecordKeeper;
  turnId?: string;
};

type GeocodeErrorResult = {
  status: "error";
  message: string;
  errorType?: string;
};

const loadConfig = async (): Promise<GeocodeConfig> => {
  const settings = await getSettings().catch(() => null);
  const svc = settings?.services.geocoding;
  return {
    apiUrl: svc?.url ?? process.env["NOMINATIM_URL"] ?? DEFAULT_GEOCODE_API_URL,
    userAgent: svc?.userAgent ?? process.env["NOMINATIM_USER_AGENT"],
    email: svc?.email ?? process.env["NOMINATIM_EMAIL"],
    referer: svc?.referer ?? process.env["NOMINATIM_REFERER"]
  };
};

const safeJson = async (res: Response): Promise<unknown> => {
  try {
    return await res.json();
  } catch (err) {
    return { error: "Failed to parse JSON response", detail: String(err) };
  }
};

const makeVerifyGeocodeConfigured =
  (configLoader: () => Promise<GeocodeConfig>) => async () => {
    const config = await configLoader();
    return {
      ok: Boolean(config.userAgent),
      reason: MISSING_USER_AGENT_REASON
    };
  };

const isNominatimPlace = (value: unknown): value is NominatimPlace =>
  typeof value === "object" && value !== null;

const normalizeLabel = (place: NominatimPlace): string => {
  const address = place.address;
  const locality = address?.city ?? address?.town ?? address?.village ?? address?.hamlet;
  const region = address?.state ?? address?.county;
  const country =
    address?.country ??
    (address?.country_code ? address.country_code.toUpperCase() : undefined);

  const compact = [locality, region, country].filter(Boolean).join(", ");
  if (compact) return compact;

  const raw = place.display_name ?? "Unknown location";
  return raw.split(",").slice(0, 3).join(", ").trim() || raw;
};

const formatCoordinate = (value?: string): string => {
  if (!value) return "?";
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(5) : "?";
};

const buildGeocodeUrl = (
  params: { query: string; limit?: number; country?: string; language?: string },
  config: GeocodeConfig
): URL => {
  const url = new URL(config.apiUrl);
  url.searchParams.set("q", params.query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(params.limit ?? 3));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("dedupe", "1");
  url.searchParams.set("polygon_geojson", "0");
  url.searchParams.set("extratags", "0");
  if (params.country) url.searchParams.set("countrycodes", params.country.toLowerCase());
  if (params.language) url.searchParams.set("accept-language", params.language);
  return url;
};

const buildHeaders = (config: GeocodeConfig): HeadersInit => ({
  "User-Agent": config.userAgent ?? "",
  ...(config.referer ? { Referer: config.referer } : {})
});

const parsePlaces = (data: unknown): NominatimPlace[] =>
  Array.isArray(data) ? data.filter(isNominatimPlace) : [];

const extractJsonError = (data: unknown): string | null => {
  if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
    const payload = data as { error?: unknown; detail?: unknown };
    const detail = payload.detail ? ` (${String(payload.detail)})` : "";
    return `${String(payload.error)}${detail}`;
  }
  return null;
};

const formatPlaceSummary = (place: NominatimPlace, idx: number): string => {
  const label = normalizeLabel(place);
  const lat = formatCoordinate(place.lat);
  const lon = formatCoordinate(place.lon);
  const kind = place.type ?? place.class;
  const importance = place.importance ? `, score ${place.importance.toFixed(2)}` : "";
  return `${idx + 1}. ${label} — ${lat}, ${lon}${kind ? ` (${kind})` : ""}${importance}`;
};

const summarizePlaces = (places: NominatimPlace[], limit: number): string =>
  places
    .slice(0, limit)
    .map((place, idx) => formatPlaceSummary(place, idx))
    .join("\n");

const getToolRunContext = (runOpts?: unknown): ToolRunContext => {
  const configurable = (runOpts as { configurable?: ToolRunContext } | undefined)?.configurable;
  return {
    recordKeeper: configurable?.recordKeeper,
    turnId: configurable?.turnId
  };
};

const logNetworkError = async (ctx: ToolRunContext, latencyMs: number, errorType: string) => {
  if (!ctx.recordKeeper || !ctx.turnId) return;
  await ctx.recordKeeper.recordToolResult(ctx.turnId, "geocode_search", {
    ok: false,
    latencyMs,
    errorType
  });
};

const createGeocodeTool = (deps: GeocodeDeps = {}) => {
  const {
    fetchImpl = fetch,
    configLoader = loadConfig,
    jsonParser = safeJson
  } = deps;

  const geocodeTool = tool(
    async ({ query, limit, country, language }, runOpts?: unknown) => {
      const config = await configLoader();
      if (!config.userAgent) {
        return "Geocoding tool is not configured (missing NOMINATIM_USER_AGENT).";
      }

      const url = buildGeocodeUrl({ query, limit, country, language }, config);
      if (config.email) url.searchParams.set("email", config.email);

      const startedAt = Date.now();
      try {
        const res = await fetchImpl(url, {
          headers: buildHeaders(config)
        });

        if (!res.ok) {
          const body = await res.text();
          return `Geocoding failed: ${res.status} ${res.statusText} ${body}`;
        }

        const data = await jsonParser(res);
        const jsonError = extractJsonError(data);
        if (jsonError) return jsonError;

        const places = parsePlaces(data);
        if (!places.length) return "No locations found.";

        return summarizePlaces(places, limit ?? 3);
      } catch (err) {
        const elapsed = Date.now() - startedAt;
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorType = err instanceof Error ? err.name : "error";
        await logNetworkError(getToolRunContext(runOpts), elapsed, errorType);
        const result: GeocodeErrorResult = {
          status: "error",
          message: `Geocoding failed: network error: ${errorMessage}`,
          errorType
        };
        return result;
      }
    },
    {
      name: "geocode_search",
      description:
        "Look up latitude/longitude for a place name using OpenStreetMap Nominatim.",
      schema: z.object({
        query: z.string().min(3).describe("Place name or address to geocode."),
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

  return Object.assign(geocodeTool, {
    verifyConfiguration: makeVerifyGeocodeConfigured(configLoader)
  });
};

const geocodeSearchTool = createGeocodeTool();

export {
  createGeocodeTool,
  geocodeSearchTool,
  buildGeocodeUrl,
  buildHeaders,
  summarizePlaces,
  formatPlaceSummary,
  normalizeLabel,
  formatCoordinate,
  extractJsonError,
  parsePlaces
};



