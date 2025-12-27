import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { settingsStore } from "@/app/api/settings/_common";
import { OAuthSettingsSchema } from "@/lib/config/settingsStore";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/settings/oauth" });
  if ("error" in auth) return auth.error;

  const store = settingsStore();
  const oauth = await store.getOAuth();
  auth.reqLog.success(200, { action: "settings.oauth.read", adminId: auth.admin.user.id });
  return Response.json(oauth);
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/settings/oauth" });
  if ("error" in auth) return auth.error;

  try {
    const body = (await req.json()) as unknown;
    const parsed = OAuthSettingsSchema.parse(body);
    const store = settingsStore();
    const before = await store.getOAuth();
    const saved = await store.setOAuth(parsed);
    const changed = Object.keys(parsed).filter((key) => JSON.stringify((before as Record<string, unknown>)[key]) !== JSON.stringify((parsed as Record<string, unknown>)[key]));
    auth.reqLog.success(200, {
      action: "settings.oauth.update",
      adminId: auth.admin.user.id,
      changed
    });
    return Response.json(saved);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    auth.reqLog.failure(400, err, { action: "settings.oauth.update" });
    return new Response(JSON.stringify({ error: "Invalid oauth payload", reason }), { status: 400 });
  }
}

