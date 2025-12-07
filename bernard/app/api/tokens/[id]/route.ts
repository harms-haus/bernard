import type { NextRequest } from "next/server";

import { getRedis } from "@/lib/redis";
import { TokenStore, type TokenStatus } from "@/lib/tokenStore";

export const runtime = "nodejs";

function isAdmin(req: NextRequest) {
  const adminKey = process.env["ADMIN_API_KEY"];
  if (!adminKey) return false;
  const header = req.headers.get("authorization");
  if (!header) return false;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token === adminKey;
}

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  if (!isAdmin(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const store = new TokenStore(getRedis());
  const { id } = await params;
  const token = await store.get(id);
  if (!token) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }
  return Response.json({ token });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  if (!isAdmin(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const store = new TokenStore(getRedis());
  try {
    const body = (await req.json()) as { name?: string; status?: TokenStatus };
    const hasUpdate = Boolean(body.name) || Boolean(body.status);
    if (!hasUpdate) {
      return new Response(JSON.stringify({ error: "No updates provided" }), { status: 400 });
    }
    if (body.status && body.status !== "active" && body.status !== "disabled") {
      return new Response(JSON.stringify({ error: "Invalid status" }), { status: 400 });
    }
    const { id } = await params;
    const updated = await store.update(id, body);
    if (!updated) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    return Response.json({ token: updated });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  if (!isAdmin(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const store = new TokenStore(getRedis());
  try {
    const { id } = await params;
    const removed = await store.delete(id);
    if (!removed) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    return Response.json({ removed: true });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 400 });
  }
}

