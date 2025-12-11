import type { NextRequest } from "next/server";

import { requireAdmin, TokenStore } from "@/lib/auth";
import { getRedis } from "@/lib/infra/redis";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const store = new TokenStore(getRedis());
  const tokens = await store.list();
  return Response.json({ tokens });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const store = new TokenStore(getRedis());
  try {
    const body = (await req.json()) as { name?: string };
    if (!body.name) {
      return new Response(JSON.stringify({ error: "`name` is required" }), { status: 400 });
    }
    const record = await store.create(body.name);
    return Response.json({
      id: record.id,
      name: record.name,
      status: record.status,
      createdAt: record.createdAt,
      token: record.token
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 400 });
  }
}



