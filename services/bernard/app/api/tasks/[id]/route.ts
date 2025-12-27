import type { NextRequest } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import { TaskRecordKeeper } from "@/agent/recordKeeper/task.keeper";
import { getRedis } from "@/lib/infra/redis";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 });
  }

  const userId = user.user.id;

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
