import type { NextRequest } from "next/server";

import { startOAuthLogin } from "@/lib/auth/oauth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    return await startOAuthLogin("default", req);
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message ?? "Unable to start login" }), {
      status: 500
    });
  }
}

