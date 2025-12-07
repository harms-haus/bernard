import type { NextRequest } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedUser(req);
  if (!auth) {
    return new Response(JSON.stringify({ user: null }), { status: 401 });
  }
  return Response.json({ user: auth.user });
}

