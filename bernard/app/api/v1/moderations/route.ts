import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return new NextResponse(JSON.stringify({ error: "Moderations are not supported in Bernard" }), { status: 501 });
}

