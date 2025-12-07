import type { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import { SessionStore } from "@/lib/sessionStore";
import { UserStore } from "@/lib/userStore";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { id } = await params;
  const store = new UserStore(getRedis());
  const user = await store.get(id);
  if (!user) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }
  if (user.status === "deleted") {
    return new Response(JSON.stringify({ error: "User is deleted" }), { status: 400 });
  }

  const sessions = new SessionStore(getRedis());
  await sessions.deleteForUser(id);

  return Response.json({ reset: true, message: "Sessions invalidated; user must reauthenticate via OAuth." });
}

