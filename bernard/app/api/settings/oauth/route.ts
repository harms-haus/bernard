import type { NextRequest } from "next/server";

import { ensureAdmin, settingsStore } from "@/app/api/settings/_common";
import { OAuthSettingsSchema } from "@/lib/config/settingsStore";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const unauth = await ensureAdmin(req);
  if (unauth) return unauth;

  const store = settingsStore();
  const oauth = await store.getOAuth();
  return Response.json(oauth);
}

export async function PUT(req: NextRequest) {
  const unauth = await ensureAdmin(req);
  if (unauth) return unauth;

  try {
    const body = await req.json();
    const parsed = OAuthSettingsSchema.parse(body);
    const saved = await settingsStore().setOAuth(parsed);
    return Response.json(saved);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: "Invalid oauth payload", reason }), { status: 400 });
  }
}

