import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { SessionStore, UserStore } from "@/lib/auth";
import { getRedis } from "@/lib/infra/redis";

export const runtime = "nodejs";

const ensureNotLastAdmin = async (store: UserStore, targetId: string, nextIsAdmin: boolean) => {
  const users = await store.list();
  const admins = users.filter((u) => u.isAdmin && u.status === "active");
  if (admins.length <= 1) {
    const lastAdmin = admins[0];
    if (lastAdmin && lastAdmin.id === targetId && !nextIsAdmin) {
      throw new Error("Cannot remove the last administrator");
    }
  }
};

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminRequest(req, { route: "/api/users/[id]" });
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = (await req.json()) as { displayName?: string; isAdmin?: boolean; status?: "active" | "disabled" };
  const store = new UserStore(getRedis());

  try {
    const current = await store.get(id);
    if (!current) {
      auth.reqLog.failure(404, "user_not_found", { action: "users.update", userId: id });
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    if (typeof body.isAdmin === "boolean") {
      await ensureNotLastAdmin(store, id, body.isAdmin);
    }
    if (body.status === "disabled" && current.isAdmin) {
      await ensureNotLastAdmin(store, id, false);
    }

    const updates: { displayName?: string; isAdmin?: boolean } = {};
    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.isAdmin !== undefined) updates.isAdmin = body.isAdmin;

    let updated = await store.update(id, updates);
    if (body.status === "active" || body.status === "disabled") {
      updated = await store.setStatus(id, body.status);
      if (body.status === "disabled") {
        const sessionStore = new SessionStore(getRedis());
        await sessionStore.deleteForUser(id);
      }
    }
    if (!updated) {
      auth.reqLog.failure(404, "user_not_found", { action: "users.update", userId: id });
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    auth.reqLog.success(200, {
      action: "users.update",
      adminId: auth.admin.user.id,
      userId: id,
      status: body.status ?? current.status,
      isAdmin: updates.isAdmin ?? current.isAdmin
    });
    return Response.json({ user: updated });
  } catch (err) {
    auth.reqLog.failure(400, err, { action: "users.update", userId: id });
    return new Response(JSON.stringify({ error: (err as Error).message ?? "Unable to update user" }), {
      status: 400
    });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminRequest(req, { route: "/api/users/[id]" });
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const store = new UserStore(getRedis());
  try {
    await ensureNotLastAdmin(store, id, false);
    const deleted = await store.delete(id);
    if (!deleted) {
      auth.reqLog.failure(404, "user_not_found", { action: "users.delete", userId: id });
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    const sessions = new SessionStore(getRedis());
    await sessions.deleteForUser(id);
    auth.reqLog.success(200, { action: "users.delete", adminId: auth.admin.user.id, userId: id });
    return Response.json({ user: deleted });
  } catch (err) {
    auth.reqLog.failure(400, err, { action: "users.delete", userId: id });
    return new Response(JSON.stringify({ error: (err as Error).message ?? "Unable to delete user" }), {
      status: 400
    });
  }
}

