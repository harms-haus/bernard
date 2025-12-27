import assert from "node:assert/strict";
import { test, vi } from "vitest";

import { timerTask } from "../agent/task/timer.task";
import type { TaskExecutionContext } from "../lib/task/types";

// Mock setTimeout to speed up tests
vi.useFakeTimers();

test("timer task waits and records message", async () => {
  const mockRecordEvent = vi.fn().mockResolvedValue(undefined);

  const context: TaskExecutionContext = {
    taskId: "test-task-id",
    userId: "test-user",
    recordEvent: mockRecordEvent,
    settings: {} as any
  };

  const args = {
    name: "Test Timer",
    time: 5, // 5 seconds
    message: "Timer completed successfully!"
  };

  // Start the timer task
  const promise = timerTask(args, context);

  // Fast-forward time by 5 seconds
  await vi.advanceTimersByTimeAsync(5000);

  // Wait for the task to complete
  const result = await promise;

  // Verify the result
  assert.equal(result.success, true, "Task should succeed");
  assert.deepEqual(result.metadata, {
    timerName: "Test Timer",
    duration: 5,
    message: "Timer completed successfully!"
  });

  // Verify the events were recorded
  assert.equal(mockRecordEvent.mock.calls.length, 2, "Should record 2 events");

  // First event: timer started
  const startEvent = mockRecordEvent.mock.calls[0][0];
  assert.equal(startEvent.type, "message_recorded");
  assert.equal(startEvent.data.role, "system");
  assert(startEvent.data.content.includes("Test Timer"));
  assert(startEvent.data.content.includes("started"));
  assert(startEvent.data.content.includes("5 seconds"));

  // Second event: timer completed with message
  const completeEvent = mockRecordEvent.mock.calls[1][0];
  assert.equal(completeEvent.type, "message_recorded");
  assert.equal(completeEvent.data.role, "system");
  assert(completeEvent.data.content.includes("Test Timer"));
  assert(completeEvent.data.content.includes("expired"));
  assert(completeEvent.data.content.includes("Timer completed successfully!"));
});

test("timer task handles errors gracefully", async () => {
  const mockRecordEvent = vi.fn().mockRejectedValueOnce(new Error("Database error"));

  const context: TaskExecutionContext = {
    taskId: "test-task-id",
    userId: "test-user",
    recordEvent: mockRecordEvent,
    settings: {} as any
  };

  const args = {
    name: "Test Timer",
    time: 1,
    message: "Should not be recorded"
  };

  // Start the timer task
  const promise = timerTask(args, context);

  // Fast-forward time
  await vi.advanceTimersByTimeAsync(1000);

  // Wait for the task to complete
  const result = await promise;

  // Verify the result indicates failure
  assert.equal(result.success, false, "Task should fail");
  assert(result.errorMessage?.includes("Database error"), "Should include the original error");

  // Verify error event was recorded
  assert.equal(mockRecordEvent.mock.calls.length, 2, "Should record start and error events");

  const errorEvent = mockRecordEvent.mock.calls[1][0];
  assert.equal(errorEvent.type, "message_recorded");
  assert(errorEvent.data.content.includes("error"));
});
