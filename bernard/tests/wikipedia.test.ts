import assert from "node:assert/strict";
import { test } from "vitest";

import { wikipediaSearchTool, wikipediaEntryTool } from "../agent/harness/router/tools/wikipedia";

test("wikipedia_search tool returns JSON array", async () => {
  const result = await wikipediaSearchTool.invoke({
    query: "TypeScript",
    n_results: 2
  });

  assert(typeof result === "string", "Result should be a string");

  // Parse the JSON result
  const parsed = JSON.parse(result);
  assert(Array.isArray(parsed), "Result should parse to an array");
  assert(parsed.length > 0, "Result should have at least one item");

  // Check structure of first result
  const firstResult = parsed[0];
  assert(typeof firstResult.page_id === "number", "Should have page_id as number");
  assert(typeof firstResult.page_title === "string", "Should have page_title as string");
  assert(typeof firstResult.description === "string", "Should have description as string");
  assert(typeof firstResult.index === "number", "Should have index as number");
});

test("wikipedia_entry tool returns JSON object", async () => {
  const result = await wikipediaEntryTool.invoke({
    page_identifier: "TypeScript",
    char_offset: 0,
    max_chars: 100
  });

  assert(typeof result === "string", "Result should be a string");

  // Parse the JSON result
  const parsed = JSON.parse(result);
  assert(typeof parsed === "object" && parsed !== null, "Result should parse to an object");
  assert(typeof parsed.n_chars === "number", "Should have n_chars as number");
  assert(typeof parsed.content === "string", "Should have content as string");
  assert(typeof parsed.n_next_chars === "number", "Should have n_next_chars as number");
  assert(parsed.n_chars <= 100, "n_chars should not exceed max_chars");
});

test("wikipedia tools handle invalid input gracefully", async () => {
  // Test with invalid page identifier
  const result = await wikipediaEntryTool.invoke({
    page_identifier: "ThisPageDoesNotExist12345",
    char_offset: 0,
    max_chars: 100
  });

  assert(typeof result === "string", "Result should be a string");
  assert(result.includes("failed"), "Should contain error message");
});
