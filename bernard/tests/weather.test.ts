import assert from "node:assert/strict";
import test from "node:test";

import { weatherTool } from "../libs/tools/weather";

const TEST_TIMEOUT = 2000;
const originalFetch = globalThis.fetch;
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info
};

test.beforeEach(() => {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  console.info = () => {};
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.info = originalConsole.info;
});

function mockFetchSequence(responses: Array<Response | Error>) {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init === undefined) {
      calls.push({ input });
    } else {
      calls.push({ input, init });
    }
    const next = responses.shift();
    if (!next) {
      throw new Error("Unexpected fetch call");
    }
    if (next instanceof Error) {
      throw next;
    }
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

function textResponse(text: string, init?: ResponseInit) {
  return new Response(text, {
    status: init?.status ?? 200,
    ...(init?.statusText !== undefined ? { statusText: init.statusText } : {})
  });
}

void test("returns prompt for blank location", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([]);
  const result = await weatherTool.invoke({ location: "   ", units: "metric" });
  assert.equal(result, "Please provide a location (city, region, or coordinates).");
});

void test("returns prompt when location is missing", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([]);
  const result = await weatherTool.invoke({});
  assert.equal(result, "Please provide a location (city, region, or coordinates).");
});

void test("surfaces geocoding HTTP failures", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([textResponse("upstream down", { status: 502, statusText: "Bad Gateway" })]);

  const result = await weatherTool.invoke({ location: "Paris", units: "metric" });

  assert.match(result as string, /Weather lookup failed: Geocoding failed: 502/);
  assert.match(result as string, /upstream down/);
});

void test("returns friendly error when geocoding has no results", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([jsonResponse({ results: [] })]);

  const result = await weatherTool.invoke({ location: "Nowhere", units: "metric" });

  assert.match(result as string, /Could not find location "Nowhere"/);
});

void test("errors when forecast payload is missing daily time", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([
    jsonResponse({ results: [{ name: "Testville", latitude: 1, longitude: 2, timezone: "UTC" }] }),
    jsonResponse({ daily: {} })
  ]);

  const result = await weatherTool.invoke({ location: "Testville", units: "metric" });

  assert.match(result as string, /Weather lookup failed: Forecast data missing or malformed/);
});

void test("returns metric forecast with historical and air quality notes", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([
    jsonResponse({ results: [{ name: "Paris", country: "FR", latitude: 1, longitude: 2, timezone: "Europe/Paris" }] }),
    jsonResponse({
      daily: {
        time: ["2024-04-01", "2024-04-02", "2024-04-03"],
        temperature_2m_max: [30, 24, 26],
        temperature_2m_min: [20, 15, 16],
        apparent_temperature_max: [31, 25, 27],
        apparent_temperature_min: [21, 16, 17],
        precipitation_sum: [10, 2, 3],
        precipitation_probability_max: [70, 30, 40],
        wind_speed_10m_max: [15, 10, 12]
      },
      timezone: "Europe/Paris"
    }),
    jsonResponse({
      daily: {
        time: ["2023-04-01", "2022-04-01", "2021-04-01", "2020-04-01"],
        temperature_2m_max: [15, 12, 14, 16],
        temperature_2m_min: [5, 4, 6, 5],
        precipitation_sum: [1.2, 1.0, 0.8, 0.5]
      }
    }),
    jsonResponse({
      hourly: {
        time: ["2024-04-01T01:00", "2024-04-01T05:00"],
        european_aqi: [90, 50],
        pm2_5: [30, 10],
        pm10: [40, 15]
      }
    })
  ]);

  const result = await weatherTool.invoke({ location: "Paris", units: "metric" });
  const output = String(result);

  assert.match(output, /Location: Paris, FR/);
  assert.match(output, /Today \(2024-04-01\): high 30\.0°C, low 20\.0°C/);
  assert.match(output, /In 2 days \(2024-04-03\): high 26\.0°C, low 16\.0°C/);
  assert.match(output, /Historical: Today's high 30\.0°C is warmer than usual/);
  assert.match(output, /Precipitation is elevated for this date \(10\.0 mm vs typical ~0\.9\)/);
  assert.match(output, /Air quality: Air quality is very poor today \(max AQI 90/);
});

void test("formats imperial units and ignores optional failures", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([
    jsonResponse({
      results: [{ name: "Denver", country: "US", latitude: 39.74, longitude: -104.99, timezone: "America/Denver" }]
    }),
    jsonResponse({
      daily: {
        time: ["2024-08-01", "2024-08-02", "2024-08-03"],
        temperature_2m_max: [86, 82, 80],
        temperature_2m_min: [60, 58, 57],
        apparent_temperature_max: [90, 84, 81],
        apparent_temperature_min: [62, 59, 58],
        precipitation_sum: [25.4, 0, 10],
        precipitation_probability_max: [50, 10, 20],
        wind_speed_10m_max: [20, 15, 12]
      },
      timezone: "America/Denver"
    }),
    textResponse("historical unavailable", { status: 500, statusText: "Server Error" }),
    textResponse("air quality unavailable", { status: 500, statusText: "Server Error" })
  ]);

  const result = await weatherTool.invoke({ location: "Denver", units: "imperial" });
  const output = String(result);

  assert.match(output, /Location: Denver, US/);
  assert.match(output, /Today \(2024-08-01\): high 86\.0°F, low 60\.0°F/);
  assert.match(output, /precip 1\.00 in/);
  assert.match(output, /wind up to 20\.0 mph/);
  assert.match(output, /In 2 days \(2024-08-03\): high 80\.0°F, low 57\.0°F/);
  assert.ok(!output.includes("Historical:"), "Historical note should be omitted when request fails");
  assert.ok(!output.includes("Air quality:"), "Air quality note should be omitted when request fails");
});

void test("handles invalid JSON from geocoding gracefully", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([new Response("not-json")]);

  const result = await weatherTool.invoke({ location: "???", units: "metric" });

  assert.match(result as string, /Could not find location/);
});

void test("fails when forecast anchor date is missing", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([
    jsonResponse({ results: [{ name: "Nullville", latitude: 0, longitude: 0 }] }),
    jsonResponse({
      daily: {
        time: [null],
        temperature_2m_max: [null],
        temperature_2m_min: [null]
      }
    })
  ]);

  const result = await weatherTool.invoke({ location: "Nullville", units: "metric" });

  assert.match(result as string, /Weather lookup failed: Forecast data missing anchor date/);
});

void test("defaults to metric units and shows fallback summaries when data is sparse", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([
    jsonResponse({ results: [{ name: "Sparse City", latitude: 10, longitude: 20 }] }),
    jsonResponse({
      daily: {
        time: ["2024-05-01"],
        temperature_2m_max: [null],
        temperature_2m_min: [null],
        apparent_temperature_max: [null],
        apparent_temperature_min: [null],
        precipitation_sum: [null],
        precipitation_probability_max: [null],
        wind_speed_10m_max: [null]
      },
      timezone: "UTC"
    }),
    textResponse("historical missing", { status: 500 }),
    jsonResponse({
      hourly: {
        time: ["2024-05-02T00:00"],
        european_aqi: [30],
        pm2_5: [5],
        pm10: [8]
      }
    })
  ]);

  const result = await weatherTool.invoke({ location: "Sparse City" });
  const output = String(result);

  assert.match(output, /Today \(2024-05-01\): No forecast details available\./);
  assert.match(output, /In 2 days: No forecast available\./);
  assert.ok(!output.includes("Historical:"), "No historical note expected when data missing");
  assert.ok(!output.includes("Air quality:"), "No air quality note when date does not match");
});

void test("highlights cold and dry anomalies and excellent air quality", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([
    jsonResponse({ results: [{ name: "Chilltown", latitude: 50, longitude: 8, timezone: "UTC" }] }),
    jsonResponse({
      daily: {
        time: ["2024-02-01", "2024-02-02", "2024-02-03"],
        temperature_2m_max: [5, 6, 7],
        temperature_2m_min: [-1, -2, -3],
        apparent_temperature_max: [4, 5, 6],
        apparent_temperature_min: [-2, -3, -4],
        precipitation_sum: [0.1, 0.2, 0.3],
        precipitation_probability_max: [10, 20, 30],
        wind_speed_10m_max: [5, 6, 7]
      },
      timezone: "UTC"
    }),
    jsonResponse({
      daily: {
        time: ["2023-02-01", "2022-02-01", "2021-02-01"],
        temperature_2m_max: [15, 14, 16],
        temperature_2m_min: [5, 4, 6],
        precipitation_sum: [2, 2.5, 3]
      }
    }),
    jsonResponse({
      hourly: {
        time: ["2024-02-01T10:00"],
        european_aqi: [10],
        pm2_5: [3.5],
        pm10: [5.0]
      }
    })
  ]);

  const result = await weatherTool.invoke({ location: "Chilltown", units: "metric" });
  const output = String(result);

  assert.match(output, /colder than usual for this date/);
  assert.match(output, /drier than usual for this date/);
  assert.match(output, /Air quality: Air quality is excellent today \(max AQI 10/);
});

void test("surfaces forecast HTTP failures", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([
    jsonResponse({ results: [{ name: "Failtown", latitude: 1, longitude: 2 }] }),
    textResponse("nope", { status: 503, statusText: "Service Unavailable" })
  ]);

  const result = await weatherTool.invoke({ location: "Failtown", units: "metric" });

  assert.match(result as string, /Weather lookup failed: Forecast lookup failed: 503/);
});

void test("omits air quality note when AQI is moderate", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([
    jsonResponse({ results: [{ name: "Breezy", latitude: 5, longitude: 6, timezone: "UTC" }] }),
    jsonResponse({
      daily: {
        time: ["2024-06-01", "2024-06-02", "2024-06-03"],
        temperature_2m_max: [22, 23, 24],
        temperature_2m_min: [12, 13, 14],
        apparent_temperature_max: [23, 24, 25],
        apparent_temperature_min: [13, 14, 15],
        precipitation_sum: [1, 1, 1],
        precipitation_probability_max: [20, 30, 40],
        wind_speed_10m_max: [10, 11, 12]
      },
      timezone: "UTC"
    }),
    jsonResponse({
      daily: {
        time: ["2023-06-01", "2022-06-01", "2021-06-01"],
        temperature_2m_max: [22, 22, 23],
        temperature_2m_min: [12, 12, 13],
        precipitation_sum: [1, 1, 1]
      }
    }),
    jsonResponse({
      hourly: {
        time: ["2024-06-01T10:00"],
        european_aqi: [40],
        pm2_5: [5],
        pm10: [8]
      }
    })
  ]);

  const result = await weatherTool.invoke({ location: "Breezy", units: "metric" });
  const output = String(result);

  assert.ok(!output.includes("Air quality:"), "No AQ note for moderate AQI");
});

void test("skips historical note when insufficient samples", { timeout: TEST_TIMEOUT }, async () => {
  mockFetchSequence([
    jsonResponse({ results: [{ name: "Sampletown", latitude: 9, longitude: 9, timezone: "UTC" }] }),
    jsonResponse({
      daily: {
        time: ["2024-09-01", "2024-09-02", "2024-09-03"],
        temperature_2m_max: [25, 26, 27],
        temperature_2m_min: [15, 16, 17],
        apparent_temperature_max: [26, 27, 28],
        apparent_temperature_min: [16, 17, 18],
        precipitation_sum: [1, 1, 1],
        precipitation_probability_max: [20, 20, 20],
        wind_speed_10m_max: [10, 10, 10]
      },
      timezone: "UTC"
    }),
    jsonResponse({
      daily: {
        time: ["2023-09-01", "2022-09-01"], // only two samples, below threshold
        temperature_2m_max: [24, 24],
        temperature_2m_min: [14, 14],
        precipitation_sum: [1, 1]
      }
    }),
    textResponse("aq missing", { status: 500 })
  ]);

  const result = await weatherTool.invoke({ location: "Sampletown", units: "metric" });
  const output = String(result);

  assert.ok(!output.includes("Historical:"), "Historical note omitted with insufficient samples");
});

