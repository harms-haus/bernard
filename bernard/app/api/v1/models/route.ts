import { NextResponse } from "next/server";

import { listModels } from "@/app/api/v1/_lib/openai";
import { getCorsHeaders } from "@/app/api/_lib/cors";

export const runtime = "nodejs";

// GET handler with CORS support
export function GET(request: Request) {
  const response = NextResponse.json({
    object: "list",
    data: listModels()
  });

  // Apply CORS headers to allow all origins
  const corsHeaders = getCorsHeaders(null);
  for (const [key, value] of Object.entries(corsHeaders)) {
    if (value) {
      response.headers.set(key, value);
    }
  }

  return response;
}

// OPTIONS handler for CORS preflight
export function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(null)
  });
}

