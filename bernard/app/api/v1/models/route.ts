import { NextResponse } from "next/server";

import { listModels } from "@/app/api/v1/_lib/openai";
import { getCorsHeaders } from "@/app/api/_lib/cors";

export const runtime = "nodejs";

// GET handler with CORS support
export function GET(request: Request) {
  // Handle both direct calls (tests) and normal requests
  const origin = request.headers.get('origin') || null;
  const corsHeaders = getCorsHeaders(origin);
  
  const response = NextResponse.json({
    object: "list",
    data: listModels()
  });
  
  // Apply CORS headers
  for (const [key, value] of Object.entries(corsHeaders)) {
    if (value) {
      response.headers.set(key, value);
    }
  }
  
  return response;
}

// OPTIONS handler for CORS preflight
export function OPTIONS(request: Request) {
  const origin = request.headers.get('origin') || null;
  const corsHeaders = getCorsHeaders(origin);
  
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders
  });
}

