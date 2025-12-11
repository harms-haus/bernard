import type { NextRequest } from "next/server";

import { handleOAuthCallback } from "@/lib/auth/oauth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleOAuthCallback("google", req);
}

