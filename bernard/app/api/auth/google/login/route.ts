import type { NextRequest } from "next/server";

import { startOAuthLogin } from "@/lib/auth/oauth";

export async function GET(req: NextRequest) {
  return startOAuthLogin("google", req);
}