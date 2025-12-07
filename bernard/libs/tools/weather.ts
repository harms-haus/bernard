import { tool } from "@langchain/core/tools";
import { z } from "zod";

const GEOCODING_API_URL =
  process.env.OPEN_METEO_GEOCODING_URL ?? "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_API_URL = process.env.OPEN_METEO_FORECAST_URL ?? "https://api.open-meteo.com/v1/forecast";
const HISTORICAL_API_URL = process.env.OPEN_METEO_HISTORICAL_URL ?? "https://archive-api.open-meteo.com/v1/archive";
const AIR_QUALITY_API_URL =
  process.env.OPEN_METEO_AIR_QUALITY_URL ?? "https://air-quality-api.open-meteo.com/v1/air-quality";

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch (err) {
    return { error: "Failed to parse JSON response", detail: String(err) };
  }
}

type GeocodeResult = {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  timezone?: string;
};

type UnitChoice = {
  temperatureUnit: "celsius" | "fahrenheit";
  windSpeedUnit: "kmh" | "mph";
  tempLabel: "°C" | "°F";
  windLabel: "km/h" | "mph";
  precipLabel: "mm" | "in";
};

type DailySnapshot = {
  date: string;
  max: number | null;
  min: number | null;
  feelsMax: number | null;
  feelsMin: number | null;
  precipitation: number | null;
  precipitationProbability: number | null;
  windMax: number | null;
};

function resolveUnits(units?: "metric" | "imperial"): UnitChoice {
  const isImperial = units === "imperial";
  return {
    temperatureUnit: isImperial ? "fahrenheit" : "celsius",
    windSpeedUnit: isImperial ? "mph" : "kmh",
    tempLabel: isImperial ? "°F" : "°C",
    windLabel: isImperial ? "mph" : "km/h",
    precipLabel: isImperial ? "in" : "mm"
  };
}

function maybeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatNumber(value: number | null, digits = 1): string {
  return value === null ? "?" : value.toFixed(digits);
}

function formatPrecip(value: number | null, units: UnitChoice): string {
  if (value === null) return "?";
  if (units.precipLabel === "mm") return value.toFixed(1);
  return (value / 25.4).toFixed(2);
}

function percentile(values: number[], p: number): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = ((p / 100) * (sorted.length - 1)) | 0;
  return sorted[rank];
}

function average(values: number[]): number {
  if (!values.length) return NaN;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function subtractYears(date: Date, years: number): Date {
  const copy = new Date(date);
  copy.setFullYear(copy.getFullYear() - years);
  return copy;
}

function formatDaySummary(label: string, day: DailySnapshot | null, units: UnitChoice): string {
  if (!day) return `${label}: No forecast available.`;
  const parts: string[] = [];
  if (day.max !== null || day.min !== null) {
    parts.push(`high ${formatNumber(day.max)}${units.tempLabel}, low ${formatNumber(day.min)}${units.tempLabel}`);
  }
  if (day.feelsMax !== null || day.feelsMin !== null) {
    parts.push(
      `feels ${formatNumber(day.feelsMax)}${units.tempLabel}/${formatNumber(day.feelsMin)}${units.tempLabel}`
    );
  }
  if (day.precipitationProbability !== null) {
    parts.push(`precip chance ${formatNumber(day.precipitationProbability, 0)}%`);
  }
  if (day.precipitation !== null) {
    parts.push(`precip ${formatPrecip(day.precipitation, units)} ${units.precipLabel}`);
  }
  if (day.windMax !== null) {
    parts.push(`wind up to ${formatNumber(day.windMax)} ${units.windLabel}`);
  }
  return `${label} (${day.date}): ${parts.join("; ") || "No forecast details available."}`;
}

async function geocodeLocation(location: string): Promise<GeocodeResult> {
  const url = new URL(GEOCODING_API_URL);
  url.searchParams.set("name", location);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Geocoding failed: ${res.status} ${res.statusText} ${body}`);
  }
  const data = (await safeJson(res)) as { results?: Array<GeocodeResult> };
  const best = data.results?.[0];
  if (!best) {
    throw new Error(`Could not find location "${location}". Try a city, state, or coordinates.`);
  }
  return best;
}

async function fetchForecast(
  geo: GeocodeResult,
  units: UnitChoice
): Promise<{ timezone: string; today: DailySnapshot | null; dayPlusTwo: DailySnapshot | null; anchorDate: string }> {
  const url = new URL(FORECAST_API_URL);
  url.searchParams.set("latitude", String(geo.latitude));
  url.searchParams.set("longitude", String(geo.longitude));
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
  url.searchParams.set("current", "temperature_2m,apparent_temperature");
  url.searchParams.set("forecast_days", "3");
  url.searchParams.set("timezone", geo.timezone ?? "auto");
  if (units.temperatureUnit === "fahrenheit") url.searchParams.set("temperature_unit", "fahrenheit");
  if (units.windSpeedUnit === "mph") url.searchParams.set("wind_speed_unit", "mph");

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Forecast lookup failed: ${res.status} ${res.statusText} ${body}`);
  }

  const data = (await safeJson(res)) as {
    daily?: {
      time?: string[];
      temperature_2m_max?: Array<number | null>;
      temperature_2m_min?: Array<number | null>;
      apparent_temperature_max?: Array<number | null>;
      apparent_temperature_min?: Array<number | null>;
      precipitation_sum?: Array<number | null>;
      precipitation_probability_max?: Array<number | null>;
      wind_speed_10m_max?: Array<number | null>;
    };
    timezone?: string;
  };

  const daily = data.daily;
  if (!daily || !daily.time || !daily.time.length) {
    throw new Error("Forecast data missing or malformed.");
  }

  const buildDay = (idx: number): DailySnapshot | null => {
    const date = daily.time?.[idx];
    if (!date) return null;
    return {
      date,
      max: maybeNumber(daily.temperature_2m_max?.[idx]),
      min: maybeNumber(daily.temperature_2m_min?.[idx]),
      feelsMax: maybeNumber(daily.apparent_temperature_max?.[idx]),
      feelsMin: maybeNumber(daily.apparent_temperature_min?.[idx]),
      precipitation: maybeNumber(daily.precipitation_sum?.[idx]),
      precipitationProbability: maybeNumber(daily.precipitation_probability_max?.[idx]),
      windMax: maybeNumber(daily.wind_speed_10m_max?.[idx])
    };
  };

  return {
    timezone: data.timezone ?? geo.timezone ?? "auto",
    today: buildDay(0),
    dayPlusTwo: buildDay(2),
    anchorDate: daily.time[0]
  };
}

async function analyzeHistoricalIfNotable(
  geo: GeocodeResult,
  units: UnitChoice,
  anchorDate: string,
  today: DailySnapshot | null
): Promise<string | null> {
  if (!today?.max && !today?.min && !today?.precipitation) return null;

  const todayDate = new Date(anchorDate);
  const start = subtractYears(todayDate, 5);
  const format = (d: Date) => d.toISOString().slice(0, 10);

  const url = new URL(HISTORICAL_API_URL);
  url.searchParams.set("latitude", String(geo.latitude));
  url.searchParams.set("longitude", String(geo.longitude));
  url.searchParams.set("start_date", format(start));
  url.searchParams.set("end_date", format(todayDate));
  url.searchParams.set("timezone", geo.timezone ?? "auto");
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum");

  const res = await fetch(url);
  if (!res.ok) {
    return null;
  }
  const data = (await safeJson(res)) as {
    daily?: {
      time?: string[];
      temperature_2m_max?: Array<number | null>;
      temperature_2m_min?: Array<number | null>;
      precipitation_sum?: Array<number | null>;
    };
  };
  const daily = data.daily;
  if (!daily?.time?.length) return null;

  const targetMonthDay = anchorDate.slice(5);
  const highs: number[] = [];
  const lows: number[] = [];
  const precips: number[] = [];

  daily.time.forEach((date, idx) => {
    if (date === anchorDate) return;
    if (date.slice(5) !== targetMonthDay) return;
    const high = maybeNumber(daily.temperature_2m_max?.[idx]);
    const low = maybeNumber(daily.temperature_2m_min?.[idx]);
    const precip = maybeNumber(daily.precipitation_sum?.[idx]);
    if (high !== null) highs.push(high);
    if (low !== null) lows.push(low);
    if (precip !== null) precips.push(precip);
  });

  const notes: string[] = [];
  if (highs.length >= 3 && today.max !== null) {
    const hotThreshold = percentile(highs, 90);
    const coldThreshold = percentile(highs, 10);
    if (today.max >= hotThreshold) {
      notes.push(
        `Today's high ${formatNumber(today.max)}${units.tempLabel} is warmer than usual for this date (≈90th percentile ${formatNumber(hotThreshold)}${units.tempLabel}).`
      );
    } else if (today.max <= coldThreshold) {
      notes.push(
        `Today's high ${formatNumber(today.max)}${units.tempLabel} is colder than usual for this date (≈10th percentile ${formatNumber(coldThreshold)}${units.tempLabel}).`
      );
    }
  }

  if (precips.length >= 3 && today.precipitation !== null) {
    const typical = average(precips);
    if (today.precipitation >= typical * 2 && today.precipitation > 2) {
      notes.push(
        `Precipitation is elevated for this date (${formatPrecip(today.precipitation, units)} ${units.precipLabel} vs typical ~${formatPrecip(typical, units)}).`
      );
    } else if (typical > 0 && today.precipitation <= typical * 0.2) {
      notes.push(
        `Today looks drier than usual for this date (${formatPrecip(today.precipitation, units)} ${units.precipLabel} vs typical ~${formatPrecip(typical, units)}).`
      );
    }
  }

  return notes.length ? notes.join(" ") : null;
}

async function analyzeAirQualityIfNotable(geo: GeocodeResult, anchorDate: string): Promise<string | null> {
  const url = new URL(AIR_QUALITY_API_URL);
  url.searchParams.set("latitude", String(geo.latitude));
  url.searchParams.set("longitude", String(geo.longitude));
  url.searchParams.set("hourly", "european_aqi,pm2_5,pm10");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("timezone", geo.timezone ?? "auto");

  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await safeJson(res)) as {
    hourly?: { time?: string[]; european_aqi?: number[]; pm2_5?: number[]; pm10?: number[] };
  };
  const times = data.hourly?.time ?? [];
  const aqis = data.hourly?.european_aqi ?? [];
  const pm25 = data.hourly?.pm2_5 ?? [];
  const pm10 = data.hourly?.pm10 ?? [];

  let maxAqi = -Infinity;
  let idx = -1;
  times.forEach((time, i) => {
    if (!time.startsWith(anchorDate)) return;
    const value = aqis[i];
    if (typeof value === "number" && value > maxAqi) {
      maxAqi = value;
      idx = i;
    }
  });

  if (idx === -1 || !Number.isFinite(maxAqi)) return null;
  const descriptor = maxAqi >= 80 ? "very poor" : maxAqi <= 20 ? "excellent" : null;
  if (!descriptor) return null;

  const pmParts: string[] = [];
  if (typeof pm25[idx] === "number") pmParts.push(`PM2.5 ${pm25[idx]!.toFixed(1)} µg/m³`);
  if (typeof pm10[idx] === "number") pmParts.push(`PM10 ${pm10[idx]!.toFixed(1)} µg/m³`);

  return `Air quality is ${descriptor} today (max AQI ${Math.round(maxAqi)}${pmParts.length ? `, ${pmParts.join(", ")}` : ""}).`;
}

export const weatherTool = tool(
  async ({ location, units }) => {
    try {
      const trimmedLocation = location.trim();
      if (!trimmedLocation) return "Please provide a location (city, region, or coordinates).";

      const unitChoice = resolveUnits(units);
      const geo = await geocodeLocation(trimmedLocation);
      const forecast = await fetchForecast(geo, unitChoice);

      const [historicalNote, airQualityNote] = await Promise.all([
        analyzeHistoricalIfNotable(geo, unitChoice, forecast.anchorDate, forecast.today),
        analyzeAirQualityIfNotable(geo, forecast.anchorDate)
      ]);

      const lines = [
        `Location: ${geo.name}${geo.country ? `, ${geo.country}` : ""} (${geo.latitude.toFixed(2)}, ${geo.longitude.toFixed(2)}) tz=${forecast.timezone}`,
        formatDaySummary("Today", forecast.today, unitChoice),
        formatDaySummary("In 2 days", forecast.dayPlusTwo, unitChoice)
      ];

      if (historicalNote) lines.push(`Historical: ${historicalNote}`);
      if (airQualityNote) lines.push(`Air quality: ${airQualityNote}`);

      return lines.join("\n");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Weather lookup failed: ${msg}`;
    }
  },
  {
    name: "get_weather",
    description:
      "Get today's weather and the forecast two days out using Open-Meteo, optionally noting unusual conditions or air quality.",
    schema: z.object({
      location: z.string().min(2),
      units: z.enum(["metric", "imperial"]).optional()
    })
  }
);



