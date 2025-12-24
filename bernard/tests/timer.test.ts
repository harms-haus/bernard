import assert from "node:assert/strict";
import { test } from "vitest";

import { createTimerToolInstance } from "../agent/tool/timer.tool";

test("timer tool creates task with valid parameters", async () => {
  // Create a mock task context
  const mockTaskContext = {
    conversationId: "test-conversation",
    userId: "test-user",
    createTask: async (toolName: string, args: Record<string, unknown>, settings: any) => {
      return {
        taskId: "test-task-id",
        taskName: `Timer: ${args.name}`
      };
    }
  };

  const timerTool = createTimerToolInstance(mockTaskContext);

  const result = await timerTool.invoke({
    name: "Test Timer",
    time: 30,
    message: "Timer test completed!"
  });

  assert(typeof result === "string", "Result should be a string");
  assert(result.includes("Timer task started"), "Result should indicate task creation");
  assert(result.includes("test-task-id"), "Result should include the task ID");
  assert(result.includes("Test Timer"), "Result should include the timer name");
});

test("timer tool validates required parameters", async () => {
  const mockTaskContext = {
    conversationId: "test-conversation",
    userId: "test-user",
    createTask: async () => ({ taskId: "test", taskName: "test" })
  };

  const timerTool = createTimerToolInstance(mockTaskContext);

  // Test missing name - should throw Zod validation error
  await assert.rejects(
    async () => {
      await timerTool.invoke({
        time: 30,
        message: "test"
      });
    },
    "Should throw error for missing name"
  );

  // Test missing time - should throw Zod validation error
  await assert.rejects(
    async () => {
      await timerTool.invoke({
        name: "test",
        message: "test"
      });
    },
    "Should throw error for missing time"
  );

  // Test invalid time (negative) - should throw Zod validation error
  await assert.rejects(
    async () => {
      await timerTool.invoke({
        name: "test",
        time: -10,
        message: "test"
      });
    },
    "Should throw error for negative time"
  );

  // Test missing message - should throw Zod validation error
  await assert.rejects(
    async () => {
      await timerTool.invoke({
        name: "test",
        time: 30
      });
    },
    "Should throw error for missing message"
  );
});

test("timer tool validates time limits", async () => {
  const mockTaskContext = {
    conversationId: "test-conversation",
    userId: "test-user",
    createTask: async () => ({ taskId: "test", taskName: "test" })
  };

  const timerTool = createTimerToolInstance(mockTaskContext);

  // Test time too large - should throw Zod validation error
  await assert.rejects(
    async () => {
      await timerTool.invoke({
        name: "test",
        time: 4000, // Over 1 hour limit
        message: "test"
      });
    },
    "Should throw error for time over limit"
  );
});

test("timer tool requires task context", async () => {
  const timerTool = createTimerToolInstance(undefined);

  const result = await timerTool.invoke({
    name: "test",
    time: 30,
    message: "test"
  });

  assert(result.includes("Error"), "Should return error when task context not available");
  assert(result.includes("Task context not available"), "Should mention task context requirement");
});
