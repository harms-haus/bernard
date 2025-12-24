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
