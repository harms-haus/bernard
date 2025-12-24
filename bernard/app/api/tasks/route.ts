import type { NextRequest } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import { TaskRecordKeeper } from "@/agent/recordKeeper/task.keeper";
import { getRedis } from "@/lib/infra/redis";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 });
  }

  const userId = user.user.id;

  const recordKeeper = new TaskRecordKeeper(getRedis());

  const { searchParams } = new URL(req.url);
  const includeArchived = searchParams.get("includeArchived") === "true";
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 50;
  const offset = searchParams.get("offset") ? Number(searchParams.get("offset")) : 0;

  try {
    const result = await recordKeeper.listTasks({
      userId,
      includeArchived,
      limit,
      offset
    });

    return Response.json({
      tasks: result.tasks,
      total: result.total,
      hasMore: result.hasMore
    });
  } catch (error) {
    console.error("Error listing tasks:", error);
    return new Response(JSON.stringify({ error: "Failed to list tasks" }), {
      status: 500
    });
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 });
  }

  const userId = user.user.id;
  const recordKeeper = new TaskRecordKeeper(getRedis());

  let body: { action?: string; taskId?: string };
  try {
    body = await req.json();
  } catch (error) {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { action, taskId } = body;

  if (!taskId || !action) {
    return new Response(JSON.stringify({ error: "Missing taskId or action" }), { status: 400 });
  }

  try {
    let success = false;

    switch (action) {
      case "cancel":
        // Load the task to verify ownership before canceling
        const task = await recordKeeper.getTask(taskId);

        if (!task) {
          return new Response(JSON.stringify({ error: "Task not found" }), { status: 404 });
        }

        if (task.userId !== userId) {
          return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
        }

        success = await recordKeeper.cancelTask(taskId);
        break;
      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });
    }

    if (!success) {
      return new Response(JSON.stringify({ error: "Operation failed" }), { status: 400 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error performing task action:", error);
    return new Response(JSON.stringify({ error: "Failed to perform action" }), {
      status: 500
    });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 });
  }

  const userId = user.user.id;

  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("taskId");

  if (!taskId) {
    return new Response(JSON.stringify({ error: "Missing taskId" }), { status: 400 });
  }

  const recordKeeper = new TaskRecordKeeper(getRedis());

  try {
    const task = await recordKeeper.getTask(taskId);

    if (!task) {
      return new Response(JSON.stringify({ error: "Task not found" }), { status: 404 });
    }

    if (task.userId !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }

    const success = await recordKeeper.deleteTask(taskId);

    if (!success) {
      return new Response(JSON.stringify({ error: "Task cannot be deleted" }), { status: 400 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting task:", error);
    return new Response(JSON.stringify({ error: "Failed to delete task" }), {
      status: 500
    });
  }
}
