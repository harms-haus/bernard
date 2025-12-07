import type { NextRequest } from "next/server";

import { handleOAuthCallback } from "@/lib/oauth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleOAuthCallback("google", req);
}

