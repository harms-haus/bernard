import type { NextRequest } from "next/server";

import { clearSessionCookie, getAuthenticatedUser, SessionStore } from "@/lib/auth";
import { getRedis } from "@/lib/infra/redis";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedUser(req);
  if (auth?.sessionId) {
    const sessionStore = new SessionStore(getRedis());
    await sessionStore.delete(auth.sessionId, auth.user.id);
  }
  return new Response(null, { status: 204, headers: { "Set-Cookie": clearSessionCookie() } });
}

