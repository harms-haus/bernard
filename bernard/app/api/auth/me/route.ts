import type { NextRequest } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";

export const runtime = "nodejs";

let lastLogAtMs = 0;
let requestsSinceLastLog = 0;

type CachedMeResponse = {
  cachedAtMs: number;
  status: number;
  body: { user: unknown | null };
};

const meCache = new Map<string, CachedMeResponse>();

export async function GET(req: NextRequest) {
  // Lightweight rate logging to diagnose runaway clients.
  // Logs at most once per second to avoid drowning stdout.
  requestsSinceLastLog += 1;
  const now = Date.now();
  if (now - lastLogAtMs >= 1000) {
    const ua = req.headers.get("user-agent") ?? "unknown";
    const referer = req.headers.get("referer") ?? "none";
    // Intentionally do not log cookies/authorization headers.
    console.log(
      `[auth/me] ~${requestsSinceLastLog}/s ua="${ua}" referer="${referer}"`
    );
    requestsSinceLastLog = 0;
    lastLogAtMs = now;
  }

  const cacheTtlMs = 2000;
  const sessionId = req.cookies.get("bernard_session")?.value ?? null;
  const cacheKey = sessionId ? `session:${sessionId}` : "session:none";
  const cached = meCache.get(cacheKey);
  if (cached && now - cached.cachedAtMs < cacheTtlMs) {
    return Response.json(cached.body, {
      status: cached.status,
      headers: {
        "Cache-Control": "private, max-age=2",
        Vary: "Cookie",
      },
    });
  }

  const auth = await getAuthenticatedUser(req);
  if (!auth) {
    const body = { user: null };
    meCache.set(cacheKey, { cachedAtMs: now, status: 401, body });
    return Response.json(body, {
      status: 401,
      headers: {
        "Cache-Control": "private, max-age=2",
        Vary: "Cookie",
      },
    });
  }

  const body = { user: auth.user };
  meCache.set(cacheKey, { cachedAtMs: now, status: 200, body });
  return Response.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=2",
      Vary: "Cookie",
    },
  });
}

