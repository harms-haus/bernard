import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { UserStore } from "@/lib/auth";
import { getRedis } from "@/lib/infra/redis";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/users" });
  if ("error" in auth) return auth.error;
  const users = await new UserStore(getRedis()).list();
  auth.reqLog.success(200, { action: "users.list", adminId: auth.admin.user.id, total: users.length });
  return Response.json({ users });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/users" });
  if ("error" in auth) return auth.error;

  try {
    const body = (await req.json()) as { id?: string; displayName?: string; isAdmin?: boolean };
    if (!body.id || !body.displayName || typeof body.isAdmin !== "boolean") {
      auth.reqLog.failure(400, "missing_fields", { action: "users.create" });
      return new Response(JSON.stringify({ error: "id, displayName, and isAdmin are required" }), {
        status: 400
      });
    }

    const store = new UserStore(getRedis());
    const created = await store.create({
      id: body.id,
      displayName: body.displayName,
      isAdmin: body.isAdmin
    });
    auth.reqLog.success(201, { action: "users.create", adminId: auth.admin.user.id, userId: body.id });
    return Response.json({ user: created }, { status: 201 });
  } catch (err) {
    auth.reqLog.failure(400, err, { action: "users.create" });
    return new Response(JSON.stringify({ error: (err as Error).message ?? "Unable to create user" }), {
      status: 400
    });
  }
}

