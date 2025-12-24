import type { NextRequest } from "next/server";

import { validateAccessToken } from "@/lib/auth";
import { TaskRecordKeeper } from "@/agent/recordKeeper/task.keeper";
import { getRedis } from "@/lib/infra/redis";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateAccessToken(req);
  if ("error" in auth) return auth.error;

  const userId = auth.access.user?.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 401
    });
  }

  const resolvedParams = await params;
  const taskId = resolvedParams.id;
  const recordKeeper = new TaskRecordKeeper(getRedis());

  try {
    // Get the task
    const task = await recordKeeper.getTask(taskId);
    if (!task) {
      return new Response(JSON.stringify({ error: "Task not found" }), {
        status: 404
      });
    }

    // Check if the task belongs to the user (basic security check)
    if (task.userId !== userId) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403
      });
    }

    // Get task events/logs
    const events = await recordKeeper.getTaskEvents(taskId);

    // Get recall data for sections
    const recallData = await recordKeeper.recallTask(taskId);

    return Response.json({
      task,
      events,
      sections: recallData?.sections || {},
      messages: recallData?.messages || []
    });
  } catch (error) {
    console.error("Error getting task details:", error);
    return new Response(JSON.stringify({ error: "Failed to get task details" }), {
      status: 500
    });
  }
}
