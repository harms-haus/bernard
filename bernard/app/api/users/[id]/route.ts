import type { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import { SessionStore } from "@/lib/sessionStore";
import { UserStore } from "@/lib/userStore";

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
  const auth = await requireAdmin(req);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json()) as { displayName?: string; isAdmin?: boolean; status?: "active" | "disabled" };
  const store = new UserStore(getRedis());

  try {
    const current = await store.get(id);
    if (!current) {
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
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    return Response.json({ user: updated });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message ?? "Unable to update user" }), {
      status: 400
    });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin(req);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const { id } = await params;
  const store = new UserStore(getRedis());
  try {
    await ensureNotLastAdmin(store, id, false);
    const deleted = await store.delete(id);
    if (!deleted) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    const sessions = new SessionStore(getRedis());
    await sessions.deleteForUser(id);
    return Response.json({ user: deleted });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message ?? "Unable to delete user" }), {
      status: 400
    });
  }
}

