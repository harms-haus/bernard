import type { NextRequest } from "next/server";

import { requireAdmin, UserStore } from "@/lib/auth";
import { getRedis } from "@/lib/infra/redis";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const users = await new UserStore(getRedis()).list();
  return Response.json({ users });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const body = (await req.json()) as { id?: string; displayName?: string; isAdmin?: boolean };
    if (!body.id || !body.displayName || typeof body.isAdmin !== "boolean") {
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
    return Response.json({ user: created }, { status: 201 });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message ?? "Unable to create user" }), {
      status: 400
    });
  }
}

