import type { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { memorizeValue } from "@/lib/memory/service";
import { getMemoryStore } from "@/lib/memory/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const store = await getMemoryStore();
  const memories = await store.list();
  return Response.json({ memories });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const body = (await req.json()) as { label?: string; content?: string; conversationId?: string };
    if (!body.label || !body.content || !body.conversationId) {
      return new Response(JSON.stringify({ error: "`label`, `content`, and `conversationId` are required" }), {
        status: 400
      });
    }

    const result = await memorizeValue({
      label: body.label,
      content: body.content,
      conversationId: body.conversationId
    });

    return Response.json({
      outcome: result.outcome,
      memory: result.memory,
      predecessorId: result.predecessorId
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 400 });
  }
}


