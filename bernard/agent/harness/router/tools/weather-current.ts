import { tool } from "@langchain/core/tools";
import { z } from "zod";

import {
  buildWeatherUrl,
  chooseUnits,
  fetchWeatherJson,
  formatNumber,
  formatPrecip,
  formatWeatherCode,
  getForecastApiUrl,
  getWeatherTimeoutMs,
  maybeNumber
} from "./weather-common";

type CurrentResponse = {
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

const CURRENT_FIELDS =
  "temperature_2m,apparent_temperature,precipitation,wind_speed_10m,relative_humidity_2m,weather_code";

const weatherCurrentTool = tool(
  async ({ lat, lon, units, country }) => {
    const unitChoice = chooseUnits(units, country, lat, lon);
    const baseUrl = await getForecastApiUrl();
    const url = buildWeatherUrl(baseUrl, lat, lon, unitChoice);
    url.searchParams.set("forecast_days", "1");
    url.searchParams.set("current", CURRENT_FIELDS);

    const timeoutMs = await getWeatherTimeoutMs();
    const result = await fetchWeatherJson<CurrentResponse>(url, timeoutMs);
    if (!result.ok) return result.error;

    const data = result.data;
    if (!data.current || !data.current.time) {
      return "Current weather is unavailable for these coordinates.";
    }

    const codeLabel = formatWeatherCode(data.current.weather_code);
    const precip = data.current.precipitation ?? null;
    const lines = [
      `Current @ ${data.current.time} (tz ${data.timezone ?? "auto"})`,
      `Temp ${formatNumber(maybeNumber(data.current.temperature_2m))}${unitChoice.tempLabel} (feels ${formatNumber(maybeNumber(data.current.apparent_temperature))}${unitChoice.tempLabel})`,
      `Wind ${formatNumber(maybeNumber(data.current.wind_speed_10m))} ${unitChoice.windLabel}; Humidity ${formatNumber(maybeNumber(data.current.relative_humidity_2m), 0)}%`,
      precip !== null
        ? `Precip ${formatPrecip(maybeNumber(precip), unitChoice)} ${unitChoice.precipLabel}/h`
        : "Precip data unavailable",
      codeLabel ? `Conditions: ${codeLabel}` : null
    ].filter(Boolean);

    return lines.join("\n");
  },
  {
    name: "get_weather_current",
    description: "Get current conditions for specific coordinates (lat, lon) via Open-Meteo.",
    schema: z.object({
      lat: z.number().min(-90).max(90).describe("Latitude in decimal degrees."),
      lon: z.number().min(-180).max(180).describe("Longitude in decimal degrees."),
      units: z.enum(["metric", "imperial"]).optional().describe("Force metric or imperial units."),
      country: z.string().length(2).optional().describe("ISO 3166-1 alpha-2 code to help infer units."),
    })
  }
);

export const getWeatherCurrentTool = {
  ...weatherCurrentTool,
  interpretationPrompt: `# Weather Current Tool Results

When interpreting weather data from get_weather_current:
- Use Fahrenheit for temperatures if it is available.
- Do not include the wind speed directly, but do describe the day as windy or calm and the direction if included.`

};
