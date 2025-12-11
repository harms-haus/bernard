import assert from "node:assert/strict";
import test from "node:test";

import {
  getWeatherCurrentTool,
  getWeatherForecastTool,
  getWeatherHistoricalTool
} from "../agent/harness/intent/tools";
import { chooseUnits, parseTarget } from "../agent/harness/intent/tools/weather-common";

const TEST_TIMEOUT = 2000;
const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
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
});

test("get_weather_current returns a formatted snapshot", { timeout: TEST_TIMEOUT }, async () => {
  const calls = mockFetchSequence([
    jsonResponse({
      current: {
        time: "2024-04-01T12:00",
        temperature_2m: 68,
        apparent_temperature: 66,
        precipitation: 0,
        wind_speed_10m: 8,
        relative_humidity_2m: 40,
        weather_code: 2
      },
      timezone: "America/New_York"
    })
  ]);

  const result = await getWeatherCurrentTool.invoke({ lat: 40.7128, lon: -74.006, country: "US" });
  const output = String(result);

  const firstCall = calls[0];
  assert.ok(firstCall);
  const rawInput = firstCall.input;
  const url =
    typeof rawInput === "string"
      ? new URL(rawInput)
      : rawInput instanceof URL
        ? rawInput
        : new URL((rawInput as Request).url);
  assert.equal(url.searchParams.get("temperature_unit"), "fahrenheit");
  assert.match(output, /Current @ 2024-04-01T12:00/);
  assert.match(output, /Temp 68.0°F/);
  assert.match(output, /Conditions: clear/);
});

test("get_weather_forecast returns today/tomorrow summaries when target is missing", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([
    jsonResponse({
      daily: {
        time: ["2025-02-01", "2025-02-02"],
        temperature_2m_max: [20, 22],
        temperature_2m_min: [10, 12],
        apparent_temperature_max: [19, 21],
        apparent_temperature_min: [9, 11],
        precipitation_sum: [5, 1],
        precipitation_probability_max: [60, 30],
        wind_speed_10m_max: [15, 12]
      },
      hourly: { time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], wind_speed_10m: [] },
      timezone: "UTC"
    })
  ]);

  const result = await getWeatherForecastTool.invoke({ lat: 48.8566, lon: 2.3522, units: "metric" });
  const output = String(result);

  assert.match(output, /Today \(2025-02-01\):/);
  assert.match(output, /Tomorrow \(2025-02-02\):/);
});

test("get_weather_historical supports targeted datetime lookups", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([
    jsonResponse({
      daily: {
        time: ["2024-01-10"],
        temperature_2m_max: [5],
        temperature_2m_min: [-1],
        apparent_temperature_max: [3],
        apparent_temperature_min: [-2],
        precipitation_sum: [2],
        wind_speed_10m_max: [12]
      },
      hourly: {
        time: ["2024-01-10T03:00", "2024-01-10T06:00"],
        temperature_2m: [1, 2],
        apparent_temperature: [-1, 0],
        precipitation_probability: [40, 20],
        wind_speed_10m: [10, 8]
      },
      timezone: "UTC"
    })
  ]);

  const result = await getWeatherHistoricalTool.invoke({
    lat: 51.5072,
    lon: -0.1276,
    target: "2024-01-10T04:30"
  });
  const output = String(result);

  assert.match(output, /Historical for 2024-01-10/);
  assert.match(output, /2024-01-10T03:00: temp 1.0°C/);
});
