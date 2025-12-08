import { NextResponse } from "next/server";

import { listModels } from "@/app/api/v1/_lib/openai";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({
    object: "list",
    data: listModels()
  });
}

