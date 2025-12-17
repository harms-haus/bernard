import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getCorsHeaders } from "@/app/api/_lib/cors";

export const runtime = "nodejs";

// CORS headers for OpenAI API compatibility
function getCorsHeadersForRequest(request: NextRequest): HeadersInit {
  const origin = request.headers.get('origin');
  return getCorsHeaders(origin);
}

// OPTIONS handler for CORS preflight
export function OPTIONS(request: NextRequest): NextResponse {
  const corsHeaders = getCorsHeadersForRequest(request);
  
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders
  });
}

export function POST(request: NextRequest) {
  const corsHeaders = getCorsHeadersForRequest(request);
  
  return new NextResponse(JSON.stringify({ error: "Moderations are not supported in Bernard" }), {
    status: 501,
    headers: corsHeaders
  });
}

