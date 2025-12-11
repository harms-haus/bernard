import type { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { getMemoryStore } from "@/lib/memoryStore";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  if (!(await requireAdmin(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const store = await getMemoryStore();
  const { id } = await params;
  const memory = await store.getMemory(id);
  if (!memory) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }
  return Response.json({ memory });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  if (!(await requireAdmin(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const store = await getMemoryStore();
  const { id } = await params;
  try {
    const body = (await req.json()) as {
      label?: string;
      content?: string;
      conversationId?: string;
      successorId?: string | null;
      refresh?: boolean;
    };

    if (body.refresh) {
      const refreshed = await store.refreshMemory(id);
      if (!refreshed) {
        return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
      }
      return Response.json({ memory: refreshed });
    }

    if (!body.label && !body.content && !body.conversationId && body.successorId === undefined) {
      return new Response(JSON.stringify({ error: "No updates provided" }), { status: 400 });
    }

    const updated = await store.updateMemory(id, {
      ...(body.label ? { label: body.label } : {}),
      ...(body.content ? { content: body.content } : {}),
      ...(body.conversationId ? { conversationId: body.conversationId } : {}),
      ...(body.successorId !== undefined ? { successorId: body.successorId ?? undefined } : {})
    });

    if (!updated) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }

    return Response.json({ memory: updated });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  if (!(await requireAdmin(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const store = await getMemoryStore();
  const { id } = await params;
  await store.deleteMemory(id);
  return Response.json({ removed: true });
}


