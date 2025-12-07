import type { NextRequest } from "next/server";

import { RecordKeeper } from "@/lib/recordKeeper";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";

function isAdmin(req: NextRequest) {
  const adminKey = process.env["ADMIN_API_KEY"];
  if (!adminKey) return false;
  const header = req.headers.get("authorization");
  if (!header) return false;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token === adminKey;
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
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


