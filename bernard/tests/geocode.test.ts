import assert from "node:assert/strict";
import { afterEach, test } from "vitest";

import {
  buildGeocodeUrl,
  buildHeaders,
  createGeocodeTool,
  extractJsonError,
  formatCoordinate,
  formatPlaceSummary,
  normalizeLabel,
  parsePlaces,
  summarizePlaces
} from "../agent/tool/geocode.tool";

const TEST_TIMEOUT = 2000;
const originalFetch = globalThis.fetch;

type FetchCall = { input: RequestInfo | URL; init?: RequestInit };

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    ...(init?.statusText !== undefined ? { statusText: init.statusText } : {}),
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });

const textResponse = (body: string, init?: ResponseInit) =>
  new Response(body, {
    status: init?.status ?? 200,
    ...(init?.statusText !== undefined ? { statusText: init.statusText } : {})
  });

const mockFetchSequence = (responses: Array<Response | Error>) => {
  const calls: FetchCall[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    const next = responses.shift();
    if (!next) throw new Error("Unexpected fetch call");
    if (next instanceof Error) throw next;
    return next;
  };
  return calls;
};

const baseConfig = () => ({
  apiUrl: "https://geo.example.com/search",
  userAgent: "bernard-test-agent",
  email: "user@example.com",
  referer: "https://example.com/ref"
});

const fakeConfig = (overrides?: Partial<ReturnType<typeof baseConfig>>) => {
  return async () => ({ ...baseConfig(), ...(overrides ?? {}) });
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

void test(
  "buildGeocodeUrl applies defaults and lowercases country",
  { timeout: TEST_TIMEOUT },
  () => {
    const url = buildGeocodeUrl(
      { query: "Berlin", country: "DE", language: "de" },
      baseConfig()
    );
    assert.equal(url.searchParams.get("q"), "Berlin");
    assert.equal(url.searchParams.get("format"), "jsonv2");
    assert.equal(url.searchParams.get("limit"), "3");
    assert.equal(url.searchParams.get("addressdetails"), "1");
    assert.equal(url.searchParams.get("dedupe"), "1");
    assert.equal(url.searchParams.get("polygon_geojson"), "0");
    assert.equal(url.searchParams.get("extratags"), "0");
    assert.equal(url.searchParams.get("countrycodes"), "de");
    assert.equal(url.searchParams.get("accept-language"), "de");
  }
);

void test(
  "buildHeaders sets only user agent when referer missing",
  { timeout: TEST_TIMEOUT },
  () => {
    const headers = buildHeaders({ ...baseConfig(), referer: undefined });
    const ua =
      headers instanceof Headers
        ? headers.get("User-Agent")
        : (headers as Record<string, string>)["User-Agent"];
    const referer =
      headers instanceof Headers
        ? headers.get("Referer")
        : (headers as Record<string, string>)["Referer"];
    assert.equal(ua, "bernard-test-agent");
    assert.equal(referer, undefined);
  }
);

void test(
  "geocode verifyConfiguration blocks missing user agent",
  { timeout: TEST_TIMEOUT },
  async () => {
    const tool = createGeocodeTool({
      configLoader: fakeConfig({ userAgent: undefined })
    });
    const verify = await tool.verifyConfiguration?.();
    assert.equal(verify?.ok, false);
    assert.match(verify?.reason ?? "", /NOMINATIM_USER_AGENT/i);
  }
);

void test(
  "geocode verifyConfiguration passes when configured",
  { timeout: TEST_TIMEOUT },
  async () => {
    const tool = createGeocodeTool({ configLoader: fakeConfig() });
    const verify = await tool.verifyConfiguration?.();
    assert.equal(verify?.ok, true);
  }
);

void test(
  "geocode invoke returns config error when user agent missing",
  { timeout: TEST_TIMEOUT },
  async () => {
    const tool = createGeocodeTool({
      configLoader: fakeConfig({ userAgent: undefined })
    });
    const output = String(await tool.invoke({ query: "Paris", limit: 1 }));
    assert.match(output, /missing NOMINATIM_USER_AGENT/i);
  }
);

void test(
  "geocode invoke builds request with params and headers",
  { timeout: TEST_TIMEOUT },
  async () => {
    const calls = mockFetchSequence([
      jsonResponse([
        { display_name: "Paris, Île-de-France, France", lat: "48.8566", lon: "2.3522" }
      ])
    ]);

    const tool = createGeocodeTool({ configLoader: fakeConfig() });
    const output = String(
      await tool.invoke({ query: "Paris", limit: 2, country: "FR", language: "fr" })
    );
    assert.match(output, /1\. Paris/);

    const firstCall = calls[0];
    assert.ok(firstCall);
    const rawUrl = firstCall.input instanceof Request ? firstCall.input.url : firstCall.input;
    const calledUrl =
      typeof rawUrl === "string" ? new URL(rawUrl) : rawUrl instanceof URL ? rawUrl : null;
    assert.ok(calledUrl);
    assert.equal(calledUrl?.searchParams.get("q"), "Paris");
    assert.equal(calledUrl?.searchParams.get("limit"), "2");
    assert.equal(calledUrl?.searchParams.get("countrycodes"), "fr");
    assert.equal(calledUrl?.searchParams.get("accept-language"), "fr");
    assert.equal(calledUrl?.searchParams.get("email"), "user@example.com");

    const headers = firstCall.init?.headers;
    const userAgent =
      headers instanceof Headers
        ? headers.get("User-Agent")
        : headers && typeof headers === "object"
          ? (headers as Record<string, string>)["User-Agent"]
          : undefined;
    const referer =
      headers instanceof Headers
        ? headers.get("Referer")
        : headers && typeof headers === "object"
          ? (headers as Record<string, string>)["Referer"]
          : undefined;
    assert.equal(userAgent, "bernard-test-agent");
    assert.equal(referer, "https://example.com/ref");
  }
);

void test(
  "geocode returns error string on non-OK response",
  { timeout: TEST_TIMEOUT },
  async () => {
    mockFetchSequence([textResponse("fail", { status: 500, statusText: "oops" })]);
    const tool = createGeocodeTool({ configLoader: fakeConfig() });
    const output = String(await tool.invoke({ query: "Nowhere", limit: 1 }));
    assert.match(output, /Geocoding failed: 500 oops fail/);
  }
);

void test(
  "geocode returns parse error message on bad JSON",
  { timeout: TEST_TIMEOUT },
  async () => {
    mockFetchSequence([textResponse("not json", { status: 200 })]);
    const tool = createGeocodeTool({ configLoader: fakeConfig() });
    const output = String(await tool.invoke({ query: "Nowhere", limit: 1 }));
    assert.match(output, /Failed to parse JSON response/);
  }
);

void test(
  "geocode returns structured error on network failure",
  { timeout: TEST_TIMEOUT },
  async () => {
    mockFetchSequence([new Error("connection reset")]);
    const tool = createGeocodeTool({ configLoader: fakeConfig() });
    const output = await tool.invoke({ query: "Nowhere", limit: 1 });
    const errorResult = output as { status?: string; message?: string; errorType?: string };
    assert.equal(errorResult.status, "error");
    assert.match(String(errorResult.message ?? ""), /Geocoding failed: network error: connection reset/);
    assert.equal(errorResult.errorType, "Error");
  }
);

void test(
  "geocode summarises multiple places with defaults",
  { timeout: TEST_TIMEOUT },
  async () => {
    mockFetchSequence([
      jsonResponse([
        {
          display_name: "Seattle, Washington, United States",
          lat: "47.6062",
          lon: "-122.3321",
          type: "city",
          importance: 0.75,
          address: { city: "Seattle", state: "Washington", country_code: "us" }
        },
        {
          display_name: "Seattle, County Durham, England",
          lat: "55.0000",
          lon: "not-a-number",
          class: "village",
          address: { village: "Seattle", county: "Durham", country: "UK" }
        }
      ])
    ]);

    const tool = createGeocodeTool({ configLoader: fakeConfig() });
    const output = String(await tool.invoke({ query: "Seattle" }));

    assert.match(output, /1\. Seattle, Washington, US — 47\.60620, -122\.33210 \(city\), score 0\.75/);
    assert.match(output, /2\. Seattle, Durham, UK — 55\.00000, \? \(village\)/);
  }
);

void test(
  "normalizeLabel falls back to display_name when compact label missing",
  { timeout: TEST_TIMEOUT },
  () => {
    const label = normalizeLabel({
      display_name: "Unknown, Planet, Milky Way"
    });
    assert.equal(label.replace(/\s+/g, " ").trim(), "Unknown, Planet, Milky Way");
  }
);

void test(
  "formatCoordinate handles missing and non-numeric values",
  { timeout: TEST_TIMEOUT },
  () => {
    assert.equal(formatCoordinate(undefined), "?");
    assert.equal(formatCoordinate("abc"), "?");
    assert.equal(formatCoordinate("1.23456"), "1.23456");
  }
);

void test(
  "extractJsonError returns formatted error with detail",
  { timeout: TEST_TIMEOUT },
  () => {
    const error = extractJsonError({ error: "bad", detail: "parse fail" });
    assert.equal(error, "bad (parse fail)");
  }
);

void test(
  "parsePlaces filters non-object entries",
  { timeout: TEST_TIMEOUT },
  () => {
    const places = parsePlaces([
      { display_name: "ok" },
      "string",
      null,
      { display_name: "still ok", lat: "1", lon: "2" }
    ]);
    assert.equal(places.length, 2);
  }
);

void test(
  "formatPlaceSummary and summarizePlaces respect limit and class fallback",
  { timeout: TEST_TIMEOUT },
  () => {
    const places = [
      { display_name: "One", lat: "1", lon: "2", type: "city" },
      { display_name: "Two", lat: "3", lon: "4", class: "hamlet" }
    ];
    const summary = summarizePlaces(places, 1);
    assert.match(summary, /1\. One — 1\.00000, 2\.00000 \(city\)/);
    assert.doesNotMatch(summary, /Two/);
    const detailed = formatPlaceSummary(places[1], 1);
    assert.match(detailed, /2\. Two — 3\.00000, 4\.00000 \(hamlet\)/);
  }
);
