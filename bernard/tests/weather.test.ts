import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";

import { getWeatherDataTool } from "../agent/tool";
import { chooseUnits, parseTarget, parseDateRange, getImperialUnits } from "../lib/weather";

const TEST_TIMEOUT = 2000;
const originalFetch = globalThis.fetch;

// Mock geocoding functionality - returns coordinates for "New York, NY"
const mockGeocodeResponse = {
  ok: true,
  json: async () => [{
    lat: "40.7128",
    lon: "-74.0060",
    display_name: "New York, New York",
    importance: 0.8
  }]
};

beforeEach(() => {
  // Set environment variable for geocoding
  process.env["NOMINATIM_USER_AGENT"] = "test-agent";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env["NOMINATIM_USER_AGENT"];
});

function mockFetchSequence(responses: Array<Response | Error>) {
  const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init: init ?? undefined });
    const next = responses.shift();
    if (!next) throw new Error("Unexpected fetch call");
    if (next instanceof Error) throw next;
    return next;
  };
  return calls;
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    ...(init?.statusText !== undefined ? { statusText: init.statusText } : {}),
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
}

test("getImperialUnits returns imperial units", () => {
  const units = getImperialUnits();
  assert.equal(units.temperatureUnit, "fahrenheit");
  assert.equal(units.windSpeedUnit, "mph");
  assert.equal(units.precipUnit, "inch");
  assert.equal(units.tempLabel, "°F");
  assert.equal(units.windLabel, "mph");
  assert.equal(units.precipLabel, "in");
});

test("chooseUnits infers units from country and coordinates", () => {
  const usUnits = chooseUnits(undefined, "US");
  assert.equal(usUnits.temperatureUnit, "fahrenheit");
  const forcedMetric = chooseUnits("metric", "US");
  assert.equal(forcedMetric.temperatureUnit, "celsius");
  const coordUnits = chooseUnits(undefined, undefined, 37, -122);
  assert.equal(coordUnits.windSpeedUnit, "mph");
  const frUnits = chooseUnits(undefined, "FR", 48.8566, 2.3522);
  assert.equal(frUnits.windSpeedUnit, "kmh");
});

test("parseTarget handles relative words and ISO dates", () => {
  const anchor = "2025-02-01";
  assert.deepEqual(parseTarget("tomorrow", anchor), { date: "2025-02-02" });
  assert.deepEqual(parseTarget("2025-03-05", anchor), { date: "2025-03-05" });
  assert.deepEqual(parseTarget("2025-03-05T15:00Z", anchor), { date: "2025-03-05", time: "15:00z" });
  const nowResult = parseTarget("now", anchor);
  assert.ok(nowResult);
  assert.equal(nowResult.date, anchor);
  assert.ok(nowResult.time);
  assert.match(nowResult.time, /^\d{2}:\d{2}$/);
});

test("parseDateRange handles date range parsing", () => {
  const anchor = "2025-02-01";
  const range = parseDateRange("today", "tomorrow", anchor);
  assert.ok(range);
  assert.equal(range.start.date, anchor);
  assert.equal(range.end.date, "2025-02-02");
});

test("get_weather_data current weather with 'now'", { timeout: TEST_TIMEOUT }, async () => {
  const calls = mockFetchSequence([
    mockGeocodeResponse,
    jsonResponse({
      current: {
        time: "2024-04-01T12:00",
        temperature_2m: 68,
        apparent_temperature: 66,
        precipitation: 0,
        precipitation_probability: 10,
        wind_speed_10m: 8
      },
      timezone: "America/New_York"
    })
  ]);

  const result = await getWeatherDataTool.invoke({
    area_search: "New York, NY",
    startDateTime: "now",
    endDateTime: "now",
    period: "hourly"
  });
  const output = String(result);

  const weatherCall = calls[1]; // Second call is the weather API call
  assert.ok(weatherCall);
  const rawInput = weatherCall.input;
  const url =
    typeof rawInput === "string"
      ? new URL(rawInput)
      : rawInput instanceof URL
        ? rawInput
        : new URL((rawInput as Request).url);
  assert.equal(url.searchParams.get("temperature_unit"), "fahrenheit");
  assert.match(output, /## Current Weather/);
  assert.match(output, /\*\*Temperature:\*\* 68°F/);
});

test("get_weather_data daily forecast with date range", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([
    mockGeocodeResponse,
    jsonResponse({
      daily: {
        time: ["2025-02-01", "2025-02-02"],
        temperature_2m_max: [68, 70],
        temperature_2m_min: [50, 52],
        apparent_temperature_max: [66, 68],
        apparent_temperature_min: [48, 50],
        precipitation_sum: [0, 0.1],
        precipitation_probability_max: [10, 20],
        wind_speed_10m_max: [10, 12]
      },
      hourly: { time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], wind_speed_10m: [], precipitation: [] },
      timezone: "America/New_York"
    })
  ]);

  const result = await getWeatherDataTool.invoke({
    area_search: "New York, NY",
    startDateTime: "2025-02-01",
    endDateTime: "2025-02-02",
    period: "daily"
  });
  const output = String(result);

  assert.match(output, /\| Date/);
  assert.match(output, /\| High \(°F\)/);
  assert.match(output, /2025-02-01/);
  assert.match(output, /2025-02-02/);
});

test("get_weather_data hourly data", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([
    mockGeocodeResponse,
    jsonResponse({
      hourly: {
        time: ["2025-02-01T12:00", "2025-02-01T15:00"],
        temperature_2m: [68, 72],
        apparent_temperature: [66, 70],
        precipitation_probability: [10, 20],
        wind_speed_10m: [8, 10],
        precipitation: [0, 0]
      },
      timezone: "America/New_York"
    })
  ]);

  const result = await getWeatherDataTool.invoke({
    area_search: "New York, NY",
    startDateTime: "2025-02-01T10:00",
    endDateTime: "2025-02-01T16:00",
    period: "hourly"
  });
  const output = String(result);

  assert.match(output, /\| Time/);
  assert.match(output, /\| Temp \(°F\)/);
  assert.match(output, /12:00/);
  assert.match(output, /15:00/);
});

test("get_weather_data average calculation", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([
    mockGeocodeResponse,
    jsonResponse({
      hourly: {
        time: ["2025-02-01T12:00", "2025-02-01T15:00"],
        temperature_2m: [68, 72],
        apparent_temperature: [66, 70],
        precipitation_probability: [10, 20],
        wind_speed_10m: [8, 10],
        precipitation: [0, 0.1]
      },
      timezone: "America/New_York"
    })
  ]);

  const result = await getWeatherDataTool.invoke({
    area_search: "New York, NY",
    startDateTime: "2025-02-01T10:00",
    endDateTime: "2025-02-01T16:00",
    period: "average"
  });
  const output = String(result);

  assert.match(output, /\| Metric/);
  assert.match(output, /\| Average Value/);
  assert.match(output, /Temperature/);
  assert.match(output, /70\.0°F/); // Average of 68 and 72
});

test("get_weather_data rejects low confidence geocoding", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([
    {
      ok: true,
      json: async () => [{
        lat: "40.7128",
        lon: "-74.0060",
        display_name: "Ambiguous Location",
        importance: 0.1  // Low confidence
      }]
    }
  ]);

  const result = await getWeatherDataTool.invoke({
    area_search: "ambiguous location",
    startDateTime: "now",
    endDateTime: "now",
    period: "hourly"
  });
  const output = String(result);

  assert.match(output, /low confidence \(0\.100\)/);
  assert.match(output, /check the spelling/);
});

test("get_weather_data historical data", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([
    mockGeocodeResponse,
    jsonResponse({
      daily: {
        time: ["2024-01-10"],
        temperature_2m_max: [32],
        temperature_2m_min: [20],
        apparent_temperature_max: [30],
        apparent_temperature_min: [18],
        precipitation_sum: [0.2],
        precipitation_probability_max: [50],
        wind_speed_10m_max: [15]
      },
      hourly: { time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], wind_speed_10m: [], precipitation: [] },
      timezone: "America/New_York"
    })
  ]);

  const result = await getWeatherDataTool.invoke({
    area_search: "New York, NY",
    startDateTime: "2024-01-10",
    endDateTime: "2024-01-10",
    period: "daily"
  });
  const output = String(result);

  assert.match(output, /\| Date/);
  assert.match(output, /32/); // Should show Fahrenheit temperatures
});
