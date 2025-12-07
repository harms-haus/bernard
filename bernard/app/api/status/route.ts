import type { NextRequest } from "next/server";

import packageJson from "@/package.json";
import { RecordKeeper } from "@/lib/recordKeeper";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";

type HealthStatus = "online" | "degraded" | "offline";

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
    const recordKeeper = await keeper.getStatus();

    const uptimeSeconds = Math.floor(process.uptime());
    const startedAt = new Date(Date.now() - uptimeSeconds * 1000).toISOString();
    const version = typeof (packageJson as { version?: unknown }).version === "string" ? packageJson.version : undefined;
    const status: HealthStatus = "online";
    const lastActivityAt = recordKeeper.lastActivityAt;

    return Response.json({
      status,
      uptimeSeconds,
      startedAt,
      version,
      lastActivityAt,
      activeConversations: recordKeeper.activeConversations,
      tokensActive: recordKeeper.tokensActive,
      queueSize: 0,
      notes: recordKeeper.summarizerEnabled ? "Summaries enabled" : "Summaries disabled",
      recordKeeper
    });
  } catch (err) {
    console.error("Failed to read Bernard status", err);
    return new Response(JSON.stringify({ error: "Unable to read status" }), { status: 500 });
  }
}


