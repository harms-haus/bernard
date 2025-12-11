import type { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { RecordKeeper } from "@/lib/conversation/recordKeeper";
import { getRedis } from "@/lib/infra/redis";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const keeper = new RecordKeeper(getRedis());
    await keeper.closeIfIdle();
    const status = await keeper.getStatus();
    return Response.json({ status });
  } catch (err) {
    console.error("Failed to read record keeper status", err);
    return new Response(JSON.stringify({ error: "Unable to read status" }), { status: 500 });
  }
}


