import { NextRequest } from "next/server";

import { getRedis } from "@/lib/redis";
import { TokenStore } from "@/lib/tokenStore";

export const runtime = "nodejs";

function isAdmin(req: NextRequest) {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return false;
  const header = req.headers.get("authorization");
  if (!header) return false;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token === adminKey;
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const store = new TokenStore(getRedis());
  const tokens = await store.list();
  return Response.json({ tokens });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const store = new TokenStore(getRedis());
  try {
    const body = (await req.json()) as { name?: string; note?: string; createdBy?: string };
    if (!body.name) {
      return new Response(JSON.stringify({ error: "`name` is required" }), { status: 400 });
    }
    const record = await store.create(body.name, {
      createdBy: body.createdBy,
      note: body.note
    });
    return Response.json({ token: record.token, name: record.name, createdAt: record.createdAt });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const store = new TokenStore(getRedis());
  try {
    const body = (await req.json()) as { name?: string };
    if (!body.name) {
      return new Response(JSON.stringify({ error: "`name` is required" }), { status: 400 });
    }
    const removed = await store.delete(body.name);
    return Response.json({ removed });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 400 });
  }
}



