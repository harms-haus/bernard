import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getCorsHeaders } from "@/app/api/_lib/cors";

export const runtime = "nodejs";

// OPTIONS handler for CORS preflight
export function OPTIONS(request: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(null)
  });
}

export function POST(request: NextRequest) {
  return new NextResponse(JSON.stringify({ error: "Moderations are not supported in Bernard" }), {
    status: 501,
    headers: getCorsHeaders(null)
  });
}

