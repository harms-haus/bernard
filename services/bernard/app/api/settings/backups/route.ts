import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { settingsStore } from "@/app/api/settings/_common";
import { BackupSettingsSchema } from "@/lib/config/settingsStore";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/settings/backups" });
  if ("error" in auth) return auth.error;

  const store = settingsStore();
  const backups = await store.getBackups();
  auth.reqLog.success(200, { action: "settings.backups.read", adminId: auth.admin.user.id });
  return Response.json(backups);
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/settings/backups" });
  if ("error" in auth) return auth.error;

  try {
    const body = (await req.json()) as unknown;
    const parsed = BackupSettingsSchema.parse(body);
    const store = settingsStore();
    const before = await store.getBackups();
    const saved = await store.setBackups(parsed);
    const changed = Object.keys(parsed).filter((key) => (before as Record<string, unknown>)[key] !== (parsed as Record<string, unknown>)[key]);
    auth.reqLog.success(200, {
      action: "settings.backups.update",
      adminId: auth.admin.user.id,
      changed
    });
    return Response.json(saved);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    auth.reqLog.failure(400, err, { action: "settings.backups.update" });
    return new Response(JSON.stringify({ error: "Invalid backup payload", reason }), { status: 400 });
  }
}

