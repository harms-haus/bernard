import { tool } from "@langchain/core/tools";
import { z } from "zod";

const FORECAST_API_URL = process.env["OPEN_METEO_FORECAST_URL"] ?? "https://api.open-meteo.com/v1/forecast";
const HISTORICAL_API_URL =
  process.env["OPEN_METEO_HISTORICAL_URL"] ?? "https://archive-api.open-meteo.com/v1/archive";

type UnitChoice = {
  temperatureUnit: "celsius" | "fahrenheit";
  windSpeedUnit: "kmh" | "mph";
  precipUnit: "mm" | "inch";
  tempLabel: "°C" | "°F";
  windLabel: "km/h" | "mph";
  precipLabel: "mm" | "in";
};

const IMPERIAL_COUNTRIES = new Set(["US", "UM", "PR", "VI", "GU", "AS", "MP"]);

type DailyWeather = {
  time: string[];
  temperature_2m_max?: Array<number | null>;
  temperature_2m_min?: Array<number | null>;
  apparent_temperature_max?: Array<number | null>;
  apparent_temperature_min?: Array<number | null>;
  precipitation_sum?: Array<number | null>;
  precipitation_probability_max?: Array<number | null>;
  wind_speed_10m_max?: Array<number | null>;
};

type HourlyWeather = {
  time: string[];
  temperature_2m?: Array<number | null>;
  apparent_temperature?: Array<number | null>;
  precipitation_probability?: Array<number | null>;
  wind_speed_10m?: Array<number | null>;
  precipitation?: Array<number | null>;
};

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch (err) {
    return { error: "Failed to parse JSON response", detail: String(err) };
  }
}

function resolveUnits(preference: "metric" | "imperial"): UnitChoice {
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

function likelyImperial(country?: string, lat?: number, lon?: number): boolean {
  if (country && IMPERIAL_COUNTRIES.has(country.trim().toUpperCase())) return true;
  if (lat === undefined || lon === undefined) return false;
  const inUSBox = lat >= 15 && lat <= 72 && lon >= -170 && lon <= -50;
  return inUSBox;
}

function chooseUnits(units?: "metric" | "imperial", country?: string, lat?: number, lon?: number): UnitChoice {
  if (units === "metric" || units === "imperial") return resolveUnits(units);
  return resolveUnits(likelyImperial(country, lat, lon) ? "imperial" : "metric");
}

function maybeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatNumber(value: number | null, digits = 1): string {
  return value === null ? "?" : value.toFixed(digits);
}

function formatPrecip(value: number | null, units: UnitChoice): string {
  if (value === null) return "?";
  if (units.precipUnit === "mm") return value.toFixed(1);
  return value.toFixed(2);
}

function formatWeatherCode(code?: number): string | null {
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

function addDays(date: string, days: number): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseTarget(target: string | undefined, anchorDate: string): { date: string; time?: string } | null {
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

function nearestIndex(target: string, times: string[]): number {
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

function formatDailySummary(label: string, idx: number, daily: DailyWeather, units: UnitChoice) {
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

function formatHourlySummary(time: string, idx: number, hourly: HourlyWeather, units: UnitChoice) {
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

function applyUnitParams(url: URL, units: UnitChoice) {
  if (units.temperatureUnit === "fahrenheit") url.searchParams.set("temperature_unit", "fahrenheit");
  if (units.windSpeedUnit === "mph") url.searchParams.set("wind_speed_unit", "mph");
  if (units.precipUnit === "inch") url.searchParams.set("precipitation_unit", "inch");
}

export const getWeatherCurrentTool = tool(
  async ({ lat, lon, units, country }) => {
    try {
      const unitChoice = chooseUnits(units, country, lat, lon);
      const url = new URL(FORECAST_API_URL);
      url.searchParams.set("latitude", String(lat));
      url.searchParams.set("longitude", String(lon));
      url.searchParams.set("timezone", "auto");
      url.searchParams.set("forecast_days", "1");
      url.searchParams.set(
        "current",
        "temperature_2m,apparent_temperature,precipitation,wind_speed_10m,relative_humidity_2m,weather_code"
      );
      applyUnitParams(url, unitChoice);

      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text();
        return `Weather lookup failed: ${res.status} ${res.statusText} ${body}`;
      }

      const data = (await safeJson(res)) as {
        current?: {
          time?: string;
          temperature_2m?: number;
          apparent_temperature?: number;
          precipitation?: number;
          wind_speed_10m?: number;
          relative_humidity_2m?: number;
          weather_code?: number;
        };
        timezone?: string;
      };

      if (!data.current || !data.current.time) {
        return "Current weather is unavailable for these coordinates.";
      }

      const codeLabel = formatWeatherCode(data.current.weather_code);
      const precip = data.current.precipitation ?? null;
      const lines = [
        `Current @ ${data.current.time} (tz ${data.timezone ?? "auto"})`,
        `Temp ${formatNumber(maybeNumber(data.current.temperature_2m))}${unitChoice.tempLabel} (feels ${formatNumber(maybeNumber(data.current.apparent_temperature))}${unitChoice.tempLabel})`,
        `Wind ${formatNumber(maybeNumber(data.current.wind_speed_10m))} ${unitChoice.windLabel}; Humidity ${formatNumber(maybeNumber(data.current.relative_humidity_2m), 0)}%`,
        precip !== null ? `Precip ${formatPrecip(maybeNumber(precip), unitChoice)} ${unitChoice.precipLabel}/h` : "Precip data unavailable",
        codeLabel ? `Conditions: ${codeLabel}` : null
      ].filter(Boolean);

      return lines.join("\n");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Weather lookup failed: ${msg}`;
    }
  },
  {
    name: "get_weather_current",
    description: "Get current conditions for specific coordinates (lat, lon) via Open-Meteo.",
    schema: z.object({
      lat: z.number().min(-90).max(90).describe("Latitude in decimal degrees."),
      lon: z.number().min(-180).max(180).describe("Longitude in decimal degrees."),
      units: z.enum(["metric", "imperial"]).optional().describe("Force metric or imperial units."),
      country: z.string().length(2).optional().describe("ISO 3166-1 alpha-2 code to help infer units.")
    })
  }
);

export const getWeatherForecastTool = tool(
  async ({ lat, lon, target, units, country }) => {
    try {
      const unitChoice = chooseUnits(units, country, lat, lon);
      const url = new URL(FORECAST_API_URL);
      url.searchParams.set("latitude", String(lat));
      url.searchParams.set("longitude", String(lon));
      url.searchParams.set("timezone", "auto");
      url.searchParams.set(
        "daily",
        [
          "temperature_2m_max",
          "temperature_2m_min",
          "apparent_temperature_max",
          "apparent_temperature_min",
          "precipitation_sum",
          "precipitation_probability_max",
          "wind_speed_10m_max"
        ].join(",")
      );
      url.searchParams.set("hourly", "temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m");
      url.searchParams.set("forecast_days", "7");
      applyUnitParams(url, unitChoice);

      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text();
        return `Weather lookup failed: ${res.status} ${res.statusText} ${body}`;
      }

      const data = (await safeJson(res)) as {
        daily?: DailyWeather;
        hourly?: HourlyWeather;
        timezone?: string;
      };

      const daily = data.daily;
      const hourly = data.hourly;
      if (!daily?.time || !daily.time.length) return "Forecast data unavailable for these coordinates.";
      const anchorDate = daily.time[0];
      if (!anchorDate) return "Forecast data missing anchor date.";

      if (!target) {
        const today = formatDailySummary("Today", 0, daily, unitChoice);
        const tomorrow = daily.time[1] ? formatDailySummary("Tomorrow", 1, daily, unitChoice) : null;
        return [today, tomorrow, `Timezone: ${data.timezone ?? "auto"}`].filter(Boolean).join("\n");
      }

      const parsedTarget = parseTarget(target, anchorDate);
      if (!parsedTarget) return "Could not understand the requested date/time. Try YYYY-MM-DD or 'tomorrow'.";

      const dateIdx = daily.time.indexOf(parsedTarget.date);
      const targetTime = parsedTarget.time;
      if (targetTime && hourly?.time?.length) {
        const candidatesForDate = hourly.time
          .map((time, idx) => ({ time, idx }))
          .filter(({ time }) => time.startsWith(parsedTarget.date));
        if (!candidatesForDate.length) {
          return `No hourly data available on ${parsedTarget.date}.`;
        }
        const targetIso = `${parsedTarget.date}T${targetTime}`;
        const nearest = nearestIndex(targetIso, candidatesForDate.map((c) => c.time));
        const chosen = candidatesForDate[nearest];
        if (!chosen) return `No hourly data available near ${targetIso}.`;
        const hourlyLine = formatHourlySummary(chosen.time, chosen.idx, hourly, unitChoice);
        return [`Forecast for ${parsedTarget.date} (tz ${data.timezone ?? "auto"})`, hourlyLine].join("\n");
      }

      if (dateIdx === -1) {
        return `No forecast found for ${parsedTarget.date}. Available range starts ${anchorDate}.`;
      }

      const dailyLine = formatDailySummary("Forecast", dateIdx, daily, unitChoice);
      return [dailyLine, `Timezone: ${data.timezone ?? "auto"}`].join("\n");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Weather lookup failed: ${msg}`;
    }
  },
  {
    name: "get_weather_forecast",
    description:
      "Get forecast for coordinates (lat, lon). Accepts a target date/time like 'tomorrow' or '2025-02-15T15:00Z'.",
    schema: z.object({
      lat: z.number().min(-90).max(90).describe("Latitude in decimal degrees."),
      lon: z.number().min(-180).max(180).describe("Longitude in decimal degrees."),
      target: z
        .string()
        .optional()
        .describe("Date or datetime (e.g., 'tomorrow', '2025-02-15', '2025-02-15T15:00Z')."),
      units: z.enum(["metric", "imperial"]).optional(),
      country: z.string().length(2).optional().describe("ISO 3166-1 alpha-2 code to help infer units.")
    })
  }
);

export const getWeatherHistoricalTool = tool(
  async ({ lat, lon, target, units, country }) => {
    try {
      const unitChoice = chooseUnits(units, country, lat, lon);
      const targetDate =
        target?.trim() && !/^\s*$/.test(target)
          ? target.trim()
          : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const parsed = parseTarget(targetDate, new Date().toISOString().slice(0, 10));
      if (!parsed) return "Could not understand the requested historical date/time.";

      const url = new URL(HISTORICAL_API_URL);
      url.searchParams.set("latitude", String(lat));
      url.searchParams.set("longitude", String(lon));
      url.searchParams.set("timezone", "auto");
      url.searchParams.set("start_date", parsed.date);
      url.searchParams.set("end_date", parsed.date);
      url.searchParams.set(
        "daily",
        [
          "temperature_2m_max",
          "temperature_2m_min",
          "apparent_temperature_max",
          "apparent_temperature_min",
          "precipitation_sum",
          "wind_speed_10m_max"
        ].join(",")
      );
      if (parsed.time) url.searchParams.set("hourly", "temperature_2m,apparent_temperature,precipitation,wind_speed_10m");
      applyUnitParams(url, unitChoice);

      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text();
        return `Weather lookup failed: ${res.status} ${res.statusText} ${body}`;
      }

      const data = (await safeJson(res)) as {
        daily?: DailyWeather;
        hourly?: HourlyWeather;
        timezone?: string;
      };

      const daily = data.daily;
      if (!daily?.time?.length) return "No historical data returned for that date.";
      const dateIdx = daily.time.indexOf(parsed.date);
      if (dateIdx === -1) return `No historical data found for ${parsed.date}.`;

      if (parsed.time && data.hourly?.time?.length) {
        const candidatesForDate = data.hourly.time
          .map((time, idx) => ({ time, idx }))
          .filter(({ time }) => time.startsWith(parsed.date));
        if (!candidatesForDate.length) return `No hourly historical data on ${parsed.date}.`;
        const targetIso = `${parsed.date}T${parsed.time}`;
        const nearest = nearestIndex(targetIso, candidatesForDate.map((c) => c.time));
        const chosen = candidatesForDate[nearest];
        if (!chosen) return `No hourly data available near ${targetIso}.`;
        const hourlyLine = formatHourlySummary(chosen.time, chosen.idx, data.hourly, unitChoice);
        return [`Historical for ${parsed.date} (tz ${data.timezone ?? "auto"})`, hourlyLine].join("\n");
      }

      const dailyLine = formatDailySummary("Historical", dateIdx, daily, unitChoice);
      return [dailyLine, `Timezone: ${data.timezone ?? "auto"}`].join("\n");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Weather lookup failed: ${msg}`;
    }
  },
  {
    name: "get_weather_historical",
    description:
      "Get historical weather for coordinates (lat, lon) on a specific date or datetime (e.g., '2024-10-10').",
    schema: z.object({
      lat: z.number().min(-90).max(90).describe("Latitude in decimal degrees."),
      lon: z.number().min(-180).max(180).describe("Longitude in decimal degrees."),
      target: z
        .string()
        .optional()
        .describe("Historical date/datetime. Defaults to yesterday if omitted."),
      units: z.enum(["metric", "imperial"]).optional(),
      country: z.string().length(2).optional().describe("ISO 3166-1 alpha-2 code to help infer units.")
    })
  }
);



