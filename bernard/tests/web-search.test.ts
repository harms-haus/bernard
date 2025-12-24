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

void test(
  "resolveSearchConfigFromEnv returns null when missing and allowMissing is false",
  { timeout: TEST_TIMEOUT },
  () => {
    const result = resolveSearchConfigFromEnv();
    assert.equal(result, null);
  }
);

void test(
  "resolveSearchConfigFromEnv returns error when missing and allowMissing is true",
  { timeout: TEST_TIMEOUT },
  () => {
    const result = resolveSearchConfigFromEnv({ allowMissing: true });
    assert.equal(result?.ok, false);
    assert.match(result?.reason ?? "", /SEARCH_API_KEY/i);
  }
);

void test(
  "resolveSearchConfigFromEnv rejects placeholder keys",
  { timeout: TEST_TIMEOUT },
  () => {
    process.env["SEARCH_API_KEY"] = "brave-api-key";
    const result = resolveSearchConfigFromEnv({ allowMissing: true });
    assert.equal(result?.ok, false);
    assert.match(result?.reason ?? "", /Replace SEARCH_API_KEY/);
  }
);

void test(
  "resolveSearchConfigFromEnv rejects invalid URLs",
  { timeout: TEST_TIMEOUT },
  () => {
    process.env["SEARCH_API_KEY"] = "real-key";
    process.env["SEARCH_API_URL"] = "not-a-url";
    const result = resolveSearchConfigFromEnv({ allowMissing: true });
    assert.equal(result?.ok, false);
    assert.match(result?.reason ?? "", /Invalid SEARCH_API_URL/);
  }
);

void test(
  "resolveSearchConfig prefers env configuration",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["SEARCH_API_KEY"] = "env-key";
    process.env["SEARCH_API_URL"] = "https://env.example.com/search";

    setSettingsFetcher(async () => {
      throw new Error("should not be called");
    });

    const result = await resolveSearchConfig();
    assert.equal(result.ok, true);
    assert.equal(result.apiKey, "env-key");
    assert.equal(result.apiUrl, "https://env.example.com/search");
  }
);

void test(
  "resolveSearchConfig falls back to settings when env missing",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["NODE_ENV"] = "development";
    process.execArgv.splice(0, process.execArgv.length);
    setSettingsFetcher(async () => {
      return {
        services: { search: { apiKey: "settings-key", apiUrl: "https://settings.example.com/search" } }
      } as any;
    });

    const result = await resolveSearchConfig();
    assert.equal(result.ok, true);
    assert.equal(result.apiKey, "settings-key");
    assert.equal(result.apiUrl, "https://settings.example.com/search");
  }
);

void test(
  "resolveSearchConfig returns missing key when in test mode",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["NODE_ENV"] = "test";
    const result = await resolveSearchConfig();
    assert.equal(result.ok, false);
    assert.match(result.reason, /Missing SEARCH_API_KEY/);
  }
);

void test(
  "verifyConfiguration reports missing config",
  { timeout: TEST_TIMEOUT },
  () => {
    const verify = verifySearchConfigured();
    assert.equal(verify.ok, false);
    assert.match(verify.reason ?? "", /SEARCH_API_KEY/);
  }
);

void test(
  "verifyConfiguration reports ok for valid env config",
  { timeout: TEST_TIMEOUT },
  () => {
    process.env["SEARCH_API_KEY"] = "env-key";
    const verify = verifySearchConfigured();
    assert.equal(verify.ok, true);
  }
);

void test(
  "buildSearchUrl sets query and default count",
  { timeout: TEST_TIMEOUT },
  () => {
    const url = buildSearchUrl("https://api.example.com/search", "hello world");
    assert.equal(url.searchParams.get("q"), "hello world");
    assert.equal(url.searchParams.get("count"), "3");
  }
);

void test(
  "formatResults handles empty and missing fields",
  { timeout: TEST_TIMEOUT },
  () => {
    assert.equal(formatResults([]), "No results.");
    const output = formatResults([{ url: "https://example.com" }], 1);
    assert.match(output, /Untitled/);
    assert.match(output, /https:\/\/example.com/);
  }
);

void test(
  "parseWebResults tolerates nullish payloads",
  { timeout: TEST_TIMEOUT },
  () => {
    assert.deepEqual(parseWebResults(null), []);
    assert.deepEqual(parseWebResults({ web: { results: [{ title: "t1" }] } }), [{ title: "t1" }]);
  }
);

void test(
  "safeJson returns error object on parse failure",
  { timeout: TEST_TIMEOUT },
  async () => {
    const res = textResponse("not-json");
    const parsed = (await safeJson(res)) as { error?: string };
    assert.match(parsed.error ?? "", /Failed to parse JSON/);
  }
);

void test(
  "webSearchTool returns configuration error when unconfigured",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["NODE_ENV"] = "test";
    const output = String(await webSearchTool.invoke({ query: "news", count: 1 }));
    assert.match(output, /Search tool is not configured/);
  }
);

void test(
  "webSearchTool uses settings fallback and formats results",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["NODE_ENV"] = "development";
    process.execArgv.splice(0, process.execArgv.length);
    setSettingsFetcher(async () => {
      return {
        services: { search: { apiKey: "settings-key", apiUrl: "https://settings.example.com/search" } }
      } as any;
    });

    const calls = mockFetchSequence([
      jsonResponse({
        web: {
          results: [
            { title: "Result 1", url: "https://r1.test", description: "first" },
            { title: "Result 2", url: "https://r2.test", description: "second" }
          ]
        }
      })
    ]);

    const output = String(await webSearchTool.invoke({ query: "news", count: 2 }));
    assert.match(output, /1\. Result 1/);
    assert.match(output, /2\. Result 2/);

    const firstCall = calls[0];
    assert.ok(firstCall);
    const calledUrl = new URL(String(firstCall.input));
    assert.equal(calledUrl.searchParams.get("q"), "news");
    assert.equal(calledUrl.searchParams.get("count"), "2");
  }
);

void test(
  "webSearchTool returns error string on non-OK response",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["SEARCH_API_KEY"] = "env-key";
    process.env["SEARCH_API_URL"] = "https://env.example.com/search";
    mockFetchSequence([textResponse("fail", { status: 500, statusText: "oops" })]);

    const output = String(await webSearchTool.invoke({ query: "bad", count: 1 }));
    assert.match(output, /Search failed: 500 oops fail/);
  }
);

void test(
  "webSearchTool returns friendly no-results message",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["SEARCH_API_KEY"] = "env-key";
    process.env["SEARCH_API_URL"] = "https://env.example.com/search";
    mockFetchSequence([jsonResponse({ web: { results: [] } })]);

    const output = String(await webSearchTool.invoke({ query: "none", count: 1 }));
    assert.equal(output, "No results.");
  }
);

