import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { settingsStore } from "@/app/api/settings/_common";
import { ServicesSettingsSchema } from "@/lib/config/settingsStore";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/settings/services" });
  if ("error" in auth) return auth.error;

  const store = settingsStore();
  const services = await store.getServices();
  auth.reqLog.success(200, { action: "settings.services.read", adminId: auth.admin.user.id });
  return Response.json(services);
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/settings/services" });
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const parsed = ServicesSettingsSchema.parse(body);
    const store = settingsStore();
    const before = await store.getServices();
    const saved = await store.setServices(parsed);
    const changed = Object.keys(parsed).filter((key) => JSON.stringify((before as Record<string, unknown>)[key]) !== JSON.stringify((parsed as Record<string, unknown>)[key]));
    auth.reqLog.success(200, {
      action: "settings.services.update",
      adminId: auth.admin.user.id,
      changed
    });
    return Response.json(saved);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    auth.reqLog.failure(400, err, { action: "settings.services.update" });
    return new Response(JSON.stringify({ error: "Invalid services payload", reason }), { status: 400 });
  }
}

