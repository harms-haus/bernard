import assert from "node:assert/strict";
import { test } from "vitest";

import { wikipediaSearchTool } from "../agent/harness/router/tools/wikipedia-search.tool";
import { wikipediaEntryTool } from "../agent/harness/router/tools/wikipedia-entry.tool";

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
    token_offset: 0,
    max_tokens: 100
  });

  assert(typeof result === "string", "Result should be a string");

  // Parse the JSON result
  const parsed = JSON.parse(result);
  assert(typeof parsed === "object" && parsed !== null, "Result should parse to an object");
  assert(typeof parsed.n_tokens === "number", "Should have n_tokens as number");
  assert(typeof parsed.content === "string", "Should have content as string");
  assert(typeof parsed.n_next_tokens === "number", "Should have n_next_tokens as number");
  assert(parsed.n_tokens <= 100, "n_tokens should not exceed max_tokens");
});

test("wikipedia_search tool supports starting_index parameter", async () => {
  const result = await wikipediaSearchTool.invoke({
    query: "TypeScript",
    n_results: 2,
    starting_index: 1
  });

  assert(typeof result === "string", "Result should be a string");

  // Parse the JSON result
  const parsed = JSON.parse(result);
  assert(Array.isArray(parsed), "Result should parse to an array");
  assert(parsed.length > 0, "Result should have at least one item");

  // Check that indices are offset correctly (starting from 2 instead of 1)
  const firstResult = parsed[0];
  assert(typeof firstResult.index === "number", "Should have index as number");
  assert(firstResult.index >= 2, "Index should be offset by starting_index");
});

test("wikipedia tools handle invalid input gracefully", async () => {
  // Test with invalid page identifier
  await assert.rejects(
    async () => {
      await wikipediaEntryTool.invoke({
        page_identifier: "ThisPageDoesNotExist12345",
        token_offset: 0,
        max_tokens: 100
      });
    },
    "Should throw an error for non-existent pages"
  );
});
