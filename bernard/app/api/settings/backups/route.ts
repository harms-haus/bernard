import type { NextRequest } from "next/server";

import { ensureAdmin, settingsStore } from "@/app/api/settings/_common";
import { BackupSettingsSchema } from "@/lib/settingsStore";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const unauth = await ensureAdmin(req);
  if (unauth) return unauth;

  const store = settingsStore();
  const backups = await store.getBackups();
  return Response.json(backups);
}

export async function PUT(req: NextRequest) {
  const unauth = await ensureAdmin(req);
  if (unauth) return unauth;

  try {
    const body = await req.json();
    const parsed = BackupSettingsSchema.parse(body);
    const saved = await settingsStore().setBackups(parsed);
    return Response.json(saved);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: "Invalid backup payload", reason }), { status: 400 });
  }
}

