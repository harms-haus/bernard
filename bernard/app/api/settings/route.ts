import type { NextRequest } from "next/server";

import { ensureAdmin, settingsStore } from "@/app/api/settings/_common";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const unauth = await ensureAdmin(req);
  if (unauth) return unauth;

  const store = settingsStore();
  const settings = await store.getAll();
  return Response.json(settings);
}

