import { tool } from "@langchain/core/tools";
import { z } from "zod";

import {
  buildWeatherUrl,
  calculateAverages,
  fetchWeatherJson,
  formatAverageTable,
  formatDailyTable,
  formatHourlyTable,
  geocodeLocation,
  getForecastApiUrl,
  getHistoricalApiUrl,
  getImperialUnits,
  getWeatherTimeoutMs,
  isHistoricalDate,
  parseDateRange,
  type DailyWeather,
  type HourlyWeather
} from "@/lib/weather/common";


type ForecastResponse = {
  daily?: DailyWeather;
  hourly?: HourlyWeather;
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    wind_speed_10m?: number;
    precipitation_probability?: number;
  };
  timezone?: string;
};

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
  "precipitation_probability_max",
  "wind_speed_10m_max"
];

const HOURLY_FIELDS = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation_probability",
  "wind_speed_10m",
  "precipitation"
];

const CURRENT_FIELDS = "temperature_2m,apparent_temperature,precipitation,precipitation_probability,wind_speed_10m";

export const getWeatherDataTool = tool(
  async ({ area_search, startDateTime, endDateTime, period }) => {
    // Geocode the area_search to get lat/lon coordinates
    let coordinates: { lat: number; lon: number } | null = null;
    try {
      coordinates = await geocodeLocation(area_search);
    } catch (error) {
      return error instanceof Error ? error.message : `Geocoding failed: ${String(error)}`;
    }

    if (!coordinates) {
      return `Could not find coordinates for location: ${area_search}. Please try a different location name or provide more specific details.`;
    }
    const { lat, lon } = coordinates;

    const units = getImperialUnits();
    const anchorDate = new Date().toISOString().slice(0, 10);

    const dateRange = parseDateRange(startDateTime, endDateTime, anchorDate);
    if (!dateRange) {
      return "Could not understand the requested date/time range. Use ISO format (YYYY-MM-DDTHH:mmZ) or relative words like 'today', 'tomorrow', 'yesterday', 'now'.";
    }

    // Special handling for current weather when start is "now"
    if (startDateTime?.toLowerCase().trim() === "now") {
      return await fetchCurrentWeather(lat, lon, units);
    }

    // Determine if we need historical data (if start date is in the past)
    const useHistorical = isHistoricalDate(dateRange.start.date);

    if (period === "average") {
      return await fetchAverageWeather(lat, lon, dateRange, useHistorical, units);
    }

    if (period === "daily") {
      return await fetchDailyWeather(lat, lon, dateRange, useHistorical, units);
    }

    if (period === "hourly") {
      return await fetchHourlyWeather(lat, lon, dateRange, useHistorical, units);
    }

    return "Invalid period specified. Use 'hourly', 'daily', or 'average'.";
  },
  {
    name: "get_weather_data",
    description: `Get weather data for a location with flexible date/time ranges and periods.

**Relative date words:**
- "today" (daily: returns today and tomorrow's forecast)
- "tomorrow" (daily: returns only tomorrow's forecast)
- "yesterday" (uses historical data)
- "now" (returns current conditions)

**Period options:**
- "hourly": Hourly data points between start and end dates
- "daily": Daily summaries for the date range
- "average": Single averaged values across the time range

All data returned in imperial units (Fahrenheit, mph, inches).`,
    schema: z.object({
      area_search: z.string().min(3).describe("Location name or address to get weather for (e.g., 'New York', 'London, UK', '1600 Pennsylvania Avenue NW, Washington, DC')."),
      startDateTime: z
        .string()
        .describe("Start date/time: ISO format (YYYY-MM-DDTHH:mmZ) or 'today', 'tomorrow', 'yesterday', 'now'."),
      endDateTime: z
        .string()
        .describe("End date/time: ISO format (YYYY-MM-DDTHH:mmZ) or 'today', 'tomorrow', 'yesterday', 'now'."),
      period: z.enum(["hourly", "daily", "average"]).describe("Data granularity: 'hourly', 'daily', or 'average'.")
    })
  }
);

async function fetchCurrentWeather(lat: number, lon: number, units: ReturnType<typeof getImperialUnits>): Promise<string> {
  const baseUrl = await getForecastApiUrl();
  const url = buildWeatherUrl(baseUrl, lat, lon, units);
  url.searchParams.set("current", CURRENT_FIELDS);

  const timeoutMs = await getWeatherTimeoutMs();
  const result = await fetchWeatherJson<ForecastResponse>(url, timeoutMs);
  if (!result.ok) return result.error;

  const { current, timezone } = result.data;
  if (!current?.time) return "Current weather data unavailable.";

  const lines = [
    `## Current Weather`,
    `**Time:** ${current.time}`,
    `**Temperature:** ${current.temperature_2m ?? "?"}°F`,
    `**Feels Like:** ${current.apparent_temperature ?? "?"}°F`,
    `**Precipitation:** ${current.precipitation ?? "?"} in/h`,
    `**Precipitation Chance:** ${current.precipitation_probability ?? "?"}%`,
    `**Wind Speed:** ${current.wind_speed_10m ?? "?"} mph`,
    `*Timezone: ${timezone ?? "auto"}*`
  ];

  return lines.join("\n");
}

async function fetchAverageWeather(
  lat: number,
  lon: number,
  dateRange: NonNullable<ReturnType<typeof parseDateRange>>,
  useHistorical: boolean,
  units: ReturnType<typeof getImperialUnits>
): Promise<string> {
  const apiUrl = useHistorical ? await getHistoricalApiUrl() : await getForecastApiUrl();
  const url = buildWeatherUrl(apiUrl, lat, lon, units);

  if (useHistorical) {
    url.searchParams.set("start_date", dateRange.start.date);
    url.searchParams.set("end_date", dateRange.end.date);
  } else {
    url.searchParams.set("forecast_days", "7");
  }

  url.searchParams.set("hourly", HOURLY_FIELDS.join(","));

  const timeoutMs = await getWeatherTimeoutMs();
  const result = await fetchWeatherJson<ForecastResponse | HistoricalResponse>(url, timeoutMs);
  if (!result.ok) return result.error;

  const { hourly, timezone } = result.data;
  if (!hourly?.time?.length) return "No hourly weather data available for the specified range.";

  const averages = calculateAverages(hourly);
  return formatAverageTable(averages, units, timezone ?? "auto");
}

async function fetchDailyWeather(
  lat: number,
  lon: number,
  dateRange: NonNullable<ReturnType<typeof parseDateRange>>,
  useHistorical: boolean,
  units: ReturnType<typeof getImperialUnits>
): Promise<string> {
  const apiUrl = useHistorical ? await getHistoricalApiUrl() : await getForecastApiUrl();
  const url = buildWeatherUrl(apiUrl, lat, lon, units);

  if (useHistorical) {
    url.searchParams.set("start_date", dateRange.start.date);
    url.searchParams.set("end_date", dateRange.end.date);
  } else {
    // Special handling: "today" + daily should return today and tomorrow
    if (dateRange.start.date === new Date().toISOString().slice(0, 10) && dateRange.end.date === dateRange.start.date) {
      url.searchParams.set("forecast_days", "2"); // Today and tomorrow
    } else {
      url.searchParams.set("forecast_days", "7");
    }
  }

  url.searchParams.set("daily", DAILY_FIELDS.join(","));

  const timeoutMs = await getWeatherTimeoutMs();
  const result = await fetchWeatherJson<ForecastResponse | HistoricalResponse>(url, timeoutMs);
  if (!result.ok) return result.error;

  const { daily, timezone } = result.data;
  if (!daily?.time?.length) return "No daily weather data available for the specified range.";

  // Filter to requested date range
  const filteredDaily: DailyWeather = {
    time: [],
    temperature_2m_max: [],
    temperature_2m_min: [],
    apparent_temperature_max: [],
    apparent_temperature_min: [],
    precipitation_sum: [],
    precipitation_probability_max: [],
    wind_speed_10m_max: []
  };

  for (let i = 0; i < daily.time.length; i++) {
    const date = daily.time[i];
    if (date && date >= dateRange.start.date && date <= dateRange.end.date) {
      filteredDaily.time.push(date);
      if (daily.temperature_2m_max && filteredDaily.temperature_2m_max) filteredDaily.temperature_2m_max.push(daily.temperature_2m_max[i] ?? null);
      if (daily.temperature_2m_min && filteredDaily.temperature_2m_min) filteredDaily.temperature_2m_min.push(daily.temperature_2m_min[i] ?? null);
      if (daily.apparent_temperature_max && filteredDaily.apparent_temperature_max) filteredDaily.apparent_temperature_max.push(daily.apparent_temperature_max[i] ?? null);
      if (daily.apparent_temperature_min && filteredDaily.apparent_temperature_min) filteredDaily.apparent_temperature_min.push(daily.apparent_temperature_min[i] ?? null);
      if (daily.precipitation_sum && filteredDaily.precipitation_sum) filteredDaily.precipitation_sum.push(daily.precipitation_sum[i] ?? null);
      if (daily.precipitation_probability_max && filteredDaily.precipitation_probability_max) filteredDaily.precipitation_probability_max.push(daily.precipitation_probability_max[i] ?? null);
      if (daily.wind_speed_10m_max && filteredDaily.wind_speed_10m_max) filteredDaily.wind_speed_10m_max.push(daily.wind_speed_10m_max[i] ?? null);
    }
  }

  return formatDailyTable(filteredDaily, units, timezone ?? "auto");
}

async function fetchHourlyWeather(
  lat: number,
  lon: number,
  dateRange: NonNullable<ReturnType<typeof parseDateRange>>,
  useHistorical: boolean,
  units: ReturnType<typeof getImperialUnits>
): Promise<string> {
  const apiUrl = useHistorical ? await getHistoricalApiUrl() : await getForecastApiUrl();
  const url = buildWeatherUrl(apiUrl, lat, lon, units);

  if (useHistorical) {
    url.searchParams.set("start_date", dateRange.start.date);
    url.searchParams.set("end_date", dateRange.end.date);
  } else {
    url.searchParams.set("forecast_days", "7");
  }

  url.searchParams.set("hourly", HOURLY_FIELDS.join(","));

  const timeoutMs = await getWeatherTimeoutMs();
  const result = await fetchWeatherJson<ForecastResponse | HistoricalResponse>(url, timeoutMs);
  if (!result.ok) return result.error;

  const { hourly, timezone } = result.data;
  if (!hourly?.time?.length) return "No hourly weather data available for the specified range.";

  // Filter to requested date/time range
  const startDateTime = dateRange.start.time
    ? `${dateRange.start.date}T${dateRange.start.time}`
    : `${dateRange.start.date}T00:00`;
  const endDateTime = dateRange.end.time
    ? `${dateRange.end.date}T${dateRange.end.time}`
    : `${dateRange.end.date}T23:59`;

  const filteredHourly: HourlyWeather = {
    time: [],
    temperature_2m: [],
    apparent_temperature: [],
    precipitation_probability: [],
    wind_speed_10m: [],
    precipitation: []
  };

  for (let i = 0; i < hourly.time.length; i++) {
    const time = hourly.time[i];
    if (time && time >= startDateTime && time <= endDateTime) {
      filteredHourly.time.push(time);
      if (hourly.temperature_2m && filteredHourly.temperature_2m) filteredHourly.temperature_2m.push(hourly.temperature_2m[i] ?? null);
      if (hourly.apparent_temperature && filteredHourly.apparent_temperature) filteredHourly.apparent_temperature.push(hourly.apparent_temperature[i] ?? null);
      if (hourly.precipitation_probability && filteredHourly.precipitation_probability) filteredHourly.precipitation_probability.push(hourly.precipitation_probability[i] ?? null);
      if (hourly.wind_speed_10m && filteredHourly.wind_speed_10m) filteredHourly.wind_speed_10m.push(hourly.wind_speed_10m[i] ?? null);
      if (hourly.precipitation && filteredHourly.precipitation) filteredHourly.precipitation.push(hourly.precipitation[i] ?? null);
    }
  }

  return formatHourlyTable(filteredHourly, units, timezone ?? "auto");
}
