import type { NextRequest } from "next/server";

import { ensureAdmin, settingsStore } from "@/app/api/settings/_common";
import { ModelsSettingsSchema } from "@/lib/config/settingsStore";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const unauth = await ensureAdmin(req);
  if (unauth) return unauth;

  const store = settingsStore();
  const models = await store.getModels();
  return Response.json(models);
}

export async function PUT(req: NextRequest) {
  const unauth = await ensureAdmin(req);
  if (unauth) return unauth;

  try {
    const body = await req.json();
    const parsed = ModelsSettingsSchema.parse(body);
    const saved = await settingsStore().setModels(parsed);
    return Response.json(saved);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: "Invalid models payload", reason }), { status: 400 });
  }
}

