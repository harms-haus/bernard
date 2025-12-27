import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { settingsStore } from "@/app/api/settings/_common";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdminRequest(req, { route: "/api/settings" });
  if ("error" in auth) return auth.error;

  const store = settingsStore();
  const settings = await store.getAll();
  auth.reqLog.success(200, { action: "settings.read", adminId: auth.admin.user.id });
  return Response.json(settings);
}

