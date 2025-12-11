import type { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { SettingsStore } from "@/lib/settingsStore";
import { getRedis } from "@/lib/redis";
import { scheduleAutoBackup } from "@/lib/autoBackup";
import { clearSettingsCache } from "@/lib/settingsCache";

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

