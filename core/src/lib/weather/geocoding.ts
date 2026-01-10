import { getSettings } from '../../lib/config/settingsCache'

const DEFAULT_GEOCODE_API_URL = "https://nominatim.openstreetmap.org/search";
const MISSING_USER_AGENT_REASON =
  "Missing NOMINATIM_USER_AGENT (required by Nominatim usage policy).";

export type GeocodeConfig = {
  apiUrl: string;
  userAgent?: string;
  email?: string;
  referer?: string;
};

export type GeocodeResult = {
  display_name: string;
  lat: string;
  lon: string;
  [key: string]: unknown;
};

export async function loadGeocodeConfig(): Promise<GeocodeConfig> {
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
}

export function buildGeocodeUrl(
  query: string,
  limit: number = 5,
  country?: string,
  language?: string,
  config: GeocodeConfig = { apiUrl: DEFAULT_GEOCODE_API_URL }
): URL {
  const url = new URL(config.apiUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(Math.min(limit, 10))); // Nominatim allows max 10

  if (country) {
    url.searchParams.set("countrycodes", country.toUpperCase());
  }

  if (language) {
    url.searchParams.set("accept-language", language);
  }

  return url;
}

export async function geocodeLocation(
  query: string,
  options: {
    limit?: number;
    country?: string;
    language?: string;
    config?: GeocodeConfig;
    timeoutMs?: number;
  } = {}
): Promise<{ ok: true; results: GeocodeResult[] } | { ok: false; error: string }> {
  const {
    limit = 5,
    country,
    language,
    config: providedConfig,
    timeoutMs = 10000
  } = options;

  let config = providedConfig;
  if (!config) {
    config = await loadGeocodeConfig();
  }

  if (!config.userAgent) {
    return { ok: false, error: MISSING_USER_AGENT_REASON };
  }

  try {
    const url = buildGeocodeUrl(query, limit, country, language, config);
    if (config.email) url.searchParams.set("email", config.email);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': config.userAgent
        }
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          ok: false,
          error: `Geocoding failed: ${res.status} ${res.statusText}${body ? ` - ${body}` : ""}`
        };
      }

      const data = await res.json() as GeocodeResult[];

      if (!Array.isArray(data) || data.length === 0) {
        return { ok: false, error: `No geocoding results found for "${query}".` };
      }

      return { ok: true, results: data.slice(0, limit) };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "Geocoding request timed out." };
    }
    return {
      ok: false,
      error: `Geocoding error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export function formatGeocodeResults(results: GeocodeResult[]): string {
  return results.map((place, index) => {
    const displayName = place.display_name || "Unknown location";
    const lat = place.lat ? parseFloat(place.lat) : null;
    const lon = place.lon ? parseFloat(place.lon) : null;

    if (!lat || !lon || Number.isNaN(lat) || Number.isNaN(lon)) {
      return `${index + 1}. ${displayName} (coordinates unavailable)`;
    }

    return `${index + 1}. ${displayName}\n   Coordinates: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }).join("\n\n");
}
