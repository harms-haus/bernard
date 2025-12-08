import { NextResponse } from "next/server";

import { BERNARD_MODEL_ID, listModels } from "@/app/api/v1/_lib/openai";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const model = listModels().find((m) => m.id === params.id);
  if (!model) {
    return new NextResponse(JSON.stringify({ error: "Model not found", allowed: BERNARD_MODEL_ID }), { status: 404 });
  }
  return NextResponse.json(model);
}

