import assert from "node:assert/strict";
import test from "node:test";

import { webSearchTool } from "../agent/harness/intent/tools/web-search";

const TEST_TIMEOUT = 2000;
const originalFetch = globalThis.fetch;
const originalEnv = {
  SEARCH_API_KEY: process.env["SEARCH_API_KEY"],
  BRAVE_API_KEY: process.env["BRAVE_API_KEY"],
  SEARCH_API_URL: process.env["SEARCH_API_URL"]
};

type SearchEnvKey = keyof typeof originalEnv;

function setEnv(key: SearchEnvKey, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function restoreEnv() {
  (Object.keys(originalEnv) as SearchEnvKey[]).forEach((key) => {
    setEnv(key, originalEnv[key] ?? undefined);
  });
}

test.afterEach(() => {
  restoreEnv();
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

function normalizeVerify(result: unknown) {
  if (typeof result === "boolean") return { ok: result };
  if (result && typeof result === "object" && "ok" in (result as Record<string, unknown>)) {
    return result as { ok: boolean; reason?: string };
  }
  return { ok: false };
}

void test(
  "web_search verifyConfiguration blocks missing API key",
  { timeout: TEST_TIMEOUT },
  () => {
    setEnv("SEARCH_API_KEY", undefined);
    setEnv("BRAVE_API_KEY", undefined);

    const verify = normalizeVerify(webSearchTool.verifyConfiguration?.());
    assert.equal(verify.ok, false);
    assert.match(verify.reason ?? "", /SEARCH_API_KEY/i);
  }
);

void test(
  "web_search verifyConfiguration blocks placeholder API key",
  { timeout: TEST_TIMEOUT },
  () => {
    setEnv("SEARCH_API_KEY", "brave-api-key");

    const verify = normalizeVerify(webSearchTool.verifyConfiguration?.());
    assert.equal(verify.ok, false);
    assert.match(verify.reason ?? "", /real token/i);
  }
);

void test(
  "web_search verifyConfiguration blocks invalid SEARCH_API_URL",
  { timeout: TEST_TIMEOUT },
  () => {
    setEnv("SEARCH_API_KEY", "real-key");
    setEnv("SEARCH_API_URL", "not a url");

    const verify = normalizeVerify(webSearchTool.verifyConfiguration?.());
    assert.equal(verify.ok, false);
    assert.match(verify.reason ?? "", /SEARCH_API_URL/);
  }
);

void test(
  "web_search invoke uses configured endpoint and auth header",
  { timeout: TEST_TIMEOUT },
  async () => {
    setEnv("SEARCH_API_KEY", "real-key");
    setEnv("SEARCH_API_URL", "https://search.example.com/api");

    const calls = mockFetchSequence([
      jsonResponse({
        web: {
          results: [{ title: "One result", url: "https://example.com", description: "Example site" }]
        }
      })
    ]);

    const output = String(await webSearchTool.invoke({ query: "hello world", count: 2 }));
    assert.match(output, /1\. One result — https:\/\/example\.com :: Example site/);

    const firstCall = calls[0];
    assert.ok(firstCall);
    const rawInput = firstCall.input;
    const calledUrl =
      typeof rawInput === "string"
        ? new URL(rawInput)
        : rawInput instanceof URL
          ? rawInput
          : new URL((rawInput as Request).url);
    assert.equal(calledUrl.searchParams.get("q"), "hello world");
    assert.equal(calledUrl.searchParams.get("count"), "2");

    const headers = firstCall.init?.headers;
    const authHeader =
      headers instanceof Headers
        ? headers.get("Authorization")
        : headers && typeof headers === "object"
          ? (headers as Record<string, string>)["Authorization"]
          : undefined;
    assert.equal(authHeader, "Bearer real-key");
  }
);


