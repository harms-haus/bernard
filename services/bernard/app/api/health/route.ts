import type { NextRequest } from "next/server";
import packageJson from "@/package.json";

export const runtime = "nodejs";

export function GET(_req: NextRequest) {
  try {
    const uptimeSeconds = Math.floor(process.uptime());
    const startedAt = new Date(Date.now() - uptimeSeconds * 1000).toISOString();
    const version = typeof (packageJson as { version?: unknown }).version === "string" ? packageJson.version : undefined;

    return Response.json({
      status: "online",
      uptimeSeconds,
      startedAt,
      version,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Failed to read Bernard health", err);
    return new Response(JSON.stringify({ error: "Unable to read health" }), { status: 500 });
  }
}
