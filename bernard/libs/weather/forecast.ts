import { tool } from "@langchain/core/tools";
import { z } from "zod";

import {
  DEFAULT_WEATHER_TIMEOUT_MS,
  FORECAST_API_URL,
  buildWeatherUrl,
  chooseUnits,
  fetchWeatherJson,
  formatDailySummary,
  formatHourlySummary,
  nearestIndex,
  parseTarget
} from "./common";
import type { DailyWeather, HourlyWeather } from "./common";

type ForecastResponse = {
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
  "precipitation_probability_max",
  "wind_speed_10m_max"
];

const HOURLY_FIELDS = ["temperature_2m", "apparent_temperature", "precipitation_probability", "wind_speed_10m"];

export const getWeatherForecastTool = tool(
  async ({ lat, lon, target, units, country }) => {
    const unitChoice = chooseUnits(units, country, lat, lon);
    const url = buildWeatherUrl(FORECAST_API_URL, lat, lon, unitChoice);
    url.searchParams.set("daily", DAILY_FIELDS.join(","));
    url.searchParams.set("hourly", HOURLY_FIELDS.join(","));
    url.searchParams.set("forecast_days", "7");

    const result = await fetchWeatherJson<ForecastResponse>(url, DEFAULT_WEATHER_TIMEOUT_MS);
    if (!result.ok) return result.error;

    const { daily, hourly, timezone } = result.data;
    if (!daily?.time || !daily.time.length) return "Forecast data unavailable for these coordinates.";
    const anchorDate = daily.time[0];
    if (!anchorDate) return "Forecast data missing anchor date.";

    if (!target) {
      const today = formatDailySummary("Today", 0, daily, unitChoice);
      const tomorrow = daily.time[1] ? formatDailySummary("Tomorrow", 1, daily, unitChoice) : null;
      return [today, tomorrow, `Timezone: ${timezone ?? "auto"}`].filter(Boolean).join("\n");
    }

    const parsedTarget = parseTarget(target, anchorDate);
    if (!parsedTarget) return "Could not understand the requested date/time. Try YYYY-MM-DD.";

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
      return [`Forecast for ${parsedTarget.date} (tz ${timezone ?? "auto"})`, hourlyLine].join("\n");
    }

    if (dateIdx === -1) {
      return `No forecast found for ${parsedTarget.date}. Available range starts ${anchorDate}.`;
    }

    const dailyLine = formatDailySummary("Forecast", dateIdx, daily, unitChoice);
    return [dailyLine, `Timezone: ${timezone ?? "auto"}`].join("\n");
  },
  {
    name: "get_weather_forecast",
    description:
      "Get forecast for coordinates (lat, lon, date/datetime: example 'YYYY-MM-DDTHH:mmZ', 'YYYY-MM-DD').",
    schema: z.object({
      lat: z.number().min(-90).max(90).describe("Latitude in decimal degrees."),
      lon: z.number().min(-180).max(180).describe("Longitude in decimal degrees."),
      target: z
        .string()
        .optional()
        .describe("Date/datetime (example 'YYYY-MM-DDTHH:mmZ', 'YYYY-MM-DD')."),
      units: z.enum(["metric", "imperial"]).optional(),
      country: z.string().length(2).optional().describe("ISO 3166-1 alpha-2 code to help infer units.")
    })
  }
);


