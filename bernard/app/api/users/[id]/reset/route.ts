import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { SessionStore, UserStore } from "@/lib/auth";
import { getRedis } from "@/lib/infra/redis";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRequest(req, { route: "/api/users/[id]/reset" });
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const store = new UserStore(getRedis());
  const user = await store.get(id);
  if (!user) {
    auth.reqLog.failure(404, "user_not_found", { action: "users.reset", userId: id });
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }
  if (user.status === "deleted") {
    auth.reqLog.failure(400, "user_deleted", { action: "users.reset", userId: id });
    return new Response(JSON.stringify({ error: "User is deleted" }), { status: 400 });
  }

  const sessions = new SessionStore(getRedis());
  await sessions.deleteForUser(id);

  auth.reqLog.success(200, { action: "users.reset", adminId: auth.admin.user.id, userId: id });
  return Response.json({ reset: true, message: "Sessions invalidated; user must reauthenticate via OAuth." });
}

