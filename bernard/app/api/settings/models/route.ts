import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { settingsStore } from "@/app/api/settings/_common";
import { ModelsSettingsSchema } from "@/lib/config/settingsStore";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/settings/models" });
  if ("error" in auth) return auth.error;

  const store = settingsStore();
  const models = await store.getModels();
  auth.reqLog.success(200, { action: "settings.models.read", adminId: auth.admin.user.id });
  return Response.json(models);
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/settings/models" });
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const parsed = ModelsSettingsSchema.parse(body);
    const saved = await settingsStore().setModels(parsed);
    return Response.json(saved);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    auth.reqLog.failure(400, err, { action: "settings.models.update" });
    return new Response(JSON.stringify({ error: "Invalid models payload", reason }), { status: 400 });
  }
}

