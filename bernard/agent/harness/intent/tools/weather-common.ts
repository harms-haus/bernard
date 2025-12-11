import { getSettings } from "@/lib/settingsCache";

const DEFAULT_FORECAST_API_URL = "https://api.open-meteo.com/v1/forecast";
const DEFAULT_HISTORICAL_API_URL = "https://archive-api.open-meteo.com/v1/archive";

export const DEFAULT_WEATHER_TIMEOUT_MS = 12_000;

async function getSettingsWithTimeout(ms = 500) {
  const isNodeTest = process.execArgv.some((arg) => arg.includes("--test"));
  if (process.env["NODE_ENV"] === "test" || isNodeTest) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const settingsPromise = getSettings().catch(() => null);
    const timeoutPromise = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    });
    return (await Promise.race([settingsPromise, timeoutPromise])) as Awaited<ReturnType<typeof getSettings>> | null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getForecastApiUrl(): Promise<string> {
  const envUrl = process.env["OPEN_METEO_FORECAST_URL"];
  if (envUrl) return envUrl;
  const settings = await getSettingsWithTimeout();
  return settings?.services.weather?.forecastUrl ?? DEFAULT_FORECAST_API_URL;
}

export async function getHistoricalApiUrl(): Promise<string> {
  const envUrl = process.env["OPEN_METEO_HISTORICAL_URL"];
  if (envUrl) return envUrl;
  const settings = await getSettingsWithTimeout();
  return settings?.services.weather?.historicalUrl ?? DEFAULT_HISTORICAL_API_URL;
}

export async function getWeatherTimeoutMs(): Promise<number> {
  const settings = await getSettingsWithTimeout();
  const fromSettings = settings?.services.weather?.timeoutMs;
  if (typeof fromSettings === "number" && fromSettings > 0) return fromSettings;
  return DEFAULT_WEATHER_TIMEOUT_MS;
}

export type UnitChoice = {
  temperatureUnit: "celsius" | "fahrenheit";
  windSpeedUnit: "kmh" | "mph";
  precipUnit: "mm" | "inch";
  tempLabel: "°C" | "°F";
  windLabel: "km/h" | "mph";
  precipLabel: "mm" | "in";
};

const IMPERIAL_COUNTRIES = new Set(["US", "UM", "PR", "VI", "GU", "AS", "MP"]);

export type DailyWeather = {
  time: string[];
  temperature_2m_max?: Array<number | null>;
  temperature_2m_min?: Array<number | null>;
  apparent_temperature_max?: Array<number | null>;
  apparent_temperature_min?: Array<number | null>;
  precipitation_sum?: Array<number | null>;
  precipitation_probability_max?: Array<number | null>;
  wind_speed_10m_max?: Array<number | null>;
};

export type HourlyWeather = {
  time: string[];
  temperature_2m?: Array<number | null>;
  apparent_temperature?: Array<number | null>;
  precipitation_probability?: Array<number | null>;
  wind_speed_10m?: Array<number | null>;
  precipitation?: Array<number | null>;
};

export type WeatherFetchResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch (err) {
    return { error: "Failed to parse JSON response", detail: String(err) };
  }
}

export function weatherError(reason: string): string {
  return `Weather lookup failed: ${reason}`;
}

export async function fetchWeatherJson<T>(
  url: URL,
  timeoutMs = DEFAULT_WEATHER_TIMEOUT_MS
): Promise<WeatherFetchResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const suffix = body ? ` ${body}` : "";
      return { ok: false, error: weatherError(`${res.status} ${res.statusText}${suffix}`) };
    }
    const data = (await safeJson(res)) as T;
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const reason =
      (err as { name?: string } | undefined)?.name === "AbortError"
        ? `request timed out after ${timeoutMs}ms`
        : msg;
    return { ok: false, error: weatherError(reason) };
  } finally {
    clearTimeout(timer);
  }
}

export function resolveUnits(preference: "metric" | "imperial"): UnitChoice {
  const isImperial = preference === "imperial";
  return {
    temperatureUnit: isImperial ? "fahrenheit" : "celsius",
    windSpeedUnit: isImperial ? "mph" : "kmh",
    precipUnit: isImperial ? "inch" : "mm",
    tempLabel: isImperial ? "°F" : "°C",
    windLabel: isImperial ? "mph" : "km/h",
    precipLabel: isImperial ? "in" : "mm"
  };
}

export function likelyImperial(country?: string, lat?: number, lon?: number): boolean {
  if (country && IMPERIAL_COUNTRIES.has(country.trim().toUpperCase())) return true;
  if (lat === undefined || lon === undefined) return false;
  const inUSBox = lat >= 15 && lat <= 72 && lon >= -170 && lon <= -50;
  return inUSBox;
}

export function chooseUnits(
  units?: "metric" | "imperial",
  country?: string,
  lat?: number,
  lon?: number
): UnitChoice {
  if (units === "metric" || units === "imperial") return resolveUnits(units);
  return resolveUnits(likelyImperial(country, lat, lon) ? "imperial" : "metric");
}

export function maybeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function formatNumber(value: number | null, digits = 1): string {
  return value === null ? "?" : value.toFixed(digits);
}

export function formatPrecip(value: number | null, units: UnitChoice): string {
  if (value === null) return "?";
  if (units.precipUnit === "mm") return value.toFixed(1);
  return value.toFixed(2);
}

export function formatWeatherCode(code?: number): string | null {
  if (typeof code !== "number") return null;
  if (code >= 95) return "thunderstorm";
  if (code >= 80) return "rain showers";
  if (code >= 70) return "snow";
  if (code >= 60) return "rain";
  if (code >= 50) return "drizzle";
  if (code >= 45) return "fog";
  if (code >= 40) return "haze";
  if (code >= 30) return "overcast";
  if (code >= 20) return "cloudy";
  if (code >= 10) return "partly cloudy";
  return "clear";
}

export function addDays(date: string, days: number): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function parseTarget(
  target: string | undefined,
  anchorDate: string
): { date: string; time?: string } | null {
  if (!target) return null;
  const normalized = target.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "today" || normalized === "now") return { date: anchorDate };
  if (normalized === "tomorrow") return { date: addDays(anchorDate, 1) };
  if (normalized === "day after tomorrow" || normalized === "day-after-tomorrow")
    return { date: addDays(anchorDate, 2) };
  if (normalized === "yesterday") return { date: addDays(anchorDate, -1) };

  if (/^\d{4}-\d{2}-\d{2}(t.*)?/.test(normalized)) {
    const [datePartRaw] = normalized.split(/[t ]/);
    const datePart = datePartRaw ?? normalized;
    if (normalized.includes("t") || normalized.includes(" ")) {
      const timePart = normalized.slice(11);
      if (timePart) return { date: datePart, time: timePart };
    }
    return { date: datePart };
  }

  const parsed = new Date(target);
  if (!Number.isNaN(parsed.getTime())) {
    const iso = parsed.toISOString();
    return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
  }

  return null;
}

export function nearestIndex(target: string, times: string[]): number {
  let bestIdx = -1;
  let bestDiff = Number.POSITIVE_INFINITY;
  const targetMs = Date.parse(target);
  times.forEach((time, idx) => {
    const ms = Date.parse(time);
    if (Number.isNaN(ms)) return;
    const diff = Math.abs(ms - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = idx;
    }
  });
  return bestIdx;
}

export function formatDailySummary(label: string, idx: number, daily: DailyWeather, units: UnitChoice) {
  const date = daily.time?.[idx];
  if (!date) return `${label}: No forecast available.`;
  const max = maybeNumber(daily.temperature_2m_max?.[idx]);
  const min = maybeNumber(daily.temperature_2m_min?.[idx]);
  const feelsMax = maybeNumber(daily.apparent_temperature_max?.[idx]);
  const feelsMin = maybeNumber(daily.apparent_temperature_min?.[idx]);
  const precip = maybeNumber(daily.precipitation_sum?.[idx]);
  const precipProb = maybeNumber(daily.precipitation_probability_max?.[idx]);
  const wind = maybeNumber(daily.wind_speed_10m_max?.[idx]);

  const parts: string[] = [];
  if (max !== null || min !== null) parts.push(`high ${formatNumber(max)}${units.tempLabel}, low ${formatNumber(min)}${units.tempLabel}`);
  if (feelsMax !== null || feelsMin !== null)
    parts.push(`feels ${formatNumber(feelsMax)}${units.tempLabel}/${formatNumber(feelsMin)}${units.tempLabel}`);
  if (precipProb !== null) parts.push(`precip chance ${formatNumber(precipProb, 0)}%`);
  if (precip !== null) parts.push(`precip ${formatPrecip(precip, units)} ${units.precipLabel}`);
  if (wind !== null) parts.push(`wind up to ${formatNumber(wind)} ${units.windLabel}`);

  return `${label} (${date}): ${parts.join("; ") || "No forecast details available."}`;
}

export function formatHourlySummary(time: string, idx: number, hourly: HourlyWeather, units: UnitChoice) {
  const temp = maybeNumber(hourly.temperature_2m?.[idx]);
  const feels = maybeNumber(hourly.apparent_temperature?.[idx]);
  const precipProb = maybeNumber(hourly.precipitation_probability?.[idx]);
  const wind = maybeNumber(hourly.wind_speed_10m?.[idx]);
  const parts = [
    `temp ${formatNumber(temp)}${units.tempLabel}`,
    `feels ${formatNumber(feels)}${units.tempLabel}`,
    precipProb !== null ? `precip chance ${formatNumber(precipProb, 0)}%` : null,
    wind !== null ? `wind ${formatNumber(wind)} ${units.windLabel}` : null
  ].filter(Boolean);
  return `${time}: ${parts.join("; ")}`;
}

export function applyUnitParams(url: URL, units: UnitChoice) {
  if (units.temperatureUnit === "fahrenheit") url.searchParams.set("temperature_unit", "fahrenheit");
  if (units.windSpeedUnit === "mph") url.searchParams.set("wind_speed_unit", "mph");
  if (units.precipUnit === "inch") url.searchParams.set("precipitation_unit", "inch");
}

export function buildWeatherUrl(
  baseUrl: string,
  lat: number,
  lon: number,
  units: UnitChoice,
  timezone = "auto"
): URL {
  const url = new URL(baseUrl);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("timezone", timezone);
  applyUnitParams(url, units);
  return url;
}
