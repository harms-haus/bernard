import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getCorsHeaders } from "@/app/api/_lib/cors";

export const runtime = "nodejs";

// OPTIONS handler for CORS preflight
export function OPTIONS(_request: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(null)
  });
}

export function POST(_req: NextRequest) {
  // Temporarily disabled during chat completions overhaul
  return new NextResponse(JSON.stringify({
    error: "Completions endpoint temporarily disabled during agentic loop overhaul"
  }), {
    status: 501,
    headers: getCorsHeaders(null)
  });
}
