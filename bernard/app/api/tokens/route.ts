import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { TokenStore } from "@/lib/auth";
import { getRedis } from "@/lib/infra/redis";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/tokens" });
  if ("error" in auth) return auth.error;
  const store = new TokenStore(getRedis());
  const tokens = await store.list();
  auth.reqLog.success(200, { action: "tokens.list", adminId: auth.admin.user.id, total: tokens.length });
  return Response.json({ tokens });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/tokens" });
  if ("error" in auth) return auth.error;

  const store = new TokenStore(getRedis());
  try {
    const body = (await req.json()) as { name?: string };
    if (!body.name) {
      auth.reqLog.failure(400, "missing_name", { action: "tokens.create" });
      return new Response(JSON.stringify({ error: "`name` is required" }), { status: 400 });
    }
    const record = await store.create(body.name);
    auth.reqLog.success(200, {
      action: "tokens.create",
      adminId: auth.admin.user.id,
      tokenId: record.id
    });
    return Response.json({
      token: {
        id: record.id,
        name: record.name,
        status: record.status,
        createdAt: record.createdAt,
        token: record.token
      }
    });
  } catch (err) {
    auth.reqLog.failure(400, err, { action: "tokens.create" });
    return new Response(JSON.stringify({ error: String(err) }), { status: 400 });
  }
}



