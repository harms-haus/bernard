import assert from "node:assert/strict";
import { afterEach, test } from "vitest";

import { getSettings } from "@/lib/config/settingsCache";
import {
  buildBraveSearchUrl,
  buildSearXNGUrl,
  formatResults,
  parseBraveResults,
  parseSearXNGResults,
  resolveBraveConfigFromEnv,
  resolveSearchConfig,
  resolveSearXNGConfigFromEnv,
  safeJson,
  setSettingsFetcher,
  verifySearchConfigured,
  webSearchTool
} from "../agent/tool/web-search.tool";

const TEST_TIMEOUT = 2_000;
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const originalExecArgv = [...process.execArgv];

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
    ...(init?.statusText !== undefined ? { statusText: init.statusText } : {}),
    headers: { "Content-Type": "text/plain", ...(init?.headers ?? {}) }
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

const resetEnv = () => {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
};

afterEach(() => {
  resetEnv();
  globalThis.fetch = originalFetch;
  setSettingsFetcher(getSettings);
  process.execArgv.splice(0, process.execArgv.length, ...originalExecArgv);
});

// SearXNG Configuration Tests
void test(
  "resolveSearXNGConfigFromEnv returns null when SEARXNG_API_URL is missing",
  { timeout: TEST_TIMEOUT },
  () => {
    const result = resolveSearXNGConfigFromEnv();
    assert.equal(result, null);
  }
);

void test(
  "resolveSearXNGConfigFromEnv returns config when SEARXNG_API_URL is set",
  { timeout: TEST_TIMEOUT },
  () => {
    process.env["SEARXNG_API_URL"] = "https://searxng.example.com/search";
    const result = resolveSearXNGConfigFromEnv();
    assert.equal(result?.ok, true);
    assert.equal(result?.apiUrl, "https://searxng.example.com/search");
    assert.equal(result?.provider, "searxng");
  }
);

void test(
  "resolveSearXNGConfigFromEnv includes API key when provided",
  { timeout: TEST_TIMEOUT },
  () => {
    process.env["SEARXNG_API_URL"] = "https://searxng.example.com/search";
    process.env["SEARXNG_API_KEY"] = "test-key";
    const result = resolveSearXNGConfigFromEnv();
    assert.equal(result?.ok, true);
    assert.equal(result?.apiKey, "test-key");
  }
);

void test(
  "resolveSearXNGConfigFromEnv works without API key",
  { timeout: TEST_TIMEOUT },
  () => {
    process.env["SEARXNG_API_URL"] = "https://searxng.example.com/search";
    const result = resolveSearXNGConfigFromEnv();
    assert.equal(result?.ok, true);
    assert.equal(result?.apiKey, "");
  }
);

void test(
  "resolveSearXNGConfigFromEnv rejects invalid URLs",
  { timeout: TEST_TIMEOUT },
  () => {
    process.env["SEARXNG_API_URL"] = "not-a-url";
    const result = resolveSearXNGConfigFromEnv();
    assert.equal(result?.ok, false);
    assert.match(result?.reason ?? "", /Invalid search API URL/);
  }
);

void test(
  "resolveSearXNGConfigFromEnv rejects placeholder keys",
  { timeout: TEST_TIMEOUT },
  () => {
    process.env["SEARXNG_API_URL"] = "https://searxng.example.com/search";
    process.env["SEARXNG_API_KEY"] = "searxng-api-key";
    const result = resolveSearXNGConfigFromEnv();
    assert.equal(result?.ok, false);
    assert.match(result?.reason ?? "", /Replace API key/);
  }
);

// SearXNG URL Construction Tests
void test(
  "buildSearXNGUrl sets correct parameters",
  { timeout: TEST_TIMEOUT },
  () => {
    const url = buildSearXNGUrl("https://searxng.example.com/search", "test query", 5);
    assert.equal(url.searchParams.get("q"), "test query");
    assert.equal(url.searchParams.get("format"), "json");
    assert.equal(url.searchParams.get("pageno"), "1");
    assert.equal(url.searchParams.get("language"), "en-US");
    assert.equal(url.searchParams.get("num"), "5");
  }
);

void test(
  "buildSearXNGUrl limits count to maximum of 8",
  { timeout: TEST_TIMEOUT },
  () => {
    const url = buildSearXNGUrl("https://searxng.example.com/search", "test", 10);
    assert.equal(url.searchParams.get("num"), "8");
  }
);

void test(
  "buildSearXNGUrl works without count parameter",
  { timeout: TEST_TIMEOUT },
  () => {
    const url = buildSearXNGUrl("https://searxng.example.com/search", "test");
    assert.equal(url.searchParams.get("num"), null);
  }
);

void test(
  "buildSearXNGUrl uses starting_index parameter for pageno",
  { timeout: TEST_TIMEOUT },
  () => {
    const url = buildSearXNGUrl("https://searxng.example.com/search", "test query", 5, 3);
    assert.equal(url.searchParams.get("q"), "test query");
    assert.equal(url.searchParams.get("format"), "json");
    assert.equal(url.searchParams.get("pageno"), "3");
    assert.equal(url.searchParams.get("language"), "en-US");
    assert.equal(url.searchParams.get("num"), "5");
  }
);

void test(
  "buildSearXNGUrl defaults to page 1 when starting_index not provided",
  { timeout: TEST_TIMEOUT },
  () => {
    const url = buildSearXNGUrl("https://searxng.example.com/search", "test query", 5);
    assert.equal(url.searchParams.get("pageno"), "1");
  }
);

// SearXNG Response Parsing Tests
void test(
  "parseSearXNGResults handles valid SearXNG response",
  { timeout: TEST_TIMEOUT },
  () => {
    const data = {
      results: [
        {
          title: "Test Result 1",
          url: "https://example.com/1",
          content: "Description 1",
          engine: "google"
        },
        {
          title: "Test Result 2",
          url: "https://example.com/2",
          engine: "bing"
        }
      ]
    };
    const result = parseSearXNGResults(data);
    assert.equal(result.length, 2);
    assert.equal(result[0].title, "Test Result 1");
    assert.equal(result[0].url, "https://example.com/1");
    assert.equal(result[0].description, "Description 1");
    assert.equal(result[1].title, "Test Result 2");
    assert.equal(result[1].url, "https://example.com/2");
    assert.equal(result[1].description, "bing");
  }
);

void test(
  "parseSearXNGResults handles empty results",
  { timeout: TEST_TIMEOUT },
  () => {
    const data = { results: [] };
    const result = parseSearXNGResults(data);
    assert.equal(result.length, 0);
  }
);

void test(
  "parseSearXNGResults handles null/undefined data",
  { timeout: TEST_TIMEOUT },
  () => {
    assert.deepEqual(parseSearXNGResults(null), []);
    assert.deepEqual(parseSearXNGResults(undefined), []);
    assert.deepEqual(parseSearXNGResults({}), []);
    assert.deepEqual(parseSearXNGResults({ results: null }), []);
  }
);

void test(
  "parseSearXNGResults uses engine as description when content missing",
  { timeout: TEST_TIMEOUT },
  () => {
    const data = {
      results: [
        {
          title: "Test",
          url: "https://example.com",
          engine: "google"
        }
      ]
    };
    const result = parseSearXNGResults(data);
    assert.equal(result[0].description, "google");
  }
);

// Configuration Priority Tests
void test(
  "resolveSearchConfig prefers SearXNG over Brave environment variables",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["SEARXNG_API_URL"] = "https://searxng.example.com/search";
    process.env["SEARXNG_API_KEY"] = "searxng-key";
    process.env["SEARCH_API_KEY"] = "brave-key";
    process.env["SEARCH_API_URL"] = "https://api.search.brave.com/res/v1/web/search";

    const result = await resolveSearchConfig();
    assert.equal(result.ok, true);
    assert.equal(result.provider, "searxng");
    assert.equal(result.apiKey, "searxng-key");
    assert.equal(result.apiUrl, "https://searxng.example.com/search");
  }
);

void test(
  "resolveSearchConfig falls back to Brave when SearXNG not configured",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["SEARCH_API_KEY"] = "brave-key";
    process.env["SEARCH_API_URL"] = "https://api.search.brave.com/res/v1/web/search";

    const result = await resolveSearchConfig();
    assert.equal(result.ok, true);
    assert.equal(result.provider, "brave");
    assert.equal(result.apiKey, "brave-key");
  }
);

void test(
  "resolveSearchConfig uses SearXNG settings when available",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["NODE_ENV"] = "development";
    process.execArgv.splice(0, process.execArgv.length);
    setSettingsFetcher(async () => {
      return {
        services: {
          searxng: {
            apiUrl: "https://searxng.settings.com/search",
            apiKey: "settings-key"
          }
        }
      } as any;
    });

    const result = await resolveSearchConfig();
    assert.equal(result.ok, true);
    assert.equal(result.provider, "searxng");
    assert.equal(result.apiUrl, "https://searxng.settings.com/search");
    assert.equal(result.apiKey, "settings-key");
  }
);

void test(
  "resolveSearchConfig falls back to Brave settings when SearXNG not in settings",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["NODE_ENV"] = "development";
    process.execArgv.splice(0, process.execArgv.length);
    setSettingsFetcher(async () => {
      return {
        services: {
          search: {
            apiUrl: "https://brave.settings.com/search",
            apiKey: "settings-key"
          }
        }
      } as any;
    });

    const result = await resolveSearchConfig();
    assert.equal(result.ok, true);
    assert.equal(result.provider, "brave");
    assert.equal(result.apiUrl, "https://brave.settings.com/search");
    assert.equal(result.apiKey, "settings-key");
  }
);

// Error Handling Tests
void test(
  "resolveSearchConfig handles invalid SearXNG URL in settings",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["NODE_ENV"] = "development";
    process.execArgv.splice(0, process.execArgv.length);
    setSettingsFetcher(async () => {
      return {
        services: {
          searxng: {
            apiUrl: "invalid-url",
            apiKey: "settings-key"
          }
        }
      } as any;
    });

    const result = await resolveSearchConfig();
    assert.equal(result.ok, false);
    assert.match(result.reason, /Invalid search API URL/);
  }
);

void test(
  "verifySearchConfigured reports ok for SearXNG",
  { timeout: TEST_TIMEOUT },
  () => {
    process.env["SEARXNG_API_URL"] = "https://searxng.example.com/search";
    const verify = verifySearchConfigured();
    assert.equal(verify.ok, true);
  }
);

void test(
  "verifySearchConfigured reports ok for Brave",
  { timeout: TEST_TIMEOUT },
  () => {
    process.env["SEARCH_API_KEY"] = "brave-key";
    const verify = verifySearchConfigured();
    assert.equal(verify.ok, true);
  }
);

// Integration Tests
void test(
  "webSearchTool uses SearXNG when configured",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["SEARXNG_API_URL"] = "https://searxng.example.com/search";
    mockFetchSequence([
      jsonResponse({
        results: [
          {
            title: "SearXNG Result",
            url: "https://searxng.example.com/result",
            content: "SearXNG description",
            engine: "google"
          }
        ]
      })
    ]);

    const output = String(await webSearchTool.invoke({ query: "test", count: 1 }));
    assert.match(output, /SearXNG Result/);
    assert.match(output, /https:\/\/searxng.example.com\/result/);
  }
);

void test(
  "webSearchTool uses Brave when SearXNG not configured",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["SEARCH_API_KEY"] = "brave-key";
    process.env["SEARCH_API_URL"] = "https://api.search.brave.com/res/v1/web/search";
    mockFetchSequence([
      jsonResponse({
        web: {
          results: [
            {
              title: "Brave Result",
              url: "https://brave.example.com/result",
              description: "Brave description"
            }
          ]
        }
      })
    ]);

    const output = String(await webSearchTool.invoke({ query: "test", count: 1 }));
    assert.match(output, /Brave Result/);
    assert.match(output, /https:\/\/brave.example.com\/result/);
  }
);

void test(
  "webSearchTool handles SearXNG API errors",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["SEARXNG_API_URL"] = "https://searxng.example.com/search";
    mockFetchSequence([textResponse("Server Error", { status: 500, statusText: "Internal Server Error" })]);

    const output = String(await webSearchTool.invoke({ query: "test", count: 1 }));
    assert.match(output, /Search failed: 500 Internal Server Error/);
  }
);

void test(
  "webSearchTool handles SearXNG network timeout",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["SEARXNG_API_URL"] = "https://searxng.example.com/search";
    mockFetchSequence([new Error("Network timeout")]);

    const output = String(await webSearchTool.invoke({ query: "test", count: 1 }));
    assert.match(output, /Search service unavailable/);
  }
);

void test(
  "webSearchTool formats SearXNG results correctly",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["SEARXNG_API_URL"] = "https://searxng.example.com/search";
    mockFetchSequence([
      jsonResponse({
        results: [
          {
            title: "First Result",
            url: "https://example.com/1",
            content: "First description",
            engine: "google"
          },
          {
            title: "Second Result",
            url: "https://example.com/2",
            engine: "bing"
          }
        ]
      })
    ]);

    const output = String(await webSearchTool.invoke({ query: "test", count: 2 }));
    assert.match(output, /1\. First Result — https:\/\/example.com\/1 :: First description/);
    assert.match(output, /2\. Second Result — https:\/\/example.com\/2 :: bing/);
  }
);

test(
  "webSearchTool handles mixed response formats gracefully",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["SEARXNG_API_URL"] = "https://searxng.example.com/search";
    mockFetchSequence([
      jsonResponse({
        // This looks like SearXNG format but with Brave-style fields
        results: [
          {
            title: "Mixed Format Result",
            url: "https://example.com/mixed",
            description: "This should still work"
          }
        ]
      })
    ]);

    const output = String(await webSearchTool.invoke({ query: "test", count: 1 }));
    assert.match(output, /Mixed Format Result/);
  }
);