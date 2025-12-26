import type { NextRequest } from "next/server";

import { validateAccessToken } from "@/lib/auth";
import { TaskRecordKeeper } from "@/agent/recordKeeper/task.keeper";
import { enqueueTask } from "@/lib/task/queue";
import type { TaskPayload } from "@/lib/task/types";
import { getRedis } from "@/lib/infra/redis";
import { logger } from "@/lib/logging";
import crypto from "node:crypto";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await validateAccessToken(req);
  if ("error" in auth) return auth.error;

  // For now, we'll use a hardcoded user ID since the auth system may not provide user IDs yet
  // In a full implementation, this would come from the auth token
  const userId = "user"; // TODO: Get from auth token

  let body: {
    toolName: string;
    arguments: Record<string, unknown>;
    settings?: Record<string, unknown>;
    conversationId?: string;
  };

  try {
    body = (await req.json()) as {
      toolName: string;
      arguments: Record<string, unknown>;
      settings?: Record<string, unknown>;
      conversationId?: string;
    };
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON", detail: String(err) }), {
      status: 400
    });
  }

  if (!body.toolName) {
    return new Response(JSON.stringify({ error: "`toolName` is required" }), { status: 400 });
  }

  if (!body.arguments || typeof body.arguments !== "object") {
    return new Response(JSON.stringify({ error: "`arguments` is required and must be an object" }), { status: 400 });
  }

  const recordKeeper = new TaskRecordKeeper(getRedis());

  try {
    // Generate task ID and name
    const taskId = `task_${crypto.randomBytes(10).toString("hex")}`;
    const taskName = `${body.toolName}: ${Object.values(body.arguments).join(" (")}...)`.slice(0, 100);

    // Create task record
    await recordKeeper.createTask(taskId, {
      name: taskName,
      toolName: body.toolName,
      userId,
      ...(body.conversationId && { conversationId: body.conversationId }),
      sections: {
        execution_log: "Task execution log",
        metadata: "Task metadata and results"
      }
    });

    // Create task payload
    const taskPayload: TaskPayload = {
      taskId,
      toolName: body.toolName,
      arguments: body.arguments,
      settings: body.settings || {},
      userId,
      ...(body.conversationId && { conversationId: body.conversationId })
    };

    // Enqueue task
    await enqueueTask(taskId, taskPayload);

    return Response.json({
      taskId,
      taskName,
      status: "created"
    });
  } catch (error) {
    logger.error({ event: "task.create.error", error: error instanceof Error ? error.message : String(error) }, "Error creating task");
    return new Response(JSON.stringify({ error: "Failed to create task" }), {
      status: 500
    });
  }
}
