import type { NextRequest } from "next/server";

import { ensureAdmin, settingsStore } from "@/app/api/settings/_common";
import { ServicesSettingsSchema } from "@/lib/config/settingsStore";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const unauth = await ensureAdmin(req);
  if (unauth) return unauth;

  const store = settingsStore();
  const services = await store.getServices();
  return Response.json(services);
}

export async function PUT(req: NextRequest) {
  const unauth = await ensureAdmin(req);
  if (unauth) return unauth;

  try {
    const body = await req.json();
    const parsed = ServicesSettingsSchema.parse(body);
    const saved = await settingsStore().setServices(parsed);
    return Response.json(saved);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: "Invalid services payload", reason }), { status: 400 });
  }
}

