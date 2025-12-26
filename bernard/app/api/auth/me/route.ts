import type { NextRequest } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import { logger } from "@/lib/logging";

export const runtime = "nodejs";

let lastLogAtMs = 0;
let requestsSinceLastLog = 0;

export async function GET(req: NextRequest) {
  // Lightweight rate logging to diagnose runaway clients.
  // Logs at most once per second to avoid drowning stdout.
  requestsSinceLastLog += 1;
  const now = Date.now();
  if (now - lastLogAtMs >= 1000) {
    const ua = req.headers.get("user-agent") ?? "unknown";
    const referer = req.headers.get("referer") ?? "none";
    // Intentionally do not log cookies/authorization headers.
    logger.info({
      event: "auth.me.rate_limit",
      requestsPerSecond: requestsSinceLastLog,
      ua,
      referer
    }, `[auth/me] ~${requestsSinceLastLog}/s ua="${ua}" referer="${referer}"`);
    requestsSinceLastLog = 0;
    lastLogAtMs = now;
  }

  const auth = await getAuthenticatedUser(req);
  if (!auth) {
    const body = { user: null };
    return Response.json(body, {
      status: 401,
      headers: {
        "Cache-Control": "private, max-age=2",
        Vary: "Cookie",
      },
    });
  }

  const body = { user: auth.user };
  return Response.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=2",
      Vary: "Cookie",
    },
  });
}

