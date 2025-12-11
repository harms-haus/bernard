import type { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { scheduleAutoBackup } from "@/lib/backup/autoBackup";
import { clearSettingsCache, SettingsStore } from "@/lib/config";
import { getRedis } from "@/lib/infra/redis";

export async function ensureAdmin(req: NextRequest): Promise<Response | null> {
  if (!(await requireAdmin(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  return null;
}

export function settingsStore() {
  return new SettingsStore(getRedis(), {
    onChange: () => {
      clearSettingsCache();
      scheduleAutoBackup("settings changed");
    }
  });
}

