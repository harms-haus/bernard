import assert from "node:assert/strict";
import { afterEach, test } from "vitest";

import { getWebsiteContentTool } from "../agent/tool/website-content.tool";
import { clearExpiredCache } from "../lib/website";

const TEST_TIMEOUT = 5_000;
const originalFetch = globalThis.fetch;

// Mock HTML content for testing
const mockHtml = `
<!DOCTYPE html>
<html>
<head><title>Test Article Title</title></head>
<body>
  <article>
    <h1>Test Article Title</h1>
    <p>This is the first paragraph of the test article.</p>
    <p>This is the second paragraph with some more content to make it longer.</p>
    <p>By John Doe</p>
  </article>
</body>
</html>
`;

const mockHtmlWithoutReadableContent = `
<!DOCTYPE html>
<html>
<head><title>Empty Page</title></head>
<body>
  <!-- This HTML has no meaningful content that Readability can extract -->
  <script>console.log('script only');</script>
  <style>body { display: none; }</style>
  <img src="image.jpg" alt="image">
  <input type="text" placeholder="search">
</body>
</html>
`;

type FetchCall = { input: RequestInfo | URL; init?: RequestInit | undefined };

const htmlResponse = (body: string, init?: ResponseInit) =>
  new Response(body, {
    status: init?.status ?? 200,
    ...(init?.statusText !== undefined ? { statusText: init.statusText } : {}),
    headers: { "Content-Type": "text/html", ...(init?.headers ?? {}) }
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

afterEach(() => {
  globalThis.fetch = originalFetch;
  clear(); // Clear cache between tests
});

void test(
  "getWebsiteContentTool extracts readable content from HTML",
  { timeout: TEST_TIMEOUT },
  async () => {
    const calls = mockFetchSequence([htmlResponse(mockHtml)]);

    const result = await getWebsiteContentTool.invoke({
      uri: "https://example.com/article",
      startTokens: 0,
      readTokens: 100
    });

    assert(Array.isArray(calls));
    assert.equal(calls.length, 1);
    assert(calls[0]);
    assert.equal(calls[0].input, "https://example.com/article");

    assert(typeof result === "string");
    assert(result.includes("Test Article Title"));
    assert(result.includes("first paragraph"));
    assert(result.includes("second paragraph"));
    assert(result.includes("John Doe"));
  }
);

void test(
  "getWebsiteContentTool uses default values for startTokens and readTokens",
  { timeout: TEST_TIMEOUT },
  async () => {
    const calls = mockFetchSequence([htmlResponse(mockHtml)]);

    const result = await getWebsiteContentTool.invoke({
      uri: "https://example.com/article"
    });

    assert(Array.isArray(calls));
    assert.equal(calls.length, 1);

    assert(typeof result === "string");
    assert(result.includes("Test Article Title"));
  }
);

void test(
  "getWebsiteContentTool caches content and reuses on subsequent calls",
  { timeout: TEST_TIMEOUT },
  async () => {
    const calls = mockFetchSequence([htmlResponse(mockHtml)]);

    // First call should fetch
    const result1 = await getWebsiteContentTool.invoke({
      uri: "https://example.com/article"
    });

    // Second call should use cache (no additional fetch)
    const result2 = await getWebsiteContentTool.invoke({
      uri: "https://example.com/article"
    });

    assert.equal(calls.length, 1); // Only one fetch call
    assert.equal(result1, result2); // Same result
  }
);

void test(
  "getWebsiteContentTool respects forceRefresh parameter",
  { timeout: TEST_TIMEOUT },
  async () => {
    const calls = mockFetchSequence([htmlResponse(mockHtml), htmlResponse(mockHtml)]);

    // First call
    await getWebsiteContentTool.invoke({
      uri: "https://example.com/article"
    });

    // Second call with forceRefresh should fetch again
    await getWebsiteContentTool.invoke({
      uri: "https://example.com/article",
      forceRefresh: true
    });

    assert.equal(calls.length, 2); // Two fetch calls
  }
);

void test(
  "getWebsiteContentTool slices content by token range",
  { timeout: TEST_TIMEOUT },
  async () => {
    const calls = mockFetchSequence([htmlResponse(mockHtml)]);

    const result = await getWebsiteContentTool.invoke({
      uri: "https://example.com/article",
      startTokens: 0,
      readTokens: 5 // Very small token count
    });

    assert(Array.isArray(calls));
    assert.equal(calls.length, 1);

    assert(typeof result === "string");
    // Should contain token information showing slicing worked
    assert(result.includes("Tokens:"));
  }
);

void test(
  "getWebsiteContentTool handles invalid URI",
  { timeout: TEST_TIMEOUT },
  async () => {
    // Zod schema validation should reject invalid URIs
    await assert.rejects(
      () => getWebsiteContentTool.invoke({
        uri: "not-a-valid-url"
      }),
      /Invalid URL/
    );
  }
);

void test(
  "getWebsiteContentTool handles missing URI",
  { timeout: TEST_TIMEOUT },
  async () => {
    // Zod schema validation should reject empty URIs
    await assert.rejects(
      () => getWebsiteContentTool.invoke({
        uri: ""
      }),
      /Invalid URL/
    );
  }
);

void test(
  "getWebsiteContentTool handles invalid startTokens",
  { timeout: TEST_TIMEOUT },
  async () => {
    // Zod schema validation should reject negative startTokens
    await assert.rejects(
      () => getWebsiteContentTool.invoke({
        uri: "https://example.com/article",
        startTokens: -1
      }),
      /Too small/
    );
  }
);

void test(
  "getWebsiteContentTool handles invalid readTokens",
  { timeout: TEST_TIMEOUT },
  async () => {
    // Zod schema validation should reject readTokens <= 0
    await assert.rejects(
      () => getWebsiteContentTool.invoke({
        uri: "https://example.com/article",
        readTokens: 0
      }),
      /Too small/
    );
  }
);

void test(
  "getWebsiteContentTool handles HTTP errors",
  { timeout: TEST_TIMEOUT },
  async () => {
    const calls = mockFetchSequence([
      new Response("Not Found", { status: 404, statusText: "Not Found" })
    ]);

    const result = await getWebsiteContentTool.invoke({
      uri: "https://example.com/missing"
    });

    assert(Array.isArray(calls));
    assert.equal(calls.length, 1);

    assert(typeof result === "string");
    assert(result.includes("Error"));
    assert(result.includes("HTTP 404"));
  }
);

void test(
  "getWebsiteContentTool handles network timeouts",
  { timeout: TEST_TIMEOUT },
  async () => {
    const calls = mockFetchSequence([
      new Error("Network timeout")
    ]);

    const result = await getWebsiteContentTool.invoke({
      uri: "https://example.com/article"
    });

    assert(Array.isArray(calls));
    assert.equal(calls.length, 1);

    assert(typeof result === "string");
    assert(result.includes("Error"));
  }
);

void test(
  "getWebsiteContentTool handles unreadable content",
  { timeout: TEST_TIMEOUT },
  async () => {
    const calls = mockFetchSequence([htmlResponse(mockHtmlWithoutReadableContent)]);

    const result = await getWebsiteContentTool.invoke({
      uri: "https://example.com/empty"
    });

    assert(Array.isArray(calls));
    assert.equal(calls.length, 1);

    assert(typeof result === "string");
    assert(result.includes("Error"));
    assert(result.includes("Could not extract readable content"));
  }
);

void test(
  "getWebsiteContentTool schema validation",
  { timeout: TEST_TIMEOUT },
  () => {
    // Test that the tool has proper schema
    assert(getWebsiteContentTool.schema);
    assert.equal(getWebsiteContentTool.name, "get_website_content");
    assert(getWebsiteContentTool.description.includes("readable content"));
  }
);
