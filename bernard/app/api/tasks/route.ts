import type { NextRequest } from "next/server";

import { validateAccessToken } from "@/lib/auth";
import { TaskRecordKeeper } from "@/lib/task/recordKeeper";
import { getRedis } from "@/lib/infra/redis";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await validateAccessToken(req);
  if ("error" in auth) return auth.error;

  // For now, we'll use a hardcoded user ID since the auth system may not provide user IDs yet
  // In a full implementation, this would come from the auth token
  const userId = "user"; // TODO: Get from auth token

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
