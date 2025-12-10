import { tool } from "@langchain/core/tools";
import { z } from "zod";

import {
  DEFAULT_WEATHER_TIMEOUT_MS,
  HISTORICAL_API_URL,
  buildWeatherUrl,
  chooseUnits,
  fetchWeatherJson,
  formatDailySummary,
  formatHourlySummary,
  nearestIndex,
  parseTarget
} from "./common";
import type { DailyWeather, HourlyWeather } from "./common";

type HistoricalResponse = {
  daily?: DailyWeather;
  hourly?: HourlyWeather;
  timezone?: string;
};

const DAILY_FIELDS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "apparent_temperature_max",
  "apparent_temperature_min",
  "precipitation_sum",
  "wind_speed_10m_max"
];

const HOURLY_FIELDS = ["temperature_2m", "apparent_temperature", "precipitation", "wind_speed_10m"];

export const getWeatherHistoricalTool = tool(
  async ({ lat, lon, target, units, country }) => {
    const unitChoice = chooseUnits(units, country, lat, lon);
    const targetDate =
      target?.trim() && !/^\s*$/.test(target)
        ? target.trim()
        : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const parsed = parseTarget(targetDate, new Date().toISOString().slice(0, 10));
    if (!parsed) return "Could not understand the requested historical date/time.";

    const url = buildWeatherUrl(HISTORICAL_API_URL, lat, lon, unitChoice);
    url.searchParams.set("start_date", parsed.date);
    url.searchParams.set("end_date", parsed.date);
    url.searchParams.set("daily", DAILY_FIELDS.join(","));
    if (parsed.time) url.searchParams.set("hourly", HOURLY_FIELDS.join(","));

    const result = await fetchWeatherJson<HistoricalResponse>(url, DEFAULT_WEATHER_TIMEOUT_MS);
    if (!result.ok) return result.error;

    const data = result.data;
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
  },
  {
    name: "get_weather_historical",
    description:
      "Get historical weather for coordinates (lat, lon, date/time: example '2024-10-10T15:00Z', '2024-10-10').",
    schema: z.object({
      lat: z.number().min(-90).max(90).describe("Latitude in decimal degrees."),
      lon: z.number().min(-180).max(180).describe("Longitude in decimal degrees."),
      target: z
        .string()
        .optional()
        .describe("Historical date/datetime (example '2024-10-10T15:00Z', '2024-10-10')."),
      units: z.enum(["metric", "imperial"]).optional(),
      country: z.string().length(2).optional().describe("ISO 3166-1 alpha-2 code to help infer units.")
    })
  }
);


