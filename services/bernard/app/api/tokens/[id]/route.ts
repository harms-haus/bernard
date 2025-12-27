import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { TokenStore, type TokenStatus } from "@/lib/auth";
import { getRedis } from "@/lib/infra/redis";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminRequest(req, { route: "/api/tokens/[id]" });
  if ("error" in auth) return auth.error;
  const store = new TokenStore(getRedis());
  const { id } = await params;
  const token = await store.get(id);
  if (!token) {
    auth.reqLog.failure(404, "token_not_found", { action: "tokens.read", tokenId: id });
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }
  auth.reqLog.success(200, { action: "tokens.read", adminId: auth.admin.user.id, tokenId: id });
  return Response.json({ token });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminRequest(req, { route: "/api/tokens/[id]" });
  if ("error" in auth) return auth.error;
  const store = new TokenStore(getRedis());
  try {
    const body = (await req.json()) as { name?: string; status?: TokenStatus };
    const hasUpdate = Boolean(body.name) || Boolean(body.status);
    if (!hasUpdate) {
      auth.reqLog.failure(400, "no_updates", { action: "tokens.update" });
      return new Response(JSON.stringify({ error: "No updates provided" }), { status: 400 });
    }
    if (body.status && body.status !== "active" && body.status !== "revoked") {
      auth.reqLog.failure(400, "invalid_status", { action: "tokens.update" });
      return new Response(JSON.stringify({ error: "Invalid status" }), { status: 400 });
    }
    const { id } = await params;
    const updated = await store.update(id, body);
    if (!updated) {
      auth.reqLog.failure(404, "token_not_found", { action: "tokens.update", tokenId: id });
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    auth.reqLog.success(200, { action: "tokens.update", adminId: auth.admin.user.id, tokenId: id });
    return Response.json({ token: updated });
  } catch (err) {
    auth.reqLog.failure(400, err, { action: "tokens.update" });
    return new Response(JSON.stringify({ error: String(err) }), { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminRequest(req, { route: "/api/tokens/[id]" });
  if ("error" in auth) return auth.error;
  const store = new TokenStore(getRedis());
  try {
    const { id } = await params;
    const removed = await store.delete(id);
    if (!removed) {
      auth.reqLog.failure(404, "token_not_found", { action: "tokens.delete", tokenId: id });
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    auth.reqLog.success(200, { action: "tokens.delete", adminId: auth.admin.user.id, tokenId: id });
    return Response.json({ removed: true });
  } catch (err) {
    auth.reqLog.failure(400, err, { action: "tokens.delete" });
    return new Response(JSON.stringify({ error: String(err) }), { status: 400 });
  }
}

