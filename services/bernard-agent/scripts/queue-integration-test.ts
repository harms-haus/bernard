#!/usr/bin/env tsx
/**
 * Utility Queue Integration Tests
 * 
 * Tests the full thread naming flow with real Redis connection.
 * Requires Redis to be running and utility model to be configured.
 * 
 * Usage: npx tsx scripts/queue-integration-test.ts
 */

import { getUtilityQueue, addUtilityJob, isUtilityQueueHealthy, startUtilityWorker, stopUtilityWorker } from "../src/lib/infra/queue";
import { processThreadNamingJob } from "../src/bernard-agent/names";
import { getRedis } from "../src/lib/infra/redis";

const THREAD_ID = `test-thread-${Date.now()}`;
const TEST_MESSAGE = "How do I configure my development environment for TypeScript projects?";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

const results: TestResult[] = [];

async function runTest(name: string, test: () => Promise<boolean>): Promise<void> {
  const start = Date.now();
  try {
    const passed = await test();
    results.push({
      name,
      passed,
      duration: Date.now() - start,
    });
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    });
  }
}

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Utility Queue Integration Tests");
  console.log("=".repeat(60));
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`Test Thread ID: ${THREAD_ID}`);
  console.log("");

  // Test 1: Check Redis connectivity
  await runTest("Redis connectivity", async () => {
    console.log("  Testing Redis connectivity...");
    const redis = getRedis();
    const pong = await redis.ping();
    if (pong !== "PONG") {
      throw new Error(`Redis ping returned: ${pong}`);
    }
    console.log("  ✓ Redis connected successfully");
    return true;
  });

  // Test 2: Check queue health
  await runTest("Queue health check", async () => {
    console.log("  Checking queue health...");
    const healthy = await isUtilityQueueHealthy();
    if (!healthy) {
      throw new Error("Queue is not healthy");
    }
    console.log("  ✓ Queue is healthy");
    return true;
  });

  // Test 3: Queue a thread naming job
  await runTest("Queue thread naming job", async () => {
    console.log("  Queueing thread naming job...");
    const jobId = await addUtilityJob("thread-naming", {
      threadId: THREAD_ID,
      message: TEST_MESSAGE,
    }, {
      jobId: `thread-naming:${THREAD_ID}`,
      deduplicationId: `thread-naming:${THREAD_ID}`,
    });

    if (!jobId) {
      throw new Error("Failed to get job ID from queue");
    }

    console.log(`  ✓ Job queued with ID: ${jobId}`);
    return true;
  });

  // Test 4: Process thread naming directly (bypassing queue)
  await runTest("Process thread naming directly", async () => {
    console.log("  Processing thread naming directly...");
    const result = await processThreadNamingJob({
      threadId: THREAD_ID,
      message: TEST_MESSAGE,
    });

    if (!result.success) {
      throw new Error(`Thread naming failed: ${"error" in result ? (result as { error?: string }).error : "Unknown error"}`);
    }

    if (!result.title || result.title.length === 0) {
      throw new Error("Title is empty");
    }

    console.log(`  ✓ Generated title: "${result.title}"`);
    return true;
  });

  // Test 5: Verify thread name stored in Redis
  await runTest("Verify thread name in Redis", async () => {
    console.log("  Verifying thread name in Redis...");
    const redis = getRedis();
    const threadKey = `bernard:thread:${THREAD_ID}`;
    const data = await redis.get(threadKey);

    if (!data) {
      throw new Error("Thread data not found in Redis");
    }

    const threadData = JSON.parse(data);
    if (!threadData.title) {
      throw new Error("Thread title not found in thread data");
    }

    console.log(`  ✓ Thread name verified: "${threadData.title}"`);
    return true;
  });

  // Test 6: Test deduplication (same job ID should not create duplicate)
  await runTest("Job deduplication", async () => {
    console.log("  Testing job deduplication...");
    
    // Try to add the same job again
    const jobId1 = await addUtilityJob("thread-naming", {
      threadId: THREAD_ID,
      message: TEST_MESSAGE,
    }, {
      jobId: `thread-naming:${THREAD_ID}`,
      deduplicationId: `thread-naming:${THREAD_ID}`,
    });

    // Small delay to ensure queue processes
    await new Promise(resolve => setTimeout(resolve, 100));

    const jobId2 = await addUtilityJob("thread-naming", {
      threadId: THREAD_ID,
      message: TEST_MESSAGE,
    }, {
      jobId: `thread-naming:${THREAD_ID}`,
      deduplicationId: `thread-naming:${THREAD_ID}`,
    });

    // Both should return the same job ID (deduplication)
    if (jobId1 !== jobId2) {
      throw new Error(`Deduplication failed: ${jobId1} !== ${jobId2}`);
    }

    console.log(`  ✓ Deduplication working (job ID: ${jobId1})`);
    return true;
  });

  // Test 7: Test error handling (invalid thread ID)
  await runTest("Error handling for invalid input", async () => {
    console.log("  Testing error handling...");
    
    const result = await processThreadNamingJob({
      threadId: "",
      message: "",
    });

    // Should handle gracefully (may return success=false or throw)
    console.log(`  ✓ Error handling completed (success: ${result.success})`);
    return true;
  });

  // Print summary
  console.log("");
  console.log("=".repeat(60));
  console.log("Test Results Summary");
  console.log("=".repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  for (const result of results) {
    const status = result.passed ? "✓ PASS" : "✗ FAIL";
    const duration = result.duration ? `${result.duration}ms` : "";
    console.log(`${status.padEnd(20)} ${result.name.padEnd(40)} ${duration}`);
    
    if (result.error) {
      console.log(`                        Error: ${result.error}`);
    }
  }

  console.log("");
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log("=".repeat(60));

  // Cleanup
  console.log("\nCleaning up test data...");
  const redis = getRedis();
  await redis.del(`bernard:thread:${THREAD_ID}`);
  console.log("✓ Test data cleaned up");

  // Exit with appropriate code
  if (failed > 0) {
    console.log("\n❌ Some tests failed!");
    process.exit(1);
  } else {
    console.log("\n✅ All tests passed!");
    process.exit(0);
  }
}

// Run the tests
main().catch(error => {
  console.error("Test runner error:", error);
  process.exit(1);
});
