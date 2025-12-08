import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function POST() {
  return new NextResponse(JSON.stringify({ error: "Embeddings are not supported in Bernard" }), { status: 501 });
}

