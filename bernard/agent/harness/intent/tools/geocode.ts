import { tool } from "@langchain/core/tools";
import { z } from "zod";

const GEOCODE_API_URL =
  process.env["NOMINATIM_URL"] ?? "https://nominatim.openstreetmap.org/search";
const GEOCODE_USER_AGENT = process.env["NOMINATIM_USER_AGENT"];
const GEOCODE_EMAIL = process.env["NOMINATIM_EMAIL"];
const GEOCODE_REFERER = process.env["NOMINATIM_REFERER"];

const verifyGeocodeConfigured = () => ({
  ok: Boolean(GEOCODE_USER_AGENT),
  reason: "Missing NOMINATIM_USER_AGENT (required by Nominatim usage policy)."
});

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch (err) {
    return { error: "Failed to parse JSON response", detail: String(err) };
  }
}

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

function isNominatimPlace(value: unknown): value is NominatimPlace {
  return typeof value === "object" && value !== null;
}

function normalizeLabel(place: NominatimPlace): string {
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
}

function formatCoordinate(value?: string): string {
  if (!value) return "?";
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(5) : "?";
}

const geocodeToolImpl = tool(
  async ({ query, limit, country, language }) => {
    if (!GEOCODE_USER_AGENT) {
      return "Geocoding tool is not configured (missing NOMINATIM_USER_AGENT).";
    }

    const url = new URL(GEOCODE_API_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", String(limit ?? 3));
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("dedupe", "1");
    url.searchParams.set("polygon_geojson", "0");
    url.searchParams.set("extratags", "0");
    if (country) url.searchParams.set("countrycodes", country.toLowerCase());
    if (language) url.searchParams.set("accept-language", language);
    if (GEOCODE_EMAIL) url.searchParams.set("email", GEOCODE_EMAIL);

    const res = await fetch(url, {
      headers: {
        "User-Agent": GEOCODE_USER_AGENT,
        ...(GEOCODE_REFERER ? { Referer: GEOCODE_REFERER } : {})
      }
    });

    if (!res.ok) {
      const body = await res.text();
      return `Geocoding failed: ${res.status} ${res.statusText} ${body}`;
    }

    const data = await safeJson(res);
    const places = Array.isArray(data) ? data.filter(isNominatimPlace) : [];
    if (!places.length) return "No locations found.";

    const summary = places
      .slice(0, limit ?? 3)
      .map((place, idx) => {
        const label = normalizeLabel(place);
        const lat = formatCoordinate(place.lat);
        const lon = formatCoordinate(place.lon);
        const kind = place.type ?? place.class;
        const importance = place.importance ? `, score ${place.importance.toFixed(2)}` : "";
        return `${idx + 1}. ${label} — ${lat}, ${lon}${kind ? ` (${kind})` : ""}${importance}`;
      })
      .join("\n");

    return summary;
  },
  {
    name: "geocode_search",
    description: "Look up latitude/longitude for a place name using OpenStreetMap Nominatim.",
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

export const geocodeSearchTool = Object.assign(geocodeToolImpl, {
  verifyConfiguration: verifyGeocodeConfigured
});



