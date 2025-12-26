import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";

import { BERNARD_MODEL_ID, listModels } from "@/app/api/v1/_lib/openai";
import { getCorsHeaders } from "@/app/api/_lib/cors";

export const runtime = "nodejs";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = listModels().find((m) => m.id === id);
  if (!model) {
    return new NextResponse(JSON.stringify({ error: "Model not found", allowed: BERNARD_MODEL_ID }), {
      status: 404,
      headers: getCorsHeaders(null)
    });
  }

  const response = NextResponse.json(model);
  const corsHeaders = getCorsHeaders(null);
  for (const [key, value] of Object.entries(corsHeaders)) {
    if (value) {
      response.headers.set(key, value);
    }
  }
  return response;
}

// OPTIONS handler for CORS preflight
export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(null)
  });
}

